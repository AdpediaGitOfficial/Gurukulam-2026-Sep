/**
 * Walks every prototype and reports what a reviewer would otherwise find by
 * clicking.
 *
 *     node docs/prototype/check.mjs
 *
 * For each file it visits every route the prototype defines, in every segment
 * its switch offers, at desktop and phone width, and checks four things:
 *
 *   · every `href` and every `location.hash` target resolves to a real route —
 *     a prototype with a dead link teaches the wrong thing about the product;
 *   · every screen renders a heading, so nothing is silently blank;
 *   · nothing scrolls sideways, at either width;
 *   · no page errors.
 *
 * It earns its keep: the trainer portal's month calendar pushed the page 18px
 * sideways on a phone, because a grid item takes its content's width unless
 * told otherwise, and that is invisible on a desktop screenshot.
 *
 * Needs Playwright and a Chromium. On a box where the browser lives outside
 * node_modules, point CHROME at it:
 *
 *     CHROME=/opt/pw-browsers/chromium node docs/prototype/check.mjs
 */
import { chromium } from "playwright";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const here = dirname(fileURLToPath(import.meta.url));

/** `routes` names the global holding the page map; the portals and the admin
    console key it differently, so each file says which it is. */
const FILES = [
  // The admin console is a DESK instrument — a fixed rail and tables that scroll
  // inside their own containers, deliberately. Holding it to a 390px viewport
  // measures it against a claim it never made, so it is checked at the widths it
  // is actually built for. The portals are phone-first and are checked at both.
  { name: "admin",   file: "index.html",   routes: "P", keyed: "bare",
    segments: [], widths: [1440, 1024] },
  { name: "student", file: "student.html", routes: "V", keyed: "hashed",
    segments: ["retail", "college"], widths: [1440, 390] },
  { name: "trainer", file: "trainer.html", routes: "V", keyed: "hashed",
    segments: ["freelance", "inhouse"], widths: [1440, 390] },
];

const launch = process.env["CHROME"] ? { executablePath: process.env["CHROME"] } : {};
const browser = await chromium.launch(launch);

let failures = 0;

for (const spec of FILES) {
  const url = "file://" + join(here, spec.file);
  // Every route is reached at `…html#/x`. The admin console keys its map bare
  // (`/x`); the portals key theirs hashed (`#/x`). Normalise both ways once.
  const strip = (r) => (r.startsWith("#") ? r.slice(1) : r);
  const asKey = (r) => (spec.keyed === "bare" ? strip(r) : "#" + strip(r));
  const toUrl = (r) => url + "#" + strip(r);
  const problems = new Set();
  let routeCount = 0;
  let targetCount = 0;

  for (const width of spec.widths) {
    const page = await browser.newPage({ viewport: { width, height: 1000 } });
    page.on("pageerror", (e) => problems.add(`${width}px — ${e}`));
    page.on("console", (m) => {
      // The font stylesheet fails on a box with no egress; that is the sandbox,
      // not the page.
      if (m.type() === "error" && !/ERR_CONNECTION|ERR_NAME/.test(m.text())) {
        problems.add(`${width}px — ${m.text()}`);
      }
    });

    await page.goto(url, { waitUntil: "load" });
    // Indirect eval, not globalThis[...]: the page maps are top-level `const`
    // declarations, and a `const` never becomes a property of globalThis.
    const routes = (await page.evaluate((g) => Object.keys((0, eval)(g)), spec.routes))
      .filter((r) => r.startsWith("/") || r.startsWith("#/"));
    routeCount = routes.length;

    const targets = new Set();
    const segments = spec.segments.length > 0 ? spec.segments : [null];

    for (const segment of segments) {
      if (segment !== null) {
        await page.goto(url, { waitUntil: "load" });
        await page.click(`#seg-${segment}`);
        await page.waitForTimeout(120);
      }
      for (const route of routes) {
        await page.goto(toUrl(route), { waitUntil: "load" });
        await page.waitForTimeout(40);

        const headings = await page.evaluate(() => document.querySelectorAll("h1, h2").length);
        if (headings === 0) problems.add(`no heading — ${segment ?? "default"} ${route} @${width}px`);

        const overflow = await page.evaluate(
          () => document.body.scrollWidth - document.body.clientWidth,
        );
        if (overflow > 1) {
          problems.add(`scrolls ${overflow}px sideways — ${segment ?? "default"} ${route} @${width}px`);
        }

        for (const target of await page.evaluate(() => {
          const found = [];
          document.querySelectorAll('a[href^="#"]').forEach((a) => found.push(a.getAttribute("href")));
          document.querySelectorAll("[onclick]").forEach((el) => {
            const match = /location\.hash='([^']+)'/.exec(el.getAttribute("onclick") ?? "");
            if (match) found.push(match[1]);
          });
          return found;
        })) {
          targets.add(asKey(target));
        }
      }
    }

    targetCount = targets.size;
    for (const target of targets) {
      // The admin prototype's login screen is rendered outside its page map.
      if (strip(target) === "/login") continue;
      if (!routes.includes(target)) problems.add(`dead link — ${target} @${width}px`);
    }
    await page.close();
  }

  const ok = problems.size === 0;
  if (!ok) failures += 1;
  const mark = ok ? "[32m✓[0m" : "[31m✗[0m";
  console.log(`  ${mark} ${spec.name.padEnd(8)} ${routeCount} routes, ${targetCount} link targets`);
  for (const problem of [...problems].slice(0, 10)) console.log(`      [31m${problem}[0m`);
}

await browser.close();
console.log(failures === 0 ? "\n  every prototype walks clean\n" : `\n  ${failures} prototype(s) with problems\n`);
process.exit(failures === 0 ? 0 : 1);
