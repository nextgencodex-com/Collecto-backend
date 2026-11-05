import { deriveAll, toItemInput, toPayInput } from "../../domain/adapters.js";
import { STATUS_LABEL, expectedOn } from "../../domain/installments.js";
import { addDays, addMonths, cumulativePaise } from "../../domain/schedule.js";
import { fd, isoDate, today } from "../../utils/dates.js";
import { fmtRs } from "../../utils/money.js";
import {
  loadPaymentsBetween,
  loadPeople,
  loadPriorPaid,
} from "../bootstrap/bootstrap.repository.js";
import * as riders from "../riders/riders.repository.js";

export type ReportType = "daily" | "monthly" | "person" | "item" | "rider" | "overdue";
export interface Cell {
  v: string;
  right?: boolean;
}
export interface Report {
  title: string;
  cols: Cell[];
  rows: Cell[][];
  summary: { label: string; value: string }[];
}

const sum = (a: number[]) => a.reduce((x, y) => x + y, 0);
const pct = (a: number, b: number) =>
  b > 0 ? Math.min(100, Math.round((a / b) * 100)) : a > 0 ? 100 : 0;
const L = (v: string | number): Cell => ({ v: String(v) });
const R = (v: string | number): Cell => ({ v: String(v), right: true });

export async function build(
  type: ReportType,
  opts: { date?: string; month?: string },
): Promise<Report> {
  const t = today();
  const date = opts.date ?? t;
  const month = opts.month ?? t.slice(0, 7);

  // Each report reads only the payments it needs; the rest of the history arrives as per-item totals
  // (`prior`), which is all the status/balance/expected maths uses.
  const ymd = (s: string) => new Date(`${s}T00:00:00.000Z`);
  const monthStart = (s: string) => s.slice(0, 7) + "-01";
  const monthEnd = (m: string) => addDays(addMonths(m + "-01", 1), -1);
  /** [from, to] range of payment rows, and the date before which payments are summarised. */
  const range =
    type === "daily"
      ? { from: date, to: date }
      : type === "rider"
        ? { from: monthStart(date), to: date }
        : type === "monthly"
          ? { from: month + "-01", to: monthEnd(month) }
          : null;
  const needsCurrent = type !== "daily" && type !== "rider"; // statuses as of today

  const [{ customers, items }, riderRows, rangePayments, priorBeforeRange, current] =
    await Promise.all([
      loadPeople(),
      riders.listRiders(),
      range ? loadPaymentsBetween(ymd(range.from), ymd(range.to)) : Promise.resolve([]),
      range ? loadPriorPaid(ymd(range.from)) : Promise.resolve(new Map<number, number>()),
      needsCurrent
        ? Promise.all([loadPaymentsBetween(ymd(t)), loadPriorPaid(ymd(t))])
        : Promise.resolve(null),
    ]);
  const payments = rangePayments;
  const d = (
    current
      ? deriveAll(
          items,
          current[0],
          customers.map((c) => c.id),
          t,
          current[1],
        )
      : null
  ) as ReturnType<typeof deriveAll>; // only the branches that need today's statuses touch it
  const cust = new Map(customers.map((c) => [c.id, c]));
  const rider = new Map(riderRows.map((r) => [r.id, r]));
  const itemRow = new Map(items.map((i) => [i.id, i]));
  const cn = (id: number) => cust.get(id)?.name ?? "—";
  const rn = (id: number) => rider.get(id)?.name ?? "—";
  const iname = (id: number) => {
    const i = itemRow.get(id);
    return i ? `${i.code} · ${i.name}` : "—";
  };
  const pays = payments.map(toPayInput);
  const inputs = items.map((i) => toItemInput(i, { priorPaise: priorBeforeRange.get(i.id) ?? 0 }));
  const inputOf = new Map(inputs.map((x) => [x.id, x]));
  // expectedOn needs each item's own payments; handing it the whole ledger made reports O(items x payments)
  const paysByItem = new Map<number, typeof pays>();
  for (const p of pays)
    (paysByItem.get(p.itemId) ?? paysByItem.set(p.itemId, []).get(p.itemId)!).push(p);
  const expected = (it: (typeof inputs)[number], on: string) =>
    expectedOn(it, on, paysByItem.get(it.id) ?? []);
  const payDate = (i: number) => isoDate(payments[i]!.date);

  let title: string;
  let cols: Cell[];
  let rows: Cell[][];
  let summary: [string, string | number][] = [];

  if (type === "daily") {
    const idx = payments.map((_, i) => i).filter((i) => payDate(i) === date);
    title = "Daily collection report · " + fd(date);
    cols = [L("Transaction"), L("Time"), L("Customer"), L("Item"), L("Rider"), R("Amount")];
    rows = idx.map((i) => {
      const p = payments[i]!;
      return [
        L(p.txn),
        L(p.time),
        L(cn(p.customerId)),
        L(iname(p.itemId)),
        L(rn(p.riderId)),
        R(fmtRs(pays[i]!.paise)),
      ];
    });
    const exp = sum(inputs.map((it) => expected(it, date)));
    const col = sum(idx.map((i) => pays[i]!.paise));
    summary = [
      ["Expected", fmtRs(exp)],
      ["Collected", fmtRs(col)],
      ["Difference", fmtRs(col - exp)],
      ["Payments", idx.length],
    ];
  } else if (type === "monthly") {
    const idx = payments.map((_, i) => i).filter((i) => payDate(i).startsWith(month));
    const by = new Map<string, number[]>();
    for (const i of idx)
      (by.get(payDate(i)) ?? by.set(payDate(i), []).get(payDate(i))!).push(pays[i]!.paise);
    title =
      "Monthly collection report · " +
      new Date(month + "-01T00:00:00Z").toLocaleDateString("en-GB", {
        month: "long",
        year: "numeric",
        timeZone: "UTC",
      });
    cols = [L("Date"), R("Payments"), R("Collected")];
    rows = [...by.keys()]
      .sort()
      .map((k) => [L(fd(k)), R(by.get(k)!.length), R(fmtRs(sum(by.get(k)!)))]);
    let due = 0,
      done = 0,
      over = 0;
    for (const c of d.calcItems) {
      const it = inputOf.get(c.id)!;
      const cum = cumulativePaise(it);
      c.dates.forEach((dt, i) => {
        if (!dt.startsWith(month)) return;
        due++;
        if (cum(i) <= c.paid) done++;
        else if (dt < t) over++;
      });
    }
    summary = [
      ["Collected", fmtRs(sum(idx.map((i) => pays[i]!.paise)))],
      ["Installments due", due],
      ["Completed", done],
      ["Overdue", over],
    ];
  } else if (type === "person") {
    title = "Person-wise outstanding report";
    cols = [
      L("Customer"),
      L("NIC"),
      L("Rider"),
      R("Active items"),
      R("Total"),
      R("Paid"),
      R("Balance"),
      R("Overdue"),
    ];
    const list = customers
      .map((c) => ({ c, a: d.customers.get(c.id)! }))
      .filter((x) => x.a.balance > 0)
      .sort((x, y) => y.a.balance - x.a.balance);
    rows = list.map(({ c, a }) => [
      L(c.name),
      L(c.nic),
      L(rn(c.riderId)),
      R(a.activeItems),
      R(fmtRs(a.total)),
      R(fmtRs(a.paid)),
      R(fmtRs(a.balance)),
      R(fmtRs(a.overdue)),
    ]);
    const all = [...d.customers.values()];
    summary = [
      ["Customers with balance", rows.length],
      ["Total outstanding", fmtRs(sum(all.map((c) => c.balance)))],
      ["Total overdue", fmtRs(sum(all.map((c) => c.overdue)))],
    ];
  } else if (type === "item") {
    title = "Item-wise balance report";
    cols = [
      L("Item"),
      L("Customer"),
      R("Price"),
      R("Paid"),
      R("Balance"),
      L("Next due"),
      L("Status"),
    ];
    rows = d.calcItems.map((c) => [
      L(iname(c.id)),
      L(cn(c.customerId)),
      R(fmtRs(c.pricePaise)),
      R(fmtRs(c.paid)),
      R(fmtRs(c.balance)),
      L(c.next ? fd(c.next) : "—"),
      L(STATUS_LABEL[c.status]),
    ]);
    summary = [
      ["Items", d.calcItems.length],
      ["Completed", d.calcItems.filter((c) => c.status === "DONE").length],
      ["Outstanding value", fmtRs(sum(d.calcItems.map((c) => c.balance)))],
    ];
  } else if (type === "rider") {
    const m = date.slice(0, 7);
    title = "Rider performance · " + fd(date);
    cols = [
      L("Rider"),
      L("Area"),
      R("Customers"),
      R("Expected"),
      R("Collected"),
      R("Rate"),
      R("Month to date"),
    ];
    rows = riderRows.map((r) => {
      const e = sum(
        inputs.filter((it) => itemRow.get(it.id)!.riderId === r.id).map((it) => expected(it, date)),
      );
      const ofRider = payments.map((p, i) => ({ p, i })).filter(({ p }) => p.riderId === r.id);
      const c = sum(ofRider.filter(({ i }) => payDate(i) === date).map(({ i }) => pays[i]!.paise));
      const mtd = sum(
        ofRider
          .filter(({ i }) => payDate(i).startsWith(m) && payDate(i) <= date)
          .map(({ i }) => pays[i]!.paise),
      );
      return [
        L(r.name),
        L(r.area ?? ""),
        R(customers.filter((x) => x.riderId === r.id).length),
        R(fmtRs(e)),
        R(fmtRs(c)),
        R(pct(c, e) + "%"),
        R(fmtRs(mtd)),
      ];
    });
  } else {
    title = "Overdue installments report";
    cols = [
      L("Customer"),
      L("Phone"),
      L("Item"),
      L("Rider"),
      R("Missed"),
      R("Overdue amount"),
      L("Oldest due"),
    ];
    const over = d.calcItems.filter((c) => c.overdue > 0).sort((a, b) => b.overdue - a.overdue);
    rows = over.map((c) => {
      const cu = cust.get(c.customerId)!;
      return [
        L(cu.name),
        L(cu.phone),
        L(iname(c.id)),
        L(rn(cu.riderId)),
        R(c.missed),
        R(fmtRs(c.overdue)),
        L(fd(c.oldest)),
      ];
    });
    summary = [
      ["Overdue items", rows.length],
      ["Overdue amount", fmtRs(sum(d.calcItems.map((c) => c.overdue)))],
    ];
  }

  return {
    title,
    cols,
    rows,
    summary: summary.map(([label, value]) => ({ label, value: String(value) })),
  };
}

export function toCsv(r: Report): string {
  const esc = (v: string) => '"' + v.replace(/"/g, '""') + '"';
  return [
    r.cols.map((c) => esc(c.v)).join(","),
    ...r.rows.map((x) => x.map((c) => esc(c.v)).join(",")),
  ].join("\n");
}
