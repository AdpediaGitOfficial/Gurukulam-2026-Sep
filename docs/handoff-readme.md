# Gurukulam TMS — handoff bundle

Everything needed to build the application in a fresh repository.

## What to do with it

```bash
# 1 — copy the contents of this folder into your new repo root
cp -R handoff/CLAUDE.md handoff/docs  <new-repo>/

# 2 — copy the design system into place
cp -R handoff/design-kit/src          <new-repo>/

# 3 — merge the peer dependencies listed in design-kit/package.deps.json,
#     then wire the two fonts in your root layout
```

`CLAUDE.md` belongs at the **repo root**. It is the first thing an agent reads: what the product is,
the invariants, the stack decisions and why, the module recipe, and what is deliberately deferred.

## Contents

```
CLAUDE.md                     Drop at the new repo root — the agent briefing
docs/
  architecture.md             Domain model, 19 invariants, transactional flows, extension contract
  modules.md                  Every module, screen, route, entity and operation
  admin-portal-plan.md        Build specification and sequencing
  notifications-and-reports.md  Notification catalogue (~45) and report grammar (31 reports)
  design-system.md            UI layer rules
  brand-guidelines.md         Visual language
  reuse-kit.md                Design-kit port checklist — read §4 before adding a token
  prototype/index.html        Clickable prototype, 60 routes. Open in a browser
  Gurukulam_TMS_System_Architecture.pdf   The architecture doc, printable
design-kit/
  src/app/globals.css         The token layer — merge into your global stylesheet FIRST
  src/design-system/tokens.ts Typed token access for charts and inline styles
  src/lib/cn.ts               Class merger + scale registration (see the warning below)
  src/components/ui/          27 primitives
  src/components/patterns/    10 composed blocks
  src/components/layout/      Console shell, navigation rail, top bar
  src/config/                 navigation.ts, site.ts
  public/icons/               34 SVGs, rendered as CSS masks over currentColor
  package.deps.json           Peer dependencies to merge
```

## The one thing that will silently break

`src/lib/cn.ts` registers the custom token scales with tailwind-merge. Without it, tailwind-merge
cannot tell a custom font size from a custom colour — both look like `text-*` — so it groups them
and **removes the class from the DOM**. The source still looks correct, which is why this survives
code review. Copy `cn.ts` verbatim, and when you add a token remember it lives in **two** files:
the `@theme` block *and* the scale lists in `cn.ts`.

Full detail in `docs/reuse-kit.md` §4.

## Verify the port landed

Mount the style guide page and open it. If the tokens did not land you will see it instantly —
swatches render transparent and every type specimen collapses to one size.

## State of the work

The prototype covers all 60 routes and every screen. The application code is **not** carried over:
the previous repo had the design system, console shell, dashboard, students list and localisation
built against mock in-memory data, with no database, no auth and no scoping. Build those properly
here — `docs/architecture.md` §1 is honest about what existed, and §9 is the module checklist.
