import type { Item, Payment } from "../generated/prisma/client.js";
import { isoDate } from "../utils/dates.js";
import { calcCustomer, calcItem, type CalcCustomer, type CalcItem } from "./installments.js";
import type { ItemInput, PayInput } from "./installments.js";
import { toPaise } from "./schedule.js";

/**
 * `opts` is an object on purpose: `items.map(toItemInput)` passes the array index as the second argument,
 * which must never be mistaken for money.
 */
export const toItemInput = (i: Item, opts: { priorPaise?: number } = {}): ItemInput => ({
  priorPaise: typeof opts === "object" ? (opts.priorPaise ?? 0) : 0,
  id: i.id,
  customerId: i.customerId,
  price: i.price,
  amount: i.amount,
  freq: i.freq,
  start: isoDate(i.start),
});

export const toPayInput = (p: Payment): PayInput => ({
  itemId: p.itemId,
  paise: toPaise(p.amount),
  date: isoDate(p.date),
});

/** Computes every item's status/balances and every customer's aggregate for `today`. */
export function deriveAll(
  items: Item[],
  payments: Payment[],
  customerIds: number[],
  today: string,
  /** itemId -> paise paid before the window `payments` covers (see loadCurrent). */
  prior: Map<number, number> = new Map(),
) {
  const pays = payments.map(toPayInput);
  const byItem = new Map<number, PayInput[]>();
  for (const p of pays) (byItem.get(p.itemId) ?? byItem.set(p.itemId, []).get(p.itemId)!).push(p);
  const calcItems: CalcItem[] = items.map((i) =>
    calcItem(toItemInput(i, { priorPaise: prior.get(i.id) ?? 0 }), byItem.get(i.id) ?? [], today),
  );
  const customers = new Map<number, CalcCustomer>(
    customerIds.map((id) => [id, calcCustomer(id, calcItems)]),
  );
  return { pays, calcItems, customers, itemById: new Map(calcItems.map((c) => [c.id, c])) };
}
