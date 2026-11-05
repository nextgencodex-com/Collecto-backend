import { Router } from "express";
import { z } from "zod";
import { authenticate } from "../../middlewares/authenticate.js";
import { authorize } from "../../middlewares/authorize.js";
import { validate } from "../../middlewares/validate.js";
import { ok } from "../../utils/http.js";
import { moneyOrZero } from "../../utils/money.js";
import * as service from "./closings.service.js";

export const closingRoutes = Router();
closingRoutes.use(authenticate);

// Totals are computed on the server; any expected/collected/pending/count sent by a client is ignored.
const body = z.object({
  cash: moneyOrZero("Enter the cash amount you are submitting."),
  note: z.string().trim().max(500).default(""),
});

closingRoutes.post("/", authorize("RIDER"), validate({ body }), async (req, res) => {
  ok(res, await service.submit(req.user!, req.body), "Daily closing submitted", 201);
});

closingRoutes.get("/", async (req, res) => {
  ok(res, await service.list(req.user!));
});
