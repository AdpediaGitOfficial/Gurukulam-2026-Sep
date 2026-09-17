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
  "POST /cron/fee-reminders": "Driven by cron against CRON_SHARED_SECRET. The console reads what it sent.",
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

/**
 * Every write route, under the prefix of the controller it is actually in.
 *
 * One file can declare SEVERAL controllers — `access.controller.ts` carries
 * four and `ledger.controller.ts` two — so the prefix is the nearest
 * `@Controller` ABOVE each route, not the first one in the file. Taking the
 * first put `PUT /account` under `/settings` and `POST /cron/fee-reminders`
 * under `/fee-ledger`, which is a suite reporting on endpoints that do not
 * exist while missing the ones that do.
 */
function apiEndpoints(): Endpoint[] {
  const found: Endpoint[] = [];
  for (const file of walk(API_SRC).filter((f) => f.endsWith(".controller.ts"))) {
    const text = readFileSync(file, "utf8");
    let prefix: string | undefined;

    text.split("\n").forEach((line, index) => {
      const controller = /@Controller\(\s*["'`]([^"'`]*)["'`]\s*\)/.exec(line);
      if (controller) {
        prefix = controller[1];
        return;
      }
      if (prefix === undefined) return;

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
 * Read from the call's OWN ARGUMENT LIST — the text between `apiFetch(` and
 * its balanced closing paren — rather than from a fixed window of characters
 * after it. The window was 420 characters, which reached past the call and
 * into whatever came next:
 *
 *     await apiFetch(path, { method: "PUT", body });
 *     revalidatePath("/fee-ledger");        // ← swept in as a called path
 *
 * Those `revalidatePath` arguments are CONSOLE routes, not API paths. Reading
 * them as calls did two bad things at once: it hid that the real path was
 * built in a variable the scanner could not see, and it put `/fee-ledger` into
 * the called set, where it was available to cover an endpoint nothing calls.
 *
 * The first argument is often an expression rather than a literal —
 * `editing ? \`/students/${id}\` : "/students"` — so every literal in the
 * argument list is paired with every method literal in it. Deliberately
 * generous WITHIN the call, and blind outside it.
 */
/**
 * The text of a call's argument list, parens balanced.
 *
 * Returns "" when the parens never close, which cannot happen in source that
 * compiles but would otherwise read to the end of the file.
 */
function callArguments(text: string, openIndex: number): string {
  let depth = 0;
  for (let i = openIndex; i < text.length; i += 1) {
    const ch = text[i];
    if (ch === "(") depth += 1;
    else if (ch === ")") {
      depth -= 1;
      if (depth === 0) return text.slice(openIndex + 1, i);
    }
  }
  return "";
}

/**
 * Every path literal in a chunk of source, as a SHAPE.
 *
 * The whole literal is read and its template holes become `:x`, so
 * `` `/batches/${id}/trainer/propose` `` is recorded as
 * `/batches/:x/trainer/propose` — the same shape the controller declares.
 *
 * The previous version stopped at the first `${`, which threw away every
 * segment after it. That is not a rounding error: it collapsed
 * `/batches/:id/trainer/propose` down to `/batches/`, which then matched
 * `DELETE /batches/:id` — an endpoint with no console control at all — and
 * the suite reported zero gaps while the batch list had no delete on the row.
 * A deeper endpoint masking a shallower one is the exact shape of that bug.
 *
 * A path that is entirely dynamic (`` `${base}${query}` ``) normalises to
 * something that matches nothing, which is correct: it tells us nothing about
 * which endpoint was called. Those are all GETs, and only writes are compared.
 */
function pathLiterals(source: string): string[] {
  const out: string[] = [];
  for (const m of source.matchAll(/`(\/[^`]*)`|["'](\/[^"']*)["']/g)) {
    const raw = m[1] ?? m[2];
    if (raw === undefined) continue;
    const path = raw
      // A template hole is a path parameter wherever it appears.
      .replace(/\$\{[^}]*\}/g, ":x")
      // A query string is not part of the route it is asking for.
      .replace(/\?.*$/, "")
      .replace(/\/+/g, "/")
      .replace(/(.)\/$/, "$1");
    if (path !== "/" && path !== "") out.push(path);
  }
  return out;
}

function consoleCalls(): Set<string> {
  const shapes = new Set<string>();
  for (const file of walk(WEB_SRC)) {
    const text = readFileSync(file, "utf8");
    const pattern = /apiFetch(?:<[^>]*>)?\(/g;
    let match: RegExpExecArray | null;
    while ((match = pattern.exec(text)) !== null) {
      const window = callArguments(text, match.index + match[0].length - 1);

      let paths = pathLiterals(window);

      /* A DISPATCHER builds its path rather than writing one: the shared
         delete action does `apiFetch(config.path(id), { method: "DELETE" })`,
         and its real paths live in a registry of `path:` builders at the top
         of the file. Reading only the call's own window sees no literal and
         reports every one of those endpoints as having no console control —
         a dozen permanent false gaps, which is how a suite stops being read.

         So when the call site names no path, read the file's PATH BUILDERS
         specifically — `path: (id) => \`/colleges/${id}\`` — and nothing else.
         Not every literal in the file: the registry also carries `revalidate`
         arrays of CONSOLE routes, and treating those as API paths made the
         suite report `DELETE /trainers/:x` as covered after I deleted its
         entry, purely because "/trainers" survived in a neighbour's
         revalidate list. A false gap wastes an afternoon; a false pass hides
         a missing control forever. */
      /* A path built into a VARIABLE above the call is invisible to a window
         that only looks forward:

             const path = parent === "ledger"
               ? `/fee-ledger/${id}/schedule`
               : `/fee-ledger/contracts/${id}/schedule`;
             await apiFetch(path, { method: "PUT", body });

         Both endpoints are called; neither was seen. Rather than widening the
         window — which would sweep in literals from whatever function happens
         to sit nearby, and a false PASS is the one outcome worth avoiding —
         the identifier is resolved: take the name passed to apiFetch and read
         the literals out of its own `const` declaration. */
      if (paths.length === 0) {
        // The first argument, when it is a bare name. `config.path(id)` is
        // not one — it stops at the dot and falls through to the registry
        // reader below, which is where a dispatcher's real paths live.
        const ident = /^\s*([A-Za-z_$][\w$]*)\s*(?:,|$)/.exec(window);
        const name = ident?.[1];
        if (name !== undefined) {
          const decl = new RegExp(`\\bconst\\s+${name}\\s*(?::[^=]+)?=([\\s\\S]*?);`).exec(text);
          if (decl?.[1] !== undefined) paths = pathLiterals(decl[1]);
        }
      }

      if (paths.length === 0) {
        paths = [...text.matchAll(/\bpath:\s*\([^)]*\)\s*=>\s*(`[^`]*`|"[^"]*"|'[^']*')/g)]
          .flatMap((m) => pathLiterals(m[1] ?? ""));
      }
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
 * Covered when the console calls THIS endpoint — the same method and the same
 * shape, whole.
 *
 * ── Why there is no longer a prefix rule ────────────────────────────────
 *
 * There were two, and both let something through.
 *
 * The first compared prefixes in BOTH directions, so a call to
 * `/trainers/availability/:id` covered `DELETE /trainers/:id`. Proved by
 * deleting the trainer entry from the delete registry and watching the suite
 * still report zero gaps.
 *
 * Tightening that to an exact prefix match fixed the direction and left the
 * truncation, which is what actually bit: a console path was recorded only up
 * to its first `${`, so `` `/batches/${id}/trainer/propose` `` was stored as
 * `/batches/` and covered `DELETE /batches/:id`. That endpoint had NO console
 * control — the batch list had no delete on the row, and the registry had no
 * `batch` target — and the suite called it covered for months. A deeper
 * endpoint masking a shallower one, entirely inside the comparison.
 *
 * `pathLiterals` now keeps the whole path, so the shapes are directly
 * comparable and this is a set membership test. Nothing is inferred from a
 * shared prefix, because every inference this file has tried has eventually
 * hidden a missing control — and a FALSE PASS is the one failure it exists to
 * prevent. A false gap costs somebody an afternoon; a false pass costs an
 * operations team a screen nobody knows is absent.
 *
 * What remains: two endpoints whose paths differ only in a parameter NAME are
 * one shape here, which is deliberate — `:id` and `:studentId` are the same
 * hole in the same URL.
 */
const covered = (endpoint: Endpoint): boolean => called.has(endpoint.shape);

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
