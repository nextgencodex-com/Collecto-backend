// OpenAPI 3.1 document, generated from the same Zod schemas the routes validate with,
// so request documentation cannot drift from the real validation rules.
import {
  OpenAPIRegistry,
  OpenApiGeneratorV31,
  extendZodWithOpenApi,
} from "@asteasolutions/zod-to-openapi";
import { z, type ZodType } from "zod";
import { loginBody } from "../modules/auth/auth.schema.js";
import { submitClosingBody } from "../modules/closings/closings.schema.js";
import {
  assignRiderBody,
  createCustomerBody,
  extensionBody,
  idParam as customerIdParam,
  listCustomersQuery,
} from "../modules/customers/customers.schema.js";
import { createItemBody, listItemsQuery } from "../modules/items/items.schema.js";
import { listNotificationsQuery } from "../modules/notifications/notifications.schema.js";
import {
  correctPaymentBody,
  idParam as paymentIdParam,
  listPaymentsQuery,
  recordPaymentsBody,
} from "../modules/payments/payments.schema.js";
import { codeParam, createProductBody, stockBody } from "../modules/products/products.schema.js";
import { reportParams, reportQuery } from "../modules/reports/reports.schema.js";
import { createRiderBody, updateRiderBody } from "../modules/riders/riders.schema.js";
import { updateShopBody } from "../modules/shop/shop.schema.js";
import { pageQuery } from "../utils/schemas.js";
import { riderId } from "../utils/ids.js";
import { prefixedId } from "../utils/schemas.js";

extendZodWithOpenApi(z);

const registry = new OpenAPIRegistry();
registry.registerComponent("securitySchemes", "bearerAuth", {
  type: "http",
  scheme: "bearer",
  bearerFormat: "JWT",
  description: "Access token from POST /auth/login or /auth/refresh (valid 15 minutes).",
});

// ---------- response shapes (mirror src/utils/dto.ts) ----------
const num = z.number();
const str = z.string();
const Rider = z.object({
  id: str,
  name: str,
  phone: str.nullable(),
  area: str.nullable(),
  username: str,
  active: z.boolean(),
  photo: str,
});
const Product = z.object({
  code: str,
  name: str,
  purchase: num,
  cash: num,
  price: num,
  freq: z.enum(["weekly", "monthly"]),
  amount: num,
  period: num,
  stock: num,
  sold: num,
});
const Customer = z.object({
  id: str,
  name: str,
  nic: str,
  phone: str,
  address: str,
  city: str,
  riderId: str,
  lat: num,
  lng: num,
  notes: str,
  photo: str,
  since: str,
});
const Item = z.object({
  id: str,
  customerId: str,
  riderId: str,
  code: str,
  name: str,
  price: num,
  freq: z.enum(["weekly", "monthly"]),
  amount: num,
  period: num,
  start: str,
  priorPaid: num
    .optional()
    .describe(
      "Bootstrap only: total of this item's payments dated before `paymentsFrom` (they are not sent one by one).",
    ),
});
const Payment = z.object({
  id: str,
  txn: str,
  itemId: str,
  customerId: str,
  riderId: str,
  amount: num,
  date: str,
  time: str,
  status: z.enum(["completed", "corrected"]),
});
const Closing = z.object({
  id: str,
  riderId: str,
  date: str,
  time: str,
  expected: num,
  collected: num,
  pending: num,
  cash: num,
  count: num,
  note: str,
});
const Audit = z.object({
  id: str,
  date: str,
  time: str,
  user: str,
  action: str,
  txn: str,
  ref: str,
  old: str,
  nw: str,
  reason: str,
});
const Notification = z.object({
  id: str,
  type: z.enum(["payment", "overdue", "closing", "system"]),
  title: str,
  text: str,
  date: str,
  time: str,
  read: z.boolean(),
});
const Extension = z.object({
  id: str,
  customerId: str,
  riderId: str,
  date: str,
  time: str,
  until: str,
  reason: str,
});
const Receipt = z.object({
  cust: str,
  custId: str,
  phone: str,
  total: num,
  time: str,
  date: str,
  rider: str,
  lines: z.array(z.object({ txn: str, item: str, amount: num })),
});
const Session = z.object({ role: z.enum(["owner", "rider"]), riderId: str.optional() });
const User = z.object({
  id: str,
  role: z.enum(["owner", "rider"]),
  name: str,
  username: str,
  phone: str.nullable(),
  photoUrl: str.nullable(),
});
const Tokens = z.object({
  accessToken: str,
  expiresIn: num.describe("Seconds"),
  session: Session,
  user: User,
});
const Report = z.object({
  title: str,
  cols: z.array(z.object({ v: str, right: z.boolean().optional() })),
  rows: z.array(z.array(z.object({ v: str, right: z.boolean().optional() }))),
  summary: z.array(z.object({ label: str, value: str })),
});

const ok = (data: ZodType) => z.object({ success: z.literal(true), message: str, data });
const list = (data: ZodType) => ok(z.array(data));
const paged = (data: ZodType) =>
  ok(z.array(data)).extend({
    meta: z.object({ total: num, page: num, pageSize: num, pages: num }),
  });
const ErrorBody = z.object({
  success: z.literal(false),
  message: str,
  errors: z.array(z.unknown()),
});
const empty = ok(z.null());

type Auth = "none" | "any" | "owner" | "rider";
interface Doc {
  method: "get" | "post" | "patch" | "put";
  path: string;
  tag: string;
  summary: string;
  auth: Auth;
  params?: z.ZodObject;
  query?: z.ZodObject;
  body?: ZodType;
  multipart?: boolean;
  response?: ZodType;
  status?: number;
  errors?: number[];
}

const AUTH_NOTE: Record<Auth, string> = {
  none: "Public.",
  any: "Any signed-in user.",
  owner: "Owner only.",
  rider: "Rider only.",
};

/** "GET /customers" -> the documented success-response schema; used by tests to catch docs drifting from reality. */
export const documentedResponses = new Map<string, ZodType>();

/** Every documented endpoint with its required role; tests use it to check authorization exhaustively. */
export const documentedRoutes: { method: Doc["method"]; path: string; auth: Auth }[] = [];

function doc(d: Doc) {
  documentedResponses.set(`${d.method.toUpperCase()} ${d.path}`, d.response ?? empty);
  documentedRoutes.push({ method: d.method, path: d.path, auth: d.auth });
  const errors = new Set<number>(d.errors ?? []);
  if (d.auth !== "none") errors.add(401);
  if (d.auth === "owner" || d.auth === "rider") errors.add(403);
  if (d.body || d.query || d.params) errors.add(422);
  registry.registerPath({
    method: d.method,
    path: d.path,
    tags: [d.tag],
    summary: d.summary,
    description: AUTH_NOTE[d.auth],
    security: d.auth === "none" ? [] : [{ bearerAuth: [] }],
    request: {
      params: d.params,
      query: d.query,
      body: d.multipart
        ? {
            required: true,
            content: {
              "multipart/form-data": {
                schema: z.object({
                  photo: z.string().openapi({
                    type: "string",
                    format: "binary",
                    description: "JPEG, PNG or WebP, max 2 MB",
                  }),
                }),
              },
            },
          }
        : d.body
          ? { required: true, content: { "application/json": { schema: d.body } } }
          : undefined,
    },
    responses: {
      [d.status ?? 200]: {
        description: "Success",
        content: { "application/json": { schema: d.response ?? empty } },
      },
      ...Object.fromEntries(
        [...errors].sort().map((c) => [
          c,
          {
            description: ERR[c] ?? "Error",
            content: { "application/json": { schema: ErrorBody } },
          },
        ]),
      ),
    },
  });
}

const ERR: Record<number, string> = {
  400: "Bad request",
  401: "Not signed in, or the token is invalid/expired",
  403: "Not allowed for this role (or origin)",
  404: "Not found (also returned for another rider's resources)",
  409: "Conflict (duplicate or already submitted)",
  413: "File too large",
  422: "Validation failed or a business rule was violated; `message` is user-presentable",
  429: "Too many requests",
};

const riderIdParam = z.object({ id: prefixedId(riderId, "Rider not found.") });

// ---------- auth ----------
doc({
  method: "post",
  path: "/auth/login",
  tag: "Auth",
  summary: "Sign in as owner or rider",
  auth: "none",
  body: loginBody,
  response: ok(Tokens),
  errors: [401, 403, 429],
});
doc({
  method: "post",
  path: "/auth/refresh",
  tag: "Auth",
  summary: "Rotate the refresh cookie and get a new access token",
  auth: "none",
  response: ok(Tokens),
  errors: [401, 403],
});
doc({
  method: "post",
  path: "/auth/logout",
  tag: "Auth",
  summary: "Revoke the current session and clear the cookie",
  auth: "none",
  errors: [403],
});
doc({
  method: "get",
  path: "/auth/me",
  tag: "Auth",
  summary: "Current session and user",
  auth: "any",
  response: ok(z.object({ session: Session, user: User })),
});

// ---------- bootstrap ----------
doc({
  method: "get",
  path: "/bootstrap",
  tag: "Bootstrap",
  summary: "Everything the frontend loads at start-up",
  auth: "any",
  response: ok(
    z.object({
      today: str.describe("The server's date (shop time zone). Due-date maths is relative to it."),
      paymentsFrom: str
        .nullable()
        .describe("Individual payments are included from this date on; null = whole history."),
      shop: z.object({ name: str, phone: str, address: str }),
      owner: z.object({ name: str, email: str.nullable(), username: str, photo: str }),
      riders: z.array(Rider),
      products: z.array(Product),
      customers: z.array(Customer),
      items: z.array(Item),
      payments: z.array(Payment),
      audit: z.array(Audit),
      notifs: z.array(Notification),
      closings: z.array(Closing),
      extensions: z.array(Extension),
    }),
  ).openapi({
    description:
      "Owners get everything; riders only their own customers/items/payments/closings/extensions (no products, audit or notifications).",
  }),
});

// ---------- riders ----------
doc({
  method: "get",
  path: "/riders",
  tag: "Riders",
  summary: "List riders",
  auth: "owner",
  response: list(Rider),
});
doc({
  method: "post",
  path: "/riders",
  tag: "Riders",
  summary: "Create a rider",
  auth: "owner",
  body: createRiderBody,
  response: ok(Rider),
  status: 201,
  errors: [409],
});
doc({
  method: "patch",
  path: "/riders/{id}",
  tag: "Riders",
  summary: "Edit or deactivate a rider (deactivating or changing the password ends their sessions)",
  auth: "owner",
  params: riderIdParam,
  body: updateRiderBody,
  response: ok(Rider),
  errors: [404, 409],
});
doc({
  method: "put",
  path: "/riders/{id}/photo",
  tag: "Riders",
  summary: "Set a rider's photo",
  auth: "owner",
  params: riderIdParam,
  multipart: true,
  response: ok(Rider),
  errors: [404, 413],
});
doc({
  method: "put",
  path: "/riders/me/photo",
  tag: "Riders",
  summary: "Set your own photo",
  auth: "rider",
  multipart: true,
  response: ok(Rider),
  errors: [413],
});

// ---------- shop ----------
doc({
  method: "get",
  path: "/shop",
  tag: "Shop",
  summary: "Shop details",
  auth: "any",
  response: ok(z.object({ name: str, phone: str, address: str })),
});
doc({
  method: "patch",
  path: "/shop",
  tag: "Shop",
  summary: "Update shop details",
  auth: "owner",
  body: updateShopBody,
  response: ok(z.object({ name: str, phone: str, address: str })),
});
doc({
  method: "put",
  path: "/shop/owner-photo",
  tag: "Shop",
  summary: "Set the owner's photo",
  auth: "owner",
  multipart: true,
  errors: [413],
});

// ---------- products ----------
doc({
  method: "get",
  path: "/products",
  tag: "Products",
  summary: "List products",
  auth: "owner",
  response: list(Product),
});
doc({
  method: "post",
  path: "/products",
  tag: "Products",
  summary: "Create a product",
  auth: "owner",
  body: createProductBody,
  response: ok(Product),
  status: 201,
  errors: [409],
});
doc({
  method: "post",
  path: "/products/{code}/stock",
  tag: "Products",
  summary: "Add stock",
  auth: "owner",
  params: codeParam,
  body: stockBody,
  response: ok(Product),
  errors: [404],
});

// ---------- customers ----------
doc({
  method: "post",
  path: "/customers",
  tag: "Customers",
  summary: "Create a customer",
  auth: "owner",
  body: createCustomerBody,
  response: ok(Customer),
  status: 201,
  errors: [409],
});
doc({
  method: "get",
  path: "/customers",
  tag: "Customers",
  summary: "List customers (riders see only their own)",
  auth: "any",
  query: listCustomersQuery,
  response: paged(Customer),
});
doc({
  method: "get",
  path: "/customers/{id}",
  tag: "Customers",
  summary: "Customer with their items",
  auth: "any",
  params: customerIdParam,
  response: ok(z.object({ customer: Customer, items: z.array(Item) })),
  errors: [404],
});
doc({
  method: "patch",
  path: "/customers/{id}/rider",
  tag: "Customers",
  summary: "Reassign a customer (and all their items) to another rider",
  auth: "owner",
  params: customerIdParam,
  body: assignRiderBody,
  response: ok(Customer),
  errors: [404],
});
doc({
  method: "post",
  path: "/customers/{id}/extensions",
  tag: "Customers",
  summary: "Grant a payment extension (max 30 days, notifies the owner)",
  auth: "rider",
  params: customerIdParam,
  body: extensionBody,
  response: ok(Extension),
  status: 201,
  errors: [404],
});
doc({
  method: "put",
  path: "/customers/{id}/photo",
  tag: "Customers",
  summary: "Set a customer's photo",
  auth: "owner",
  params: customerIdParam,
  multipart: true,
  response: ok(Customer),
  errors: [404, 413],
});

// ---------- items ----------
doc({
  method: "post",
  path: "/items",
  tag: "Items",
  summary: "Sell a product on instalments (decrements stock)",
  auth: "owner",
  body: createItemBody,
  response: ok(Item),
  status: 201,
  errors: [404],
});
doc({
  method: "get",
  path: "/items",
  tag: "Items",
  summary: "List items (riders see only their customers' items)",
  auth: "any",
  query: listItemsQuery,
  response: list(Item),
});

// ---------- payments ----------
doc({
  method: "post",
  path: "/payments",
  tag: "Payments",
  summary: "Record payments for a customer; overpayment is rejected",
  auth: "rider",
  body: recordPaymentsBody,
  response: ok(Receipt),
  status: 201,
  errors: [404],
});
doc({
  method: "get",
  path: "/payments",
  tag: "Payments",
  summary: "List payments",
  auth: "any",
  query: listPaymentsQuery,
  response: paged(Payment),
});
doc({
  method: "patch",
  path: "/payments/{id}",
  tag: "Payments",
  summary: "Correct a payment amount (reason required, audited)",
  auth: "owner",
  params: paymentIdParam,
  body: correctPaymentBody,
  response: ok(Payment),
  errors: [404],
});

// ---------- closings ----------
doc({
  method: "post",
  path: "/closings",
  tag: "Closings",
  summary: "Submit today's closing; totals are computed by the server",
  auth: "rider",
  body: submitClosingBody,
  response: ok(Closing),
  status: 201,
  errors: [409],
});
doc({
  method: "get",
  path: "/closings",
  tag: "Closings",
  summary: "List closings (riders see their own)",
  auth: "any",
  response: list(Closing),
});

// ---------- notifications / audit ----------
doc({
  method: "get",
  path: "/notifications",
  tag: "Notifications",
  summary: "Owner notifications, newest first",
  auth: "owner",
  query: listNotificationsQuery,
  response: list(Notification),
});
doc({
  method: "post",
  path: "/notifications/read-all",
  tag: "Notifications",
  summary: "Mark all as read",
  auth: "owner",
});
doc({
  method: "get",
  path: "/audit",
  tag: "Audit",
  summary: "Audit log, newest first",
  auth: "owner",
  query: pageQuery,
  response: paged(Audit),
});

// ---------- reports ----------
doc({
  method: "get",
  path: "/reports/{type}",
  tag: "Reports",
  summary: "Generate a report (JSON, or CSV with ?format=csv)",
  auth: "owner",
  params: reportParams,
  query: reportQuery,
  response: ok(Report),
});

// ---------- ops ----------
doc({
  method: "get",
  path: "/health",
  tag: "Ops",
  summary: "Liveness and database check",
  auth: "none",
  response: ok(z.object({ status: str, db: str, uptime: num })),
  errors: [],
});
doc({
  method: "post",
  path: "/dev/reset",
  tag: "Ops",
  summary: "Restore demo data (not available in production)",
  auth: "owner",
});

export function buildOpenApiDocument() {
  return new OpenApiGeneratorV31(registry.definitions).generateDocument({
    openapi: "3.1.0",
    info: {
      title: "Collecto API",
      version: "1.0.0",
      description:
        "Backend for the Collecto instalment-collection system. All responses use `{success, message, data}`; errors use `{success:false, message, errors[]}`. " +
        "Sign in with POST /auth/login, then send `Authorization: Bearer <accessToken>`. The refresh token lives in an httpOnly cookie and is used by POST /auth/refresh. " +
        "Money is a number with at most 2 decimals; ids are prefixed strings (C101, IT3, R1, P7).",
    },
    servers: [{ url: "/api/v1" }],
    tags: [
      "Auth",
      "Bootstrap",
      "Riders",
      "Shop",
      "Products",
      "Customers",
      "Items",
      "Payments",
      "Closings",
      "Notifications",
      "Audit",
      "Reports",
      "Ops",
    ].map((name) => ({ name })),
  });
}
