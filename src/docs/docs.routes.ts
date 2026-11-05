import { Router } from "express";
import swaggerUi from "swagger-ui-express";
import { buildOpenApiDocument } from "./openapi.js";

/** Mounted before helmet in app.ts: Swagger UI needs inline scripts that the strict CSP would block. */
export function docsRoutes() {
  const r = Router();
  const spec = buildOpenApiDocument();
  r.get("/openapi.json", (_req, res) => void res.json(spec));
  r.use("/", swaggerUi.serve, swaggerUi.setup(spec, { customSiteTitle: "Collecto API" }));
  return r;
}
