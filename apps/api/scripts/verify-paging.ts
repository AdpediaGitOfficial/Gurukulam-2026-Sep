/**
 * A paged list must not lose a row, or show one twice.
 *
 * Sorting by a column with duplicate values leaves the tied rows in no defined
 * order, and Postgres may order them differently for each page — so page 2 can
 * repeat a row from page 1 while another row is never returned at all. Nothing
 * errors; the operator simply never sees the record. Twenty of our twenty-one
 * seeded college contacts share a name, which is what surfaced this.
 *
 * Every list endpoint therefore sorts with a unique final key. This walks each
 * one in small pages and checks the walk against the total the endpoint itself
 * reports.
 *
 *     npm run verify:paging --workspace @gurukulam/api
 */
import { clearRateLimit } from "./_rate-limit";

const BASE = process.env.API_URL ?? "http://127.0.0.1:4000/api/v1";
const PASSWORD = "Gurukulam@2026";
const PAGE_SIZE = 3;

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

interface Row { [key: string]: unknown }
interface PageBody { rows?: Row[]; total?: number; totalPages?: number }

const get = async (token: string, path: string): Promise<PageBody> =>
  (await fetch(`${BASE}${path}`, { headers: { authorization: `Bearer ${token}` } })).json() as Promise<PageBody>;

/** Each list, and the field that identifies one of its rows. */
const LISTS: ReadonlyArray<{ path: string; id: string; sorts?: readonly string[] }> = [
  { path: "/colleges", id: "collegeId", sorts: ["name", "collegeCode"] },
  { path: "/colleges/contacts", id: "pocId", sorts: ["name", "email"] },
  { path: "/colleges/access", id: "collegeUserId", sorts: ["name", "accessStatus"] },
  { path: "/colleges/requirements", id: "requirementId", sorts: ["status"] },
  { path: "/students", id: "studentId", sorts: ["name"] },
  { path: "/courses", id: "courseId", sorts: ["name"] },
  { path: "/batches", id: "batchId", sorts: ["startDate"] },
  { path: "/batches/sessions", id: "sessionId", sorts: ["scheduledDate"] },
  { path: "/trainers", id: "trainerId", sorts: ["name"] },
  { path: "/fee-ledger", id: "ledgerId" },
  { path: "/hiring", id: "jobPostingId" },
  { path: "/certificates", id: "certificateId" },
  { path: "/courses/question-bank", id: "questionId" },
  { path: "/localisation/countries", id: "countryId", sorts: ["name"] },
  { path: "/localisation/cities", id: "cityId", sorts: ["name"] },
  { path: "/settings/roles", id: "roleId", sorts: ["name"] },
  { path: "/settings/administrators", id: "adminUserId", sorts: ["name"] },
];

/** Walks every page and returns what the walk saw. */
async function walk(token: string, path: string, id: string) {
  const join = path.includes("?") ? "&" : "?";
  const first = await get(token, `${path}${join}pageSize=${PAGE_SIZE}&page=1`);
  const total = first.total ?? 0;
  const pages = first.totalPages ?? 0;
  const seen: string[] = [];
  for (let page = 1; page <= pages; page += 1) {
    const body = page === 1 ? first : await get(token, `${path}${join}pageSize=${PAGE_SIZE}&page=${page}`);
    for (const row of body.rows ?? []) seen.push(String(row[id]));
  }
  const distinct = new Set(seen);
  return { total, pages, seen, distinct };
}

async function main() {
  console.log("\n  Paging is stable — no row lost, none repeated\n");
  await clearRateLimit();
  const token = await signIn();

  for (const list of LISTS) {
    const variants = ["", ...(list.sorts ?? []).map((s) => `?sort=${s}`)];
    for (const variant of variants) {
      const path = `${list.path}${variant}`;
      const label = `${path}`;
      try {
        const { total, pages, seen, distinct } = await walk(token, path, list.id);
        if (total === 0) {
          ok(label, "empty");
          continue;
        }
        const repeated = seen.length - distinct.size;
        if (repeated > 0) {
          bad(label, `${repeated} row(s) appeared on more than one page across ${pages} pages`);
        } else if (distinct.size !== total) {
          bad(label, `walked ${distinct.size} distinct rows but the endpoint reports ${total}`);
        } else {
          ok(label, `${total} rows over ${pages} pages`);
        }
      } catch (error) {
        bad(label, String(error).slice(0, 200));
      }
    }
  }

  console.log(`\n  ${passed} passed, ${failed} failed\n`);
  process.exit(failed === 0 ? 0 : 1);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
