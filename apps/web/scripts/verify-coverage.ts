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
 *   · every write each SURFACE makes — every `apiFetch` carrying a method,
 *     attributed to the console, the student portal, `/teach` or `/campus` by
 *     the directory it was written in.
 *
 * An endpoint nobody calls is either a missing screen or a deliberate
 * omission. The deliberate ones are listed below WITH THEIR REASON, which is
 * the point of writing it down: the next person reads why, not just that.
 *
 * ── Why the surface matters ─────────────────────────────────────────────
 *
 * It used to scan `apps/web/src` whole and ask only whether SOMETHING called
 * the endpoint. That reads a call made from one portal as console coverage, and
 * the product's premise is the opposite: the admin console performs every action
 * all three portals do, permanently, because an operations team needs the
 * override regardless. `POST /batches/submissions/:id/grade` was reachable from
 * `/teach` and from nowhere else for as long as the trainer portal existed — an
 * operator could not mark a submission at all — and this suite called it
 * covered.
 *
 * The three `@RequireActor` controllers are the deliberate exception: `/me/*`,
 * `/me/college/*` and `/me/trainer/*` refuse an administrator by construction,
 * so a portal is the only surface that COULD call them. Those are read out of
 * the controller rather than listed here, so a new one needs no bookkeeping.
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
  /**
   * The surface this endpoint is gated to, when its controller carries
   * `@RequireActor`. Null means any principal with the permission — which
   * includes an administrator, so the console is expected to call it.
   */
  actorSurface: Surface | null;
}

/**
 * Which part of the web app a call was written in.
 *
 * By directory, because that is what a surface IS here: a route group and the
 * feature slice it reads. `shared` is `lib`, `server`, `components` and the
 * public routes — code either portal or the console may pull in.
 */
type Surface = "console" | "portal" | "teach" | "campus" | "shared";

const PORTAL_FEATURES: Record<string, Surface> = {
  me: "portal",
  teach: "teach",
  campus: "campus",
};

function surfaceOf(file: string): Surface {
  const rel = relative(WEB_SRC, file).split("\\").join("/");
  if (rel.startsWith("app/portal/")) return "portal";
  if (rel.startsWith("app/teach/")) return "teach";
  if (rel.startsWith("app/campus/")) return "campus";
  if (rel.startsWith("app/(console)/")) return "console";

  const feature = /^features\/([^/]+)\//.exec(rel)?.[1];
  if (feature !== undefined) return PORTAL_FEATURES[feature] ?? "console";

  // `lib`, `server`, `components`, `config`, the auth and public route groups.
  return "shared";
}

/** What a surface is called when the suite has to say it out loud. */
const SURFACE_NAME: Record<Surface, string> = {
  console: "the console",
  portal: "the student portal",
  teach: "/teach",
  campus: "/campus",
  shared: "shared code",
};

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
/**
 * `@RequireActor("STUDENT")` and friends, as the surface that answers them.
 *
 * Read per controller, and reset with the prefix: one file can declare several
 * controllers, and an actor gate belongs to the one it sits above.
 */
const ACTOR_SURFACE: Record<string, Surface> = {
  STUDENT: "portal",
  TRAINER: "teach",
  COLLEGE_USER: "campus",
};

function apiEndpoints(): Endpoint[] {
  const found: Endpoint[] = [];
  for (const file of walk(API_SRC).filter((f) => f.endsWith(".controller.ts"))) {
    const text = readFileSync(file, "utf8");
    let prefix: string | undefined;
    let actorSurface: Surface | null = null;

    text.split("\n").forEach((line, index) => {
      /* Above the `@Controller` it belongs to, in every one of the three, so it
         is read first and cleared when the next controller starts.

         Anchored to the start of the line, because every one of those three
         controllers also NAMES the decorator in the docstring that explains it —
         and an unanchored match read the prose as the gate. Commenting the real
         decorator out therefore changed nothing, which is how this was found: a
         controller could lose its actor gate and keep its exemption. */
      const actor = /^\s*@RequireActor\(\s*["'`]([A-Z_]+)["'`]/.exec(line);
      if (actor?.[1] !== undefined) {
        actorSurface = ACTOR_SURFACE[actor[1]] ?? null;
        return;
      }

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
        actorSurface,
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

function callsBySurface(): Map<string, Set<Surface>> {
  const shapes = new Map<string, Set<Surface>>();
  for (const file of walk(WEB_SRC)) {
    const surface = surfaceOf(file);
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

      for (const path of paths) {
        for (const verb of verbs) {
          const shape = shapeOf(verb, path);
          const surfaces = shapes.get(shape) ?? new Set<Surface>();
          surfaces.add(surface);
          shapes.set(shape, surfaces);
        }
      }
    }
  }
  return shapes;
}

// ── The answer ────────────────────────────────────────────────────────────

const endpoints = apiEndpoints();
const called = callsBySurface();

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
const callers = (endpoint: Endpoint): Set<Surface> => called.get(endpoint.shape) ?? new Set();

const covered = (endpoint: Endpoint): boolean => callers(endpoint).size > 0;

/**
 * Whether the surface that is SUPPOSED to reach this endpoint does.
 *
 * For an actor-gated route that is its own portal, and only that portal — an
 * administrator is refused by construction. For everything else it is the
 * console, because the console performs every action the portals do. `shared`
 * counts as the console: `lib` and `server` are where a call both surfaces make
 * ends up, and nothing there is portal-only.
 */
const reachedByItsOwnSurface = (endpoint: Endpoint): boolean => {
  const who = callers(endpoint);
  if (endpoint.actorSurface !== null) return who.has(endpoint.actorSurface);
  return who.has("console") || who.has("shared");
};

const gaps = endpoints.filter((e) => !covered(e) && DELIBERATE[e.shape] === undefined);

/**
 * Called, but not from the surface that owes it a way in.
 *
 * Reported separately from a gap because it is a different mistake and reads
 * differently: the feature exists, somebody can do it, and the operations team
 * cannot. That was true of grading for as long as `/teach` was the only caller.
 */
const wrongSurface = endpoints.filter(
  (e) => covered(e) && !reachedByItsOwnSurface(e) && DELIBERATE[e.shape] === undefined,
);
const declared = endpoints.filter((e) => DELIBERATE[e.shape] !== undefined);
const stale = Object.keys(DELIBERATE).filter((shape) => !endpoints.some((e) => e.shape === shape));

const bySurface = (surface: Surface): number =>
  [...called.values()].filter((who) => who.has(surface)).length;

console.log(
  `\n  ${endpoints.length} write endpoints on the API; ${called.size} distinct calls — ` +
    `${bySurface("console") + bySurface("shared")} from the console, ` +
    `${bySurface("portal")} from the student portal, ` +
    `${bySurface("teach")} from /teach, ${bySurface("campus")} from /campus\n`,
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

if (gaps.length === 0 && stale.length === 0 && wrongSurface.length === 0) {
  console.log(
    `  ${GREEN}Every write the API offers has a way in from the surface that owes it one.${RESET}\n`,
  );
  process.exit(0);
}

if (wrongSurface.length > 0) {
  console.log(`  ${RED}${wrongSurface.length} endpoint(s) no operator can reach:${RESET}`);
  for (const e of wrongSurface) {
    const who = [...callers(e)].map((surface) => SURFACE_NAME[surface]).join(", ");
    console.log(`    ${RED}${e.shape}${RESET}  ${DIM}called only from ${who} — ${e.file}:${e.line}${RESET}`);
  }
  console.log(
    `\n  The console performs every action the portals do, permanently, because an\n` +
      `  operations team needs the override regardless. A portal-only write is a\n` +
      `  screen the console is missing — or, if the API refuses an administrator by\n` +
      `  design, an \`@RequireActor\` the route does not carry.\n`,
  );
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
