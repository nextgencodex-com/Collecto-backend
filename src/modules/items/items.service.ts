import { inTransaction } from "../../config/database.js";
import type { AuthUser } from "../../types/express.js";
import { toDbDate } from "../../utils/dates.js";
import { itemDto } from "../../utils/dto.js";
import { HttpError } from "../../utils/http.js";
import { dec, paise } from "../../utils/money.js";
import * as customers from "../customers/customers.repository.js";
import * as products from "../products/products.repository.js";
import * as riders from "../riders/riders.repository.js";
import * as repo from "./items.repository.js";

export async function create(i: {
  customerId: number;
  code: string;
  price: number;
  freq: "weekly" | "monthly";
  period: number;
  amount: number;
  start: string;
  riderId?: number;
}) {
  if (paise(i.amount) > paise(i.price))
    throw new HttpError(422, "Amount per payment must be more than 0 and not more than the price.");
  const customer = await customers.findById(i.customerId);
  if (!customer) throw new HttpError(404, "Customer not found.");
  const product = await products.find(i.code);
  if (!product) throw new HttpError(422, "Select a product.");
  // An item always belongs to its customer's rider (collections, closings and reports all assume it).
  if (i.riderId !== undefined && i.riderId !== customer.riderId)
    throw new HttpError(
      422,
      "The item's rider must be the customer's rider. Reassign the customer first.",
    );
  const rider = await riders.findRider(customer.riderId);
  if (!rider || !rider.active)
    throw new HttpError(
      422,
      "This customer's rider is inactive. Reassign the customer to an active rider first.",
    );

  const item = await inTransaction(async (tx) => {
    if (!(await products.takeOne(i.code, tx)))
      throw new HttpError(422, "This product is out of stock. Add stock in Inventory first.");
    return repo.create(
      {
        customerId: i.customerId,
        riderId: customer.riderId,
        code: product.code,
        name: product.name,
        price: dec(paise(i.price)),
        freq: i.freq === "weekly" ? "WEEKLY" : "MONTHLY",
        amount: dec(paise(i.amount)),
        period: i.period,
        start: toDbDate(i.start),
      },
      tx,
    );
  });
  return itemDto(item);
}

export async function list(user: AuthUser, customerId?: number) {
  const rows = await repo.list({
    customerId,
    riderId: user.role === "RIDER" ? user.id : undefined,
  });
  return rows.map(itemDto);
}
