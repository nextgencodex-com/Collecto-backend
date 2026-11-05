import { z } from "zod";
import { money } from "../../utils/money.js";

export const freq = z.enum(["weekly", "monthly"]);

export const createProductBody = z.object({
  code: z.string().trim().toUpperCase().min(1, "Enter an item code.").max(30),
  name: z.string().trim().min(1, "Enter the item name.").max(120),
  purchase: money("Enter purchase, cash and installment prices."),
  cash: money("Enter purchase, cash and installment prices."),
  price: money("Enter purchase, cash and installment prices."),
  freq,
  amount: money("Enter the default plan (period and amount per payment)."),
  period: z.coerce
    .number({ error: "Enter the default plan (period and amount per payment)." })
    .int("Enter the default plan (period and amount per payment).")
    .positive("Enter the default plan (period and amount per payment).")
    .max(600),
  stock: z.coerce
    .number({ error: "Stock must be a whole number." })
    .int("Stock must be a whole number.")
    .min(0, "Stock must be a whole number.")
    .max(1_000_000),
});

export const stockBody = z.object({
  qty: z.coerce
    .number({ error: "Enter a whole number greater than 0." })
    .int("Enter a whole number greater than 0.")
    .positive("Enter a whole number greater than 0.")
    .max(1_000_000),
});

export const codeParam = z.object({ code: z.string().trim().toUpperCase().min(1) });
