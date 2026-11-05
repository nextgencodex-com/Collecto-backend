import { z } from "zod";
import { customerId, riderId } from "../../utils/ids.js";
import { money } from "../../utils/money.js";
import { isoDate, prefixedId } from "../../utils/schemas.js";
import { freq } from "../products/products.schema.js";

export const createItemBody = z.object({
  customerId: prefixedId(customerId, "Select a customer."),
  code: z.string().trim().toUpperCase().min(1, "Select a product."),
  price: money("Enter a valid price."),
  freq,
  period: z.coerce
    .number({ error: "Enter the payment period in months." })
    .int("Enter the payment period in months.")
    .positive("Enter the payment period in months.")
    .max(600),
  amount: money("Amount per payment must be more than 0 and not more than the price."),
  start: isoDate("Choose a start date."),
  riderId: prefixedId(riderId, "Assign a rider."),
});

export const listItemsQuery = z.object({
  customerId: prefixedId(customerId, "Invalid customer.").optional(),
});
