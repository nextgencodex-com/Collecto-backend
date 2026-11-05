import { auditDto } from "../../utils/dto.js";
import * as repo from "./audit.repository.js";

export async function list(page: number, pageSize: number) {
  const [rows, total] = await repo.list((page - 1) * pageSize, pageSize);
  return { rows: rows.map(auditDto), total };
}
