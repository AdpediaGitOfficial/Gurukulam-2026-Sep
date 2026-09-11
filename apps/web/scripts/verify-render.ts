/**
 * The design-system page is the gate for the UI layer. If the token layer did
 * not land you see it here first — swatches render transparent and every type
 * specimen collapses to one size.
 *
 * Reading the compiled CSS is not enough. The failure this guards against is a
 * class that is present in the source and absent from the DOM: tailwind-merge
 * groups a custom font size with a custom colour, drops one, and the component
 * still reads correctly. So every assertion below is made against a real
 * element on a real page, and the expected values are parsed out of
 * `globals.css` rather than restated here — restating them is how a guard
 * drifts into agreeing with itself.
 *
 * Start the app first (`pnpm build && pnpm start -p 3100`), then:
 *   pnpm --filter @gurukulam/web verify:render
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";

import { chromium, type Browser } from "playwright";

const BASE = process.env["VERIFY_BASE_URL"] ?? "http://127.0.0.1:3100";

/**
 * The container ships a Chromium that may not be the build this Playwright
 * version would download, so point at the installed one rather than fetching
 * another. Unset locally and Playwright resolves its own.
 */
const EXECUTABLE = process.env["CHROMIUM_PATH"];

let failures = 0;
const notExercised: string[] = [];
const notEmitted: string[] = [];

function check(name: string, ok: boolean, detail = ""): void {
  const suffix = detail === "" ? "" : ` — ${detail}`;
  if (ok) {
    console.log(`  ok    ${name}${suffix}`);
  } else {
    failures += 1;
    console.log(`  FAIL  ${name}${suffix}`);
  }
}

// ---------------------------------------------------------------- globals.css

const css = readFileSync(join(__dirname, "..", "src/app/globals.css"), "utf8");

/** `--text-h1: 20px` → `{ h1: "20px" }`, ignoring `--text-h1--line-height`. */
function tokens(prefix: string): Map<string, string> {
  const found = new Map<string, string>();
  const pattern = new RegExp(`^\\s*--${prefix}-([a-z0-9-]+)\\s*:\\s*([^;]+);`);
  for (const line of css.split("\n")) {
    const match = line.match(pattern);
    if (match?.[1] === undefined || match[2] === undefined) continue;
    if (match[1].includes("--")) continue; // a modifier, not a token
    found.set(match[1], match[2].trim());
  }
  return found;
}

/** `--text-h1--font-weight: 600` → `{ h1: "600" }`. */
function modifiers(prefix: string, modifier: string): Map<string, string> {
  const found = new Map<string, string>();
  const pattern = new RegExp(`^\\s*--${prefix}-([a-z0-9-]+)--${modifier}\\s*:\\s*([^;]+);`);
  for (const line of css.split("\n")) {
    const match = line.match(pattern);
    if (match?.[1] === undefined || match[2] === undefined) continue;
    found.set(match[1], match[2].trim());
  }
  return found;
}

const textTokens = tokens("text");
const colourTokens = tokens("color");
const radiusTokens = tokens("radius");
const spacingTokens = tokens("spacing");
const textWeights = modifiers("text", "font-weight");
const textLeading = modifiers("text", "line-height");

// --------------------------------------------------------------------- checks

async function run(browser: Browser): Promise<void> {
  const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });

  const problems: string[] = [];
  page.on("console", (m) => {
    // A failed request already surfaces through the response handler below,
    // which knows the URL and can excuse the favicon; the console version does
    // not, so taking both would report the same 404 twice and un-excusably.
    if (m.type() === "error" && !m.text().startsWith("Failed to load resource")) {
      problems.push(m.text());
    }
  });
  page.on("pageerror", (e) => problems.push(e.message));
  page.on("response", (r) => {
    // The favicon is not part of the design system and its absence is not a
    // regression; anything else failing to load is.
    if (r.status() >= 400 && !r.url().endsWith("/favicon.ico")) {
      problems.push(`HTTP ${r.status()} ${r.url()}`);
    }
  });

  const response = await page.goto(`${BASE}/design-system`, { waitUntil: "networkidle" });

  console.log("\npage loads");
  check("HTTP 200", response?.status() === 200, `status ${response?.status()}`);
  check("nothing failed on the page", problems.length === 0, problems.slice(0, 3).join(" | "));

  console.log("\nemitted @theme tokens carry their declared values");
  const declared = [
    ...[...textTokens].map(([n, v]) => [`--text-${n}`, v] as const),
    ...[...colourTokens].map(([n, v]) => [`--color-${n}`, v] as const),
    ...[...radiusTokens].map(([n, v]) => [`--radius-${n}`, v] as const),
    ...[...spacingTokens].map(([n, v]) => [`--spacing-${n}`, v] as const),
  ];
  /**
   * Compared through the browser rather than as text: Tailwind minifies
   * `#ffffff` to `#fff`, which is not a difference that reaches a pixel.
   */
  const rootValues = await page.evaluate(
    ({ names, values }: { names: string[]; values: string[] }) => {
      const root = getComputedStyle(document.documentElement);
      const probe = document.createElement("div");
      document.body.append(probe);
      const out = names.map((name, index) => {
        const actual = root.getPropertyValue(name).trim();
        if (actual === "") return { actual, matches: false };
        // Run both sides through the browser so `#fff` and `#ffffff` compare
        // equal; anything the browser will not parse falls back to text.
        probe.style.color = "";
        probe.style.color = actual;
        const left = probe.style.color === "" ? actual : getComputedStyle(probe).color;
        const raw = values[index] ?? "";
        probe.style.color = "";
        probe.style.color = raw;
        const right = probe.style.color === "" ? raw.trim() : getComputedStyle(probe).color;
        return { actual, matches: left === right };
      });
      probe.remove();
      return out;
    },
    { names: declared.map(([n]) => n), values: declared.map(([, v]) => v) },
  );

  /**
   * Tailwind v4 emits only the theme variables some utility actually uses, so a
   * declared token with no consumer is legitimately absent from `:root`. That
   * is a gap in the style guide, not a broken token, and it is reported below
   * rather than failed here.
   */
  const wrong: string[] = [];
  let emitted = 0;
  declared.forEach(([name, value], index) => {
    const seen = rootValues[index];
    if (seen === undefined || seen.actual === "") {
      notEmitted.push(name);
      return;
    }
    emitted += 1;
    if (!seen.matches) wrong.push(`${name} is ${seen.actual}, declared ${value}`);
  });
  check(`${emitted} of ${declared.length} tokens emitted, all matching`, wrong.length === 0, wrong.join(" | "));

  /**
   * Everything below reads elements the page actually renders. A token the
   * style guide never uses cannot be verified here, so it is reported rather
   * than passed — an unexercised token is a gap in the style guide.
   */
  const sample = await page.evaluate(() => {
    const out: Record<string, { fontSize: string; fontWeight: string; lineHeight: string; color: string; background: string; radius: string }> = {};
    for (const element of document.querySelectorAll("*")) {
      const classes = typeof element.className === "string" ? element.className.split(/\s+/) : [];
      if (classes.length === 0) continue;
      // A variant utility (`peer-checked:bg-brand`, `hover:text-ink`) can be the
      // colour actually painted, which would make this element lie about the
      // plain class beside it. Only unconditional elements are trustworthy here.
      if (classes.some((c) => c.includes(":"))) continue;
      const style = getComputedStyle(element);
      const snapshot = {
        fontSize: style.fontSize,
        fontWeight: style.fontWeight,
        lineHeight: style.lineHeight,
        color: style.color,
        background: style.backgroundColor,
        radius: style.borderTopLeftRadius,
      };
      for (const c of classes) if (out[c] === undefined) out[c] = snapshot;
    }
    return out;
  });

  console.log("\ntype tokens render at their declared size and weight");
  for (const [name, size] of textTokens) {
    const seen = sample[`text-${name}`];
    if (seen === undefined) {
      notExercised.push(`text-${name}`);
      continue;
    }
    const weight = textWeights.get(name) ?? "400";
    const leading = textLeading.get(name);
    const sizeOk = seen.fontSize === size;
    const weightOk = seen.fontWeight === weight;
    const leadingOk = leading === undefined || seen.lineHeight === leading;
    check(
      `text-${name}`,
      sizeOk && weightOk && leadingOk,
      `${seen.fontSize}/${seen.lineHeight} w${seen.fontWeight}, declared ${size}/${leading ?? "—"} w${weight}`,
    );
  }

  console.log("\ncolour tokens render as the declared colour");
  const asRgb = await page.evaluate((hexes: string[]) => {
    const probe = document.createElement("div");
    document.body.append(probe);
    const out = hexes.map((h) => {
      probe.style.color = h;
      return getComputedStyle(probe).color;
    });
    probe.remove();
    return out;
  }, [...colourTokens.values()]);
  const expectedColour = new Map([...colourTokens.keys()].map((n, i) => [n, asRgb[i] ?? ""]));

  for (const name of colourTokens.keys()) {
    const expected = expectedColour.get(name);
    const text = sample[`text-${name}`];
    const bg = sample[`bg-${name}`];
    if (text === undefined && bg === undefined) {
      notExercised.push(`text-${name} / bg-${name}`);
      continue;
    }
    if (text !== undefined) check(`text-${name}`, text.color === expected, `${text.color}, declared ${expected}`);
    if (bg !== undefined) check(`bg-${name}`, bg.background === expected, `${bg.background}, declared ${expected}`);
  }

  console.log("\nradius tokens render at the declared radius");
  for (const [name, value] of radiusTokens) {
    const seen = sample[`rounded-${name}`];
    if (seen === undefined) {
      notExercised.push(`rounded-${name}`);
      continue;
    }
    check(`rounded-${name}`, seen.radius === value, `${seen.radius}, declared ${value}`);
  }

  console.log("\nthe class-drop bug (a size and a colour must survive together)");
  const pairs = await page.evaluate(() =>
    [...document.querySelectorAll("*")]
      .filter((e) => {
        const c = typeof e.className === "string" ? e.className : "";
        return /\btext-(display|metric|metric-sm|h1|h2|h3|body|body-sm|caption|overline)\b/.test(c)
          && /\btext-[a-z-]+\b/.test(c.replace(/\btext-(display|metric|metric-sm|h1|h2|h3|body|body-sm|caption|overline)\b/, ""));
      })
      .slice(0, 200)
      .map((e) => {
        const s = getComputedStyle(e);
        return { className: (e.className as string), fontSize: s.fontSize, color: s.color };
      }),
  );
  check("the page pairs a type token with a colour token", pairs.length > 0, `${pairs.length} elements`);
  const bodyDefault = await page.evaluate(() => getComputedStyle(document.body).fontSize);
  for (const pair of pairs.slice(0, 5)) {
    const sizeToken = /\btext-(display|metric-sm|metric|h1|h2|h3|body-sm|body|caption|overline)\b/.exec(pair.className)?.[1];
    const declared = sizeToken === undefined ? undefined : textTokens.get(sizeToken);
    check(
      `"${pair.className}" kept both`,
      pair.fontSize === declared && pair.color !== "rgb(0, 0, 0)",
      `${pair.fontSize} ${pair.color}, declared ${declared ?? "?"} (body is ${bodyDefault})`,
    );
  }

  console.log("\nfonts loaded");
  const fonts = await page.evaluate(() => getComputedStyle(document.body).fontFamily);
  check("body uses the brand sans", /jakarta/i.test(fonts), fonts);

  console.log("\npage rendered its content");
  const counts = await page.evaluate(() => ({
    buttons: document.querySelectorAll("button").length,
    tables: document.querySelectorAll("table").length,
    rows: document.querySelectorAll("tbody tr").length,
    tabs: document.querySelectorAll('[role="tab"]').length,
    icons: document.querySelectorAll("svg").length,
    inputs: document.querySelectorAll("input, select, textarea").length,
  }));
  check("buttons rendered", counts.buttons > 10, `${counts.buttons}`);
  check("table has rows", counts.rows > 0, `${counts.rows} rows in ${counts.tables} table(s)`);
  check("filter tabs rendered", counts.tabs > 0, `${counts.tabs}`);
  check("icons rendered", counts.icons > 0, `${counts.icons}`);
  check("form controls rendered", counts.inputs > 0, `${counts.inputs}`);

  console.log("\nno horizontal overflow");
  const overflow = await page.evaluate(
    () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
  );
  check("body does not scroll sideways", overflow <= 0, `${overflow}px`);

  await page.screenshot({ path: "design-system.png", fullPage: true });
  console.log("\nscreenshot written to apps/web/design-system.png");
}

async function main(): Promise<void> {
  const browser = await chromium.launch(
    EXECUTABLE === undefined ? {} : { executablePath: EXECUTABLE },
  );
  try {
    await run(browser);
  } finally {
    await browser.close();
  }

  if (notEmitted.length > 0) {
    console.log(`\n${notEmitted.length} token(s) declared in globals.css that no utility consumes, so Tailwind drops them:`);
    console.log(`  ${notEmitted.join(", ")}`);
  }

  if (notExercised.length > 0) {
    console.log(`\n${notExercised.length} token(s) the style guide never renders, so nothing here can vouch for them:`);
    console.log(`  ${notExercised.join(", ")}`);
  }

  console.log(failures === 0 ? "\nall render checks passed\n" : `\n${failures} render check(s) failed\n`);
  process.exit(failures === 0 ? 0 : 1);
}

void main();
