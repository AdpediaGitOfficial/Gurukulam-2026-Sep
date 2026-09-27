/**
 * The token-scale registration in `src/lib/cn.ts` is the one thing in the UI
 * layer that fails silently. Without it tailwind-merge cannot tell a custom
 * font size from a custom colour — both are `text-*` — so it groups them and
 * drops one from the DOM. The source still reads correctly, which is why this
 * survives code review.
 *
 * It also breaks by omission: add a token to `globals.css` and forget the list
 * in `cn.ts`, and that one token starts vanishing. So this suite reads the
 * `@theme` block and asserts the two files agree.
 *
 *   pnpm --filter @gurukulam/web verify:cn
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";

import { cn } from "../src/lib/cn";

const root = join(__dirname, "..");
let failures = 0;

function check(name: string, actual: string, expected: string[]): void {
  const got = actual.split(" ").filter(Boolean);
  const ok = got.length === expected.length && expected.every((c) => got.includes(c));
  if (ok) {
    console.log(`  ok    ${name}`);
  } else {
    failures += 1;
    console.log(`  FAIL  ${name}\n        got      "${got.join(" ")}"\n        expected "${expected.join(" ")}"`);
  }
}

console.log("\nsurvives merging (different scales must both stay)");
check("text-white + text-body", cn("text-white", "text-body"), ["text-white", "text-body"]);
check("text-h3 + text-ink", cn("text-h3", "text-ink"), ["text-h3", "text-ink"]);
check("text-metric + text-brand", cn("text-metric", "text-brand"), ["text-metric", "text-brand"]);

console.log("\nstill conflicts (same scale, last wins)");
check("text-body + text-h1", cn("text-body", "text-h1"), ["text-h1"]);
check("text-sm + text-body", cn("text-sm", "text-body"), ["text-body"]);
check("rounded-card + rounded-panel", cn("rounded-card", "rounded-panel"), ["rounded-panel"]);
check("shadow-raised + shadow-floating", cn("shadow-raised", "shadow-floating"), ["shadow-floating"]);
check("p-rail + p-content", cn("p-rail", "p-content"), ["p-content"]);

/**
 * `@theme` namespaces map onto the scale names tailwind-merge knows.
 * A namespace not listed here is one `cn.ts` does not need to register.
 */
const NAMESPACES: Record<string, string> = {
  "--text-": "text",
  "--radius-": "radius",
  "--shadow-": "shadow",
  "--spacing-": "spacing",
};

const css = readFileSync(join(root, "src/app/globals.css"), "utf8");
const cnSource = readFileSync(join(root, "src/lib/cn.ts"), "utf8");

/** The `extend.theme` object literal, so a token name elsewhere in the file does not count. */
const themeBlock = cnSource.slice(cnSource.indexOf("extend:"), cnSource.indexOf("});"));

console.log("\nevery @theme token is registered in cn.ts");
for (const [prefix, scale] of Object.entries(NAMESPACES)) {
  const declared = new Set<string>();
  for (const line of css.split("\n")) {
    const match = line.trim().match(new RegExp(`^${prefix}([a-z0-9-]+)\\s*:`));
    // `--text-body--line-height` is a modifier on `--text-body`, not a token.
    if (match?.[1] !== undefined && !match[1].includes("--")) declared.add(match[1]);
  }

  const registeredBlock = themeBlock.match(new RegExp(`\\b${scale}\\s*:\\s*\\[([^\\]]*)\\]`, "s"));
  const registered = new Set(
    (registeredBlock?.[1] ?? "").match(/"([^"]+)"/g)?.map((q) => q.slice(1, -1)) ?? [],
  );

  const missing = [...declared].filter((t) => !registered.has(t));
  const stale = [...registered].filter((t) => !declared.has(t));

  if (missing.length === 0 && stale.length === 0) {
    console.log(`  ok    ${scale} (${declared.size} tokens)`);
  } else {
    failures += 1;
    if (missing.length > 0) {
      console.log(`  FAIL  ${scale}: in globals.css but not cn.ts — will be dropped from the DOM: ${missing.join(", ")}`);
    }
    if (stale.length > 0) {
      console.log(`  FAIL  ${scale}: in cn.ts but not globals.css — stale: ${stale.join(", ")}`);
    }
  }
}

console.log(failures === 0 ? "\nall cn checks passed\n" : `\n${failures} cn check(s) failed\n`);
process.exit(failures === 0 ? 0 : 1);
