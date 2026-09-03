/**
 * The single source of truth for every request and response shape.
 *
 * The API validates against these; the console types against them; the mobile
 * clients consume the OpenAPI document generated from them. A field that
 * changes here fails to compile on both sides in the same commit — which is
 * the property that makes one repository worth more than two.
 */
export * from "./common/money.js";
export * from "./common/errors.js";
export * from "./common/page.js";
export * from "./common/principal.js";
export * from "./common/business-id.js";
export * from "./auth/index.js";
export * from "./courses/index.js";
export * from "./trainers/index.js";
export * from "./colleges/index.js";
export * from "./hiring/index.js";
export * from "./questions/index.js";
export * from "./batches/index.js";
export * from "./students/index.js";
export * from "./ledger/index.js";
