# ADR 0001 — Split frontend and backend into two deployable services

**Status:** Accepted · **Supersedes:** `admin-portal-plan.md` §4, row 1

## Context

`admin-portal-plan.md` §4 settled on Next.js App Router with Server Components and Server Actions,
and no separate API process. That decision was correct for its stated premise: **one consumer**, the
admin console.

The premise changed. The system must serve:

- the Next.js admin console,
- native mobile applications,
- third-party consumers.

Server Actions are a Next.js-internal RPC mechanism. They are not addressable by a mobile client or
an external integrator, so under the new premise the §4 design would require a second API surface to
be built alongside them — the same logic reachable two ways, which is how the two paths drift and
how a scope filter ends up applied on one and not the other.

## Decision

Two independently deployable services in one monorepo:

- **`apps/api`** — NestJS on Fastify, owning PostgreSQL through Prisma. The only writer to the
  database. Every consumer, the console included, goes through `/api/v1`.
- **`apps/web`** — the Next.js console. It holds no business logic and never talks to Postgres. It
  acts as a **BFF**: Server Components fetch server-side with the session cookie, and Server Actions
  become thin proxies that call the API and `revalidatePath`.

One repository, so `packages/contracts` can be the single source of truth for every request and
response shape. Two repositories would give us independent deploys and lose that; a contract
drifting across three client platforms is the more expensive failure.

## Consequences

**What this preserves.** The handoff's structural intent survives intact — it moves rather than
disappears. `architecture.md` §2.3 named `features/*/server/*-service.ts` as "the only place that
knows where data comes from". That seam is now `apps/api/src/modules/*/​*.repository.ts`, and the
rule strengthens: with three consumers, business logic in a controller is reachable by one client
and not the others.

**What this preserves, specifically:**

- Invariant 11 (scope applied inside the service, never by the caller) becomes *more* important, not
  less. A third-party API key hitting `/api/v1/students` traverses the same service as an admin, so
  the scope filter cannot be forgotten on one path.
- `searchParams`-as-state (§2.4) is unaffected — the console still renders server-side from the URL;
  those params become API query params.
- The design system, the token layer and the dependency rule are untouched.

**What this costs.**

- Two deployments, CORS configuration, and cross-service authentication.
- A network hop between console and data. Mitigated by server-side fetching (no browser round trip)
  and colocated deployment.
- Validation must live in the API. `packages/contracts` is shared so the console can validate
  optimistically, but the API's check is the authoritative one and never trusts the caller's.

## Alternatives considered

**Keep §4 and add `app/api/v1/*` route handlers over the same services.** Cheaper, one deploy, and
genuinely adequate — it was the recommendation while the consumer count was uncertain. Rejected once
independent backend deployment became a requirement: it couples the API's availability and release
cadence to the console's.

**Two repositories.** Rejected — see Decision. The shared contract is worth more than the
separation.
