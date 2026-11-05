import { z } from "zod";
import { moneyOrZero } from "../../utils/money.js";

// Totals are computed on the server; any expected/collected/pending/count sent by a client is ignored.
export const submitClosingBody = z.object({
  cash: moneyOrZero("Enter the cash amount you are submitting."),
  note: z.string().trim().max(500).default(""),
});
