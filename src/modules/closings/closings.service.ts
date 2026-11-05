import { inTransaction } from "../../config/database.js";
import { deriveAll } from "../../domain/adapters.js";
import { toPaise } from "../../domain/schedule.js";
import type { AuthUser } from "../../types/express.js";
import { isoDate, nowHHmm, toDbDate, today } from "../../utils/dates.js";
import { closingDto } from "../../utils/dto.js";
import { HttpError } from "../../utils/http.js";
import { dec, fmtRs, signedRs } from "../../utils/money.js";
import { loadCore } from "../bootstrap/bootstrap.repository.js";
import * as notifications from "../notifications/notifications.repository.js";
import * as repo from "./closings.repository.js";

const sum = (a: number[]) => a.reduce((x, y) => x + y, 0);

/**
 * Daily closing. Expected / collected / pending / count are computed here from the ledger
 * (same definitions as the rider app's home screen), never taken from the client.
 */
export async function submit(rider: AuthUser, input: { cash: number; note: string }) {
  const date = today();
  if (await repo.findForDay(rider.id, toDbDate(date)))
    throw new HttpError(409, "The daily closing has already been submitted for today.");

  const { customers, items, payments } = await loadCore(rider.id);
  const d = deriveAll(
    items,
    payments,
    customers.map((c) => c.id),
    date,
  );
  const mine = [...d.customers.values()];
  const todays = payments.filter((p) => p.riderId === rider.id && isoDate(p.date) === date);

  const expected = sum(mine.map((c) => c.expectedToday));
  const pending = sum(mine.map((c) => c.dueNow));
  const collected = sum(todays.map((p) => toPaise(p.amount)));
  const cash = toPaise(input.cash);
  const diff = cash - collected;
  const note = input.note.trim();
  if (diff !== 0 && !note)
    throw new HttpError(
      422,
      "Cash differs from collected amount. Add a note explaining the difference.",
    );

  const time = nowHHmm();
  const closing = await inTransaction(async (tx) => {
    const c = await repo.create(
      {
        riderId: rider.id,
        date: toDbDate(date),
        time,
        expected: dec(expected),
        collected: dec(collected),
        pending: dec(pending),
        cash: dec(cash),
        count: todays.length,
        note,
      },
      tx,
    );
    await notifications.createForOwner(
      {
        type: "CLOSING",
        title: "Daily closing submitted",
        text: `${rider.name} · collected ${fmtRs(collected)}, cash submitted ${fmtRs(cash)}${diff ? ` (difference ${signedRs(diff)})` : ""}`,
      },
      tx,
    );
    return c;
  });
  return closingDto(closing);
}

export async function list(user: AuthUser) {
  return (await repo.list(user.role === "RIDER" ? user.id : undefined)).map(closingDto);
}
