import { env } from "../../config/env.js";
import { addDays, fromPaise } from "../../domain/schedule.js";
import type { Item } from "../../generated/prisma/client.js";
import type { AuthUser } from "../../types/express.js";
import { toDbDate, today } from "../../utils/dates.js";
import {
  auditDto,
  closingDto,
  customerDto,
  extensionDto,
  itemDto,
  notificationDto,
  ownerDto,
  paymentDto,
  productDto,
  riderDto,
  shopDto,
} from "../../utils/dto.js";
import { photoUrl } from "../../utils/uploads.js";
import * as repo from "./bootstrap.repository.js";

/**
 * Everything the frontend loads at start-up, in the shape of its `AppData` type, scoped to the
 * caller. Owners get the full dataset; a rider gets only their own customers, items, payments,
 * closings and extensions, and none of the cost prices, audit log or notifications.
 *
 * Payments are windowed: only those dated `paymentsFrom` or later are sent one by one. Every item
 * carries `priorPaid`, the total of its earlier payments, so the client's balance/status maths is
 * unchanged. `paymentDays` 0 disables the window.
 */
export async function bootstrap(user: AuthUser, opts: { paymentDays?: number } = {}) {
  const [shop, owner] = await repo.loadShopAndOwner();
  const t = today();
  const days = opts.paymentDays ?? env.BOOTSTRAP_PAYMENT_DAYS;
  const paymentsFrom = days > 0 ? addDays(t, -days) : null;
  const since = paymentsFrom ? toDbDate(paymentsFrom) : undefined;

  /** Items as the frontend expects them, plus what was paid before the window. */
  const withPrior = async (items: Item[]) => {
    const prior = since
      ? await repo.loadPriorPaid(
          since,
          items.map((i) => i.id),
        )
      : new Map<number, number>();
    return items.map((i) => ({ ...itemDto(i), priorPaid: fromPaise(prior.get(i.id) ?? 0) }));
  };

  if (user.role === "OWNER") {
    const [
      { customers, items, payments },
      [riders, products, audit, notifs, closings, extensions],
    ] = await Promise.all([
      repo.loadCore(undefined, undefined, since),
      repo.loadOwnerExtras(owner.id),
    ]);
    return {
      today: t,
      paymentsFrom,
      shop: shopDto(shop),
      owner: ownerDto(owner),
      riders: riders.map(riderDto),
      products: products.map(productDto),
      customers: customers.map(customerDto),
      items: await withPrior(items),
      payments: payments.map(paymentDto),
      audit: audit.map(auditDto),
      notifs: notifs.map(notificationDto),
      closings: closings.map(closingDto),
      extensions: extensions.map(extensionDto),
    };
  }

  const me = await repo.findUser(user.id);
  const { customers, items, payments } = await repo.loadCore(user.id, undefined, since);
  const [closings, extensions] = await repo.loadRiderExtras(
    user.id,
    customers.map((c) => c.id),
  );
  return {
    today: t,
    paymentsFrom,
    shop: shopDto(shop),
    owner: { name: owner.name, email: "", username: "", photo: photoUrl(owner.photoPath) },
    riders: [riderDto(me)],
    products: [],
    customers: customers.map(customerDto),
    items: await withPrior(items),
    payments: payments.map(paymentDto),
    audit: [],
    notifs: [],
    closings: closings.map(closingDto),
    extensions: extensions.map(extensionDto),
  };
}
