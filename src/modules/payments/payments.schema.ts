import { z } from "zod";
import { customerId, itemId, paymentId, riderId } from "../../utils/ids.js";
import { money } from "../../utils/money.js";
import { isoDate, pageQuery, prefixedId } from "../../utils/schemas.js";

export const recordPaymentsBody = z.object({
  customerId: prefixedId(customerId, "Customer not found."),
  lines: z
    .array(
      z.object({
        itemId: prefixedId(itemId, "Item not found."),
        amount: money("Enter a valid amount."),
      }),
    )
    .min(1, "Enter at least one payment.")
    .max(50),
});

export const correctPaymentBody = z.object({
  amount: money("Enter a valid amount."),
  reason: z.string().trim().min(5, "A reason is required for every correction.").max(250),
});

export const idParam = z.object({ id: prefixedId(paymentId, "Payment not found.") });

export const listPaymentsQuery = pageQuery.extend({
  date: isoDate().optional(),
  riderId: prefixedId(riderId, "Invalid rider.").optional(),
  customerId: prefixedId(customerId, "Invalid customer.").optional(),
  itemId: prefixedId(itemId, "Invalid item.").optional(),
});
