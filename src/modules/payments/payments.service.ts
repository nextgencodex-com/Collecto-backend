import { inTransaction } from "../../config/database.js";
import { fromPaise, toPaise } from "../../domain/schedule.js";
import type { AuthUser } from "../../types/express.js";
import { nowHHmm, toDbDate, today } from "../../utils/dates.js";
import { paymentDto } from "../../utils/dto.js";
import { HttpError } from "../../utils/http.js";
import { customerId } from "../../utils/ids.js";
import { dec, fmtRs, num } from "../../utils/money.js";
import * as audit from "../audit/audit.repository.js";
import * as customers from "../customers/customers.repository.js";
import * as items from "../items/items.repository.js";
import * as notifications from "../notifications/notifications.repository.js";
import * as repo from "./payments.repository.js";

const txnId = (date: string, seq: number) =>
  "TX" + date.replace(/-/g, "").slice(2) + "-" + String(seq).padStart(4, "0");

/** The receipt the rider app shows after collecting (matches the frontend's LastTx). */
export interface Receipt {
  cust: string;
  custId: string;
  phone: string;
  total: number;
  time: string;
  date: string;
  rider: string;
  lines: { txn: string; item: string; amount: number }[];
}

export async function record(
  rider: AuthUser,
  input: { customerId: number; lines: { itemId: number; amount: number }[] },
) {
  const customer = await customers.findById(input.customerId, rider.id); // own customers only
  if (!customer) throw new HttpError(404, "Customer not found.");

  // Several lines for the same item are one payment against that item's balance.
  const wanted = new Map<number, number>();
  for (const l of input.lines)
    wanted.set(l.itemId, (wanted.get(l.itemId) ?? 0) + toPaise(l.amount));
  const ids = [...wanted.keys()].sort((a, b) => a - b);

  const date = today();
  const time = nowHHmm();

  const { rows, itemByid } = await inTransaction(async (tx) => {
    await repo.lockItems(ids, tx);
    const found = await items.findForCustomer(input.customerId, ids, tx);
    if (found.length !== ids.length)
      throw new HttpError(422, "One of the items does not belong to this customer.");
    const paid = await repo.paidByItem(ids, tx);

    for (const it of found) {
      const balance = toPaise(it.price) - (paid.get(it.id) ?? 0);
      const amt = wanted.get(it.id)!;
      if (amt > balance)
        throw new HttpError(
          422,
          balance <= 0
            ? `${it.code} · ${it.name} is already fully paid.`
            : `Payment of ${fmtRs(amt)} exceeds the remaining balance of ${fmtRs(balance)} for ${it.code} · ${it.name}.`,
        );
    }

    const seqs = await repo.nextIds(ids.length, tx);
    const created = await repo.createMany(
      ids.map((itemId, k) => ({
        id: seqs[k]!,
        txn: txnId(date, seqs[k]!),
        itemId,
        customerId: input.customerId,
        riderId: rider.id,
        amount: dec(wanted.get(itemId)!),
        date: toDbDate(date),
        time,
      })),
      tx,
    );
    const totalPaise = [...wanted.values()].reduce((a, b) => a + b, 0);
    await notifications.createForOwner(
      {
        type: "PAYMENT",
        title: "Payment received",
        text: `${fmtRs(totalPaise)} from ${customer.name} · ${rider.name}`,
      },
      tx,
    );
    return { rows: created, itemByid: new Map(found.map((i) => [i.id, i])) };
  });

  const receipt: Receipt = {
    cust: customer.name,
    custId: customerId.format(customer.id),
    phone: customer.phone,
    total: fromPaise(rows.reduce((a, p) => a + toPaise(p.amount), 0)),
    time,
    date,
    rider: rider.name,
    lines: rows.map((p) => ({
      txn: p.txn,
      item: `${itemByid.get(p.itemId)!.code} · ${itemByid.get(p.itemId)!.name}`,
      amount: num(p.amount),
    })),
  };
  return receipt;
}

export async function correct(
  owner: AuthUser,
  id: number,
  input: { amount: number; reason: string },
) {
  const existing = await repo.findWithItem(id);
  if (!existing) throw new HttpError(404, "Payment not found.");

  return inTransaction(async (tx) => {
    await repo.lockItems([existing.itemId], tx);
    const p = await repo.findWithItem(id, tx); // re-read under the lock
    if (!p) throw new HttpError(404, "Payment not found.");

    const oldP = toPaise(p.amount);
    const newP = toPaise(input.amount);
    if (newP === oldP)
      throw new HttpError(422, "The new amount is the same as the current amount.");

    const paid = (await repo.paidByItem([p.itemId], tx)).get(p.itemId) ?? 0;
    if (paid - oldP + newP > toPaise(p.item.price))
      throw new HttpError(
        422,
        `The corrected amount would exceed the item price of ${fmtRs(toPaise(p.item.price))}.`,
      );

    const updated = await repo.updateAmount(id, dec(newP), tx);
    await audit.create(
      {
        userId: owner.id,
        action: "Payment amount corrected",
        txn: p.txn,
        ref: p.customer.name,
        old: fmtRs(oldP),
        nw: fmtRs(newP),
        reason: input.reason,
      },
      tx,
    );
    return paymentDto(updated);
  });
}

export async function list(
  user: AuthUser,
  f: {
    date?: string;
    riderId?: number;
    customerId?: number;
    itemId?: number;
    page: number;
    pageSize: number;
  },
) {
  const { rows, total } = await repo.list({
    riderId: user.role === "RIDER" ? user.id : f.riderId,
    customerId: f.customerId,
    itemId: f.itemId,
    date: f.date ? toDbDate(f.date) : undefined,
    skip: (f.page - 1) * f.pageSize,
    take: f.pageSize,
  });
  return { rows: rows.map(paymentDto), total };
}
