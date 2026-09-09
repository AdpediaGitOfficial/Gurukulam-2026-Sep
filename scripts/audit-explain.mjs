/**
 * Which npm advisories reach the code that actually runs.
 *
 * `npm audit` reports the whole dependency tree, build tooling included. On a
 * server that misleads in the direction that matters: the test runner and the
 * compiler sit on disk, but no process loads them, so an advisory against one
 * is not an exposure. It looks alarming and changes nothing — and burying the
 * real findings under noise is how a real one gets ignored.
 *
 * This walks the lockfile from each workspace's `dependencies` only — the
 * closure a production install creates — and sorts the advisories into the ones
 * that land inside it and the ones that do not.
 *
 *     npm run audit:why
 *
 * It is not a substitute for fixing them. A build-time advisory still matters
 * to whoever runs the build, and to anyone who can influence what gets built.
 * This answers a narrower question: is it reachable on the running server.
 */
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";

const lock = JSON.parse(readFileSync(new URL("../package-lock.json", import.meta.url), "utf8"));
const packages = lock.packages;

/** Node's own resolution: the closest node_modules, then walk up. */
function resolve(from, name) {
  let base = from;
  for (;;) {
    const candidate = `${base ? `${base}/` : ""}node_modules/${name}`;
    if (candidate in packages) return candidate;
    if (!base) return null;
    base = base.includes("/node_modules/") ? base.slice(0, base.lastIndexOf("/node_modules/")) : "";
  }
}

const workspaces = Object.keys(packages).filter(
  (path) => path.startsWith("apps/") || path.startsWith("packages/"),
);

const runtime = new Set();
const stack = [];
for (const workspace of workspaces) {
  for (const dependency of Object.keys(packages[workspace].dependencies ?? {})) {
    stack.push([workspace, dependency]);
  }
}
while (stack.length > 0) {
  const [from, name] = stack.pop();
  const target = resolve(from, name);
  if (target === null || runtime.has(target)) continue;
  runtime.add(target);
  const meta = packages[target];
  for (const dependency of [
    ...Object.keys(meta.dependencies ?? {}),
    ...Object.keys(meta.optionalDependencies ?? {}),
  ]) {
    stack.push([target, dependency]);
  }
}

const runtimeNames = new Set([...runtime].map((path) => path.split("node_modules/").pop()));

let report;
try {
  report = JSON.parse(
    execFileSync("npm", ["audit", "--json"], { encoding: "utf8", maxBuffer: 64 * 1024 * 1024 }),
  );
} catch (error) {
  // npm audit exits non-zero whenever it finds anything, and still prints JSON.
  report = JSON.parse(error.stdout ?? "{}");
}

const advisories = Object.entries(report.vulnerabilities ?? {});
const reaching = advisories.filter(([name]) => runtimeNames.has(name)).sort();
const tooling = advisories.filter(([name]) => !runtimeNames.has(name)).sort();

const green = (text) => `[32m${text}[0m`;
const red = (text) => `[31m${text}[0m`;
const grey = (text) => `[90m${text}[0m`;

console.log(`\n  Production closure: ${runtime.size} packages (workspace dependencies only)\n`);

if (reaching.length === 0) {
  console.log(green("  Nothing carrying an advisory is loadable by the running server."));
} else {
  console.log(red(`  ${reaching.length} advisory package(s) INSIDE the production closure:`));
  for (const [name, meta] of reaching) console.log(`    ${meta.severity.padEnd(9)} ${name}`);
  console.log("\n  Act on these first.");
}

if (tooling.length > 0) {
  console.log(
    `\n  ${tooling.length} advisory package(s) in build and test tooling only — on disk,\n` +
      "  never loaded by a running process:",
  );
  for (const [name, meta] of tooling) console.log(grey(`    ${meta.severity.padEnd(9)} ${name}`));
  console.log(
    grey(
      "\n  Still worth fixing for whoever runs the build. Not a way in from outside\n" +
        "  on a server that only serves.",
    ),
  );
}

console.log(
  grey(
    "\n  A production install omits them entirely: npm ci --omit=dev\n" +
      "  Note that it also removes the Prisma CLI, so run migrations before pruning.\n",
  ),
);
