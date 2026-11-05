import { shopDto } from "../../utils/dto.js";
import * as repo from "./shop.repository.js";

export const get = async () => shopDto(await repo.get());

export const update = async (data: { name?: string; phone?: string; address?: string }) =>
  shopDto(await repo.update(data));
