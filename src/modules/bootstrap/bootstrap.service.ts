import type { AuthUser } from "../../types/express.js";
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
 */
export async function bootstrap(user: AuthUser) {
  const [shop, owner] = await repo.loadShopAndOwner();

  if (user.role === "OWNER") {
    const [
      { customers, items, payments },
      [riders, products, audit, notifs, closings, extensions],
    ] = await Promise.all([repo.loadCore(), repo.loadOwnerExtras(owner.id)]);
    return {
      shop: shopDto(shop),
      owner: ownerDto(owner),
      riders: riders.map(riderDto),
      products: products.map(productDto),
      customers: customers.map(customerDto),
      items: items.map(itemDto),
      payments: payments.map(paymentDto),
      audit: audit.map(auditDto),
      notifs: notifs.map(notificationDto),
      closings: closings.map(closingDto),
      extensions: extensions.map(extensionDto),
    };
  }

  const me = await repo.findUser(user.id);
  const { customers, items, payments } = await repo.loadCore(user.id);
  const [closings, extensions] = await repo.loadRiderExtras(
    user.id,
    customers.map((c) => c.id),
  );
  return {
    shop: shopDto(shop),
    owner: { name: owner.name, email: "", username: "", photo: photoUrl(owner.photoPath) },
    riders: [riderDto(me)],
    products: [],
    customers: customers.map(customerDto),
    items: items.map(itemDto),
    payments: payments.map(paymentDto),
    audit: [],
    notifs: [],
    closings: closings.map(closingDto),
    extensions: extensions.map(extensionDto),
  };
}
