/**
 * Which API capability has no way in from the console.
 *
 * `verify:actions` walks the console and catches a control that is there and
 * does nothing. It cannot catch a control that is NOT THERE — and that is the
 * failure that actually costs an operations team a screen, because nothing on
 * the page looks wrong. Nine screens were "missing" earlier in this build and
 * six of them turned out to exist as sections rather than tab routes; the only
 * way to answer that question honestly is to count capability, not routes.
 *
 * So this walks it from the other end:
 *
 *   · every write endpoint the API declares — the controllers are the source,
 *     because they are what actually exists rather than what a doc claims;
 *   · every write the console makes — every `apiFetch` carrying a method.
 *
 * An endpoint nobody calls is either a missing screen or a deliberate
 * omission. The deliberate ones are listed below WITH THEIR REASON, which is
 * the point of writing it down: the next person reads why, not just that.
 *
 * Static — no database, no browser, no running server. Cheap enough to run on
 * every change.
 */

import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";

const ROOT = join(import.meta.dirname, "..", "..", "..");
const API_SRC = join(ROOT, "apps", "api", "src");
const WEB_SRC = join(ROOT, "apps", "web", "src");

const RED = "[31m";
const GREEN = "[32m";
const DIM = "[2m";
const RESET = "[0m";

interface Endpoint {
  method: string;
  /** "/students/:id/suspend" — the controller prefix plus the route path. */
  path: string;
  /** Matching ignores parameter NAMES, so :id and :studentId are one shape. */
  shape: string;
  file: string;
  line: number;
}

/**
 * Endpoints with no console caller, on purpose.
 *
 * Keyed by shape. The reason is not decoration — an entry without one is a gap
 * somebody forgot to close, and there is no way to tell the two apart later.
 */
const DELIBERATE: Record<string, string> = {
  "POST /auth/refresh": "The BFF refreshes on a 401 inside apiFetch, never from a screen.",
  "POST /fee-ledger/fee-reminders": "Driven by cron against CRON_SHARED_SECRET. The console reads what it sent.",
};

// ── What the API declares ─────────────────────────────────────────────────

const walk = (dir: string, out: string[] = []): string[] => {
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) walk(full, out);
    else if (full.endsWith(".ts")) out.push(full);
  }
  return out;
};

/** ":id" and ":studentId" are the same hole in the same URL. */
const shapeOf = (method: string, path: string): string =>
  `${method} ${path.replace(/:[A-Za-z0-9_]+/g, ":x")}`;

const joinPath = (prefix: string, route: string): string => {
  const left = `/${prefix}`.replace(/\/+$/, "");
  const right = route === "" ? "" : `/${route}`.replace(/\/+/g, "/");
  return `${left}${right}` || "/";
};

function apiEndpoints(): Endpoint[] {
  const found: Endpoint[] = [];
  for (const file of walk(API_SRC).filter((f) => f.endsWith(".controller.ts"))) {
    const text = readFileSync(file, "utf8");
    const prefix = /@Controller\(\s*["'`]([^"'`]*)["'`]\s*\)/.exec(text)?.[1];
    if (prefix === undefined) continue;

    text.split("\n").forEach((line, index) => {
      const match = /@(Post|Patch|Put|Delete)\(\s*(?:["'`]([^"'`]*)["'`])?\s*\)/.exec(line);
      if (!match) return;
      const method = (match[1] ?? "").toUpperCase();
      const path = joinPath(prefix, match[2] ?? "");
      found.push({
        method,
        path,
        shape: shapeOf(method, path),
        file: relative(ROOT, file),
        line: index + 1,
      });
    });
  }
  return found.sort((a, b) => a.shape.localeCompare(b.shape));
}

// ── What the console calls ────────────────────────────────────────────────

/**
 * Every `apiFetch` the console makes, as a shape.
 *
 * Read from a WINDOW around each call rather than from its first argument,
 * because the first argument is often an expression:
 *
 *     apiFetch(editing ? `/students/${id}` : "/students", {
 *       method: editing ? "PATCH" : "POST",
 *
 * Matching only a literal first argument misses that call entirely, and it is
 * the edit path for a whole module. So every path literal and every method
 * literal in the window are paired — deliberately generous, because the cost
 * of a missed pairing is a false gap, and a suite that cries wolf is a suite
 * people stop reading.
 *
 * A template hole ends its literal, so `/students/${id}/suspend` is recorded
 * as `/students/`. That is handled at the comparison, not by parsing
 * TypeScript here.
 */
const WINDOW = 420;

function consoleCalls(): Set<string> {
  const shapes = new Set<string>();
  for (const file of walk(WEB_SRC)) {
    const text = readFileSync(file, "utf8");
    const pattern = /apiFetch(?:<[^>]*>)?\(/g;
    let match: RegExpExecArray | null;
    while ((match = pattern.exec(text)) !== null) {
      const window = text.slice(match.index, match.index + WINDOW);

      const paths = [...window.matchAll(/[`"'](\/[A-Za-z0-9\-_/]*)/g)]
        .map((m) => (m[1] ?? "").replace(/\/+/g, "/"))
        .filter((path) => path !== "/");
      if (paths.length === 0) continue;

      /* Every quoted verb in the window, not just the first one after
         `method:`. The create-or-edit action writes
         `method: editing ? "PATCH" : "POST"`, and anchoring on `method:`
         captures PATCH and walks straight past POST — which then reports
         "POST /courses" as a missing screen while the Add course form sits
         four lines above it. */
      const methods = [...window.matchAll(/["'`](GET|POST|PATCH|PUT|DELETE)["'`]/g)]
        .flatMap((m) => (m[1] === undefined ? [] : [m[1]]));
      // No verb anywhere means a GET — that is what apiFetch defaults to.
      const verbs = methods.length === 0 ? ["GET"] : [...new Set(methods)];

      for (const path of paths) for (const verb of verbs) shapes.add(shapeOf(verb, path));
    }
  }
  return shapes;
}

// ── The answer ────────────────────────────────────────────────────────────

const endpoints = apiEndpoints();
const called = consoleCalls();

/**
 * Covered when some console call of the same method reaches the same place.
 *
 * A template hole truncates the recorded path, so the test is a prefix test in
 * both directions. That is conservative in the right direction: it may call a
 * gap covered, but it will not invent one — and a suite that cries wolf is a
 * suite people stop reading.
 */
const covered = (endpoint: Endpoint): boolean => {
  if (called.has(endpoint.shape)) return true;
  const literal = endpoint.path.split("/:")[0] ?? endpoint.path;
  for (const shape of called) {
    const [method, path] = shape.split(" ");
    if (method !== endpoint.method || path === undefined) continue;
    const bare = path.replace(/\/$/, "");
    if (bare === literal || bare.startsWith(`${literal}/`) || literal.startsWith(`${bare}/`)) {
      return true;
    }
    if (path.endsWith("/") && literal === bare) return true;
  }
  return false;
};

const gaps = endpoints.filter((e) => !covered(e) && DELIBERATE[e.shape] === undefined);
const declared = endpoints.filter((e) => DELIBERATE[e.shape] !== undefined);
const stale = Object.keys(DELIBERATE).filter((shape) => !endpoints.some((e) => e.shape === shape));

console.log(
  `\n  ${endpoints.length} write endpoints on the API, ` +
    `${called.size} distinct calls from the console\n`,
);

if (declared.length > 0) {
  console.log(`  ${DIM}Deliberately not on a screen:${RESET}`);
  for (const e of declared) console.log(`    ${DIM}${e.shape} — ${DELIBERATE[e.shape]}${RESET}`);
  console.log();
}

if (stale.length > 0) {
  console.log(`  ${RED}These exemptions name endpoints that no longer exist:${RESET}`);
  for (const shape of stale) console.log(`    ${RED}${shape}${RESET}`);
  console.log();
}

if (gaps.length === 0 && stale.length === 0) {
  console.log(`  ${GREEN}Every write the API offers has a way in from the console.${RESET}\n`);
  process.exit(0);
}

if (gaps.length > 0) {
  console.log(`  ${RED}${gaps.length} endpoint(s) the console never calls:${RESET}`);
  for (const e of gaps) console.log(`    ${RED}${e.shape}${RESET}  ${DIM}${e.file}:${e.line}${RESET}`);
  console.log(
    `\n  Each is a missing screen or a deliberate omission. If it is deliberate,\n` +
      `  add it to DELIBERATE in this file WITH THE REASON — an exemption with no\n` +
      `  reason is indistinguishable from a gap nobody closed.\n`,
  );
}

process.exit(1);
