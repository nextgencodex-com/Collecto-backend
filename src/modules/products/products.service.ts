import { productDto } from "../../utils/dto.js";
import { HttpError } from "../../utils/http.js";
import { dec, paise } from "../../utils/money.js";
import * as repo from "./products.repository.js";

export async function list() {
  return (await repo.list()).map(productDto);
}

export async function create(i: {
  code: string;
  name: string;
  purchase: number;
  cash: number;
  price: number;
  freq: "weekly" | "monthly";
  amount: number;
  period: number;
  stock: number;
}) {
  if (await repo.find(i.code)) throw new HttpError(409, "This item code already exists.");
  const p = await repo.create({
    code: i.code,
    name: i.name,
    purchase: dec(paise(i.purchase)),
    cash: dec(paise(i.cash)),
    price: dec(paise(i.price)),
    freq: i.freq === "weekly" ? "WEEKLY" : "MONTHLY",
    amount: dec(paise(i.amount)),
    period: i.period,
    stock: i.stock,
  });
  return productDto(p);
}

export async function addStock(code: string, qty: number) {
  if (!(await repo.find(code))) throw new HttpError(404, "Product not found.");
  return productDto(await repo.addStock(code, qty));
}
