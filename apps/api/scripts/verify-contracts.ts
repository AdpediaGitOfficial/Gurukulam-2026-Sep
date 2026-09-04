/**
 * Every response the API sends must match the contract that names it.
 *
 * Two ways it can drift, and both matter:
 *
 *   · the response carries a field the schema does not declare. Zod strips
 *     unknown keys, so nothing fails — the field simply never reaches the
 *     OpenAPI document, and the mobile and third-party clients cannot see it
 *     at all. Four detail endpoints had grown this way before this suite
 *     existed: colleges returned `pocs`, courses `topics`, batches
 *     `trainerAssignments`, trainers `approvedCourses`, students `batches` and
 *     `ledgers`, ledgers `installments` — none of them declared anywhere.
 *
 *   · the response contradicts the schema — a null where the contract promises
 *     a string, a missing required field. Clients that trust the contract then
 *     break on data the API considers perfectly good.
 *
 * Sampling a real row rather than a fixture is the point: a fixture drifts with
 * the code that produces it, while the database holds shapes nobody planned for.
 *
 *     pnpm --filter @gurukulam/api verify:contracts
 */
import {
  batchDetailSchema,
  collegeDetailSchema,
  courseDetailSchema,
  jobPostingSchema,
  ledgerDetailSchema,
  requirementSchema,
  studentDetailSchema,
  trainerDetailSchema,
} from "@gurukulam/contracts";
import type { ZodType } from "zod";
import { clearRateLimit } from "./_rate-limit";

const BASE = process.env.API_URL ?? "http://127.0.0.1:4000/api/v1";
const PASSWORD = "Gurukulam@2026";

let passed = 0;
let failed = 0;
const ok = (n: string, d = "") =>
  (passed++, console.log(`  \x1b[32m✓\x1b[0m ${n}${d ? `  \x1b[90m${d}\x1b[0m` : ""}`));
const bad = (n: string, d: string) =>
  (failed++, console.log(`  \x1b[31m✗\x1b[0m ${n}\n      \x1b[31m${d}\x1b[0m`));

async function signIn(): Promise<string> {
  const response = await fetch(`${BASE}/auth/login`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ email: "priya@gurukulam.test", password: PASSWORD }),
  });
  const body = (await response.json()) as { tokens?: { accessToken: string } };
  if (!body.tokens) throw new Error(`Could not sign in: ${JSON.stringify(body)}`);
  return body.tokens.accessToken;
}

const get = async (token: string, path: string): Promise<unknown> =>
  (await fetch(`${BASE}${path}`, { headers: { authorization: `Bearer ${token}` } })).json();

interface Target {
  label: string;
  list: string;
  id: string;
  detail: (id: string) => string;
  schema: ZodType;
}

const TARGETS: Target[] = [
  { label: "GET /colleges/:id", list: "/colleges", id: "collegeId", detail: (i) => `/colleges/${i}`, schema: collegeDetailSchema },
  { label: "GET /courses/:id", list: "/courses", id: "courseId", detail: (i) => `/courses/${i}`, schema: courseDetailSchema },
  { label: "GET /batches/:id", list: "/batches", id: "batchId", detail: (i) => `/batches/${i}`, schema: batchDetailSchema },
  { label: "GET /trainers/:id", list: "/trainers", id: "trainerId", detail: (i) => `/trainers/${i}`, schema: trainerDetailSchema },
  { label: "GET /students/:id", list: "/students", id: "studentId", detail: (i) => `/students/${i}`, schema: studentDetailSchema },
  { label: "GET /fee-ledger/:id", list: "/fee-ledger", id: "ledgerId", detail: (i) => `/fee-ledger/${i}`, schema: ledgerDetailSchema },
  { label: "GET /hiring/:id", list: "/hiring", id: "jobPostingId", detail: (i) => `/hiring/${i}`, schema: jobPostingSchema },
  { label: "GET /colleges/requirements/:id", list: "/colleges/requirements", id: "requirementId", detail: (i) => `/colleges/requirements/${i}`, schema: requirementSchema },
];

/**
 * Keys the response carries that the schema does not declare.
 *
 * Compared at the top level and one level into any array, which is where the
 * drift has actually happened — a detail endpoint growing a nested collection
 * nobody wrote down.
 */
function undeclared(actual: unknown, parsed: unknown, path = ""): string[] {
  if (Array.isArray(actual)) {
    const first = actual[0];
    const cleaned = Array.isArray(parsed) ? parsed[0] : undefined;
    return first === undefined || cleaned === undefined
      ? []
      : undeclared(first, cleaned, `${path}[]`);
  }
  if (actual === null || typeof actual !== "object" || parsed === null || typeof parsed !== "object") {
    return [];
  }
  const found: string[] = [];
  for (const [key, value] of Object.entries(actual as Record<string, unknown>)) {
    const here = path === "" ? key : `${path}.${key}`;
    if (!(key in (parsed as Record<string, unknown>))) found.push(here);
    else found.push(...undeclared(value, (parsed as Record<string, unknown>)[key], here));
  }
  return found;
}

async function main(): Promise<void> {
  await clearRateLimit();
  const token = await signIn();

  console.log("\nresponses match the contracts that name them");
  for (const target of TARGETS) {
    const list = (await get(token, `${target.list}?pageSize=5`)) as {
      rows?: Array<Record<string, string>>;
    };
    const rows = list.rows ?? [];
    if (rows.length === 0) {
      console.log(`  \x1b[90m·\x1b[0m ${target.label}  no rows to sample`);
      continue;
    }

    // Some rows are unreachable to this principal by scope; take the first that
    // actually resolves rather than failing on an unrelated 404.
    let body: unknown;
    for (const row of rows) {
      const candidate = await get(token, target.detail(row[target.id] ?? ""));
      if (candidate !== null && typeof candidate === "object" && !("error" in candidate)) {
        body = candidate;
        break;
      }
    }
    if (body === undefined) {
      console.log(`  \x1b[90m·\x1b[0m ${target.label}  no readable row`);
      continue;
    }

    const result = target.schema.safeParse(body);
    if (!result.success) {
      bad(target.label, `does not match its schema: ${JSON.stringify(result.error.issues.slice(0, 3))}`);
      continue;
    }

    const extra = undeclared(body, result.data);
    if (extra.length > 0) {
      bad(
        target.label,
        `returns ${extra.length} field(s) no schema declares, so they never reach the OpenAPI document: ${extra.join(", ")}`,
      );
      continue;
    }
    ok(target.label, `${Object.keys(body as object).length} fields, all declared`);
  }

  console.log(
    failed === 0
      ? `\n\x1b[32m${passed} contract check(s) passed\x1b[0m\n`
      : `\n\x1b[31m${failed} failed\x1b[0m, ${passed} passed\n`,
  );
  process.exit(failed === 0 ? 0 : 1);
}

void main();
