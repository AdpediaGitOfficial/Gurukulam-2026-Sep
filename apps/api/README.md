# `@gurukulam/api`

The backend. NestJS on Fastify, owning PostgreSQL through `@gurukulam/db`. Every consumer — the
admin console, mobile clients, third-party integrations — goes through `/api/v1`. There is no
privileged internal path, which is the point: a scope filter that exists on one route and not
another is the bug this shape prevents.

## Running it

```bash
# from the repo root
pnpm install
cp .env.example .env
pnpm db:migrate && pnpm db:seed
pnpm --filter @gurukulam/api dev
```

Then `http://localhost:4000/api/v1/docs` for Swagger UI, `/api/v1/openapi.json` for the raw
document.

| Command | What it does |
| --- | --- |
| `pnpm --filter @gurukulam/api dev` | Watch mode |
| `pnpm --filter @gurukulam/api build` | Compile to `dist/` |
| `pnpm --filter @gurukulam/api test` | Unit tests — pure logic, no server needed |
| `pnpm --filter @gurukulam/api verify` | Auth integration checks against a **running** API |
| `pnpm --filter @gurukulam/api verify:modules` | Module and scope checks against a **running** API |
| `pnpm --filter @gurukulam/api verify:delivery` | Batch, session and trainer-handshake checks |
| `pnpm --filter @gurukulam/api verify:enrolment` | Allocation and segment checks, including the acceptance test |
| `pnpm --filter @gurukulam/api verify:money` | Ledger, contract, payment and reminder-recipient checks |
| `pnpm --filter @gurukulam/api verify:certificates` | Submission flow, eligibility and the access asymmetry |

## Shape

```
src/
├── config/          env validated at boot; the process refuses to start if it is wrong
├── common/
│   ├── guards/      AuthGuard — global, opt-out
│   ├── decorators/  @CurrentPrincipal, @Public, @RequirePermission
│   ├── filters/     one error shape leaves this API, whatever went wrong
│   ├── interceptors/ bigint → string, Date → ISO
│   └── pipes/       Zod validation → field-keyed errors
└── modules/<module>/
    ├── *.controller.ts   HTTP only — parse, delegate, serialise
    ├── *.service.ts      ALL business logic, scope and invariants
    └── *.repository.ts   Prisma only
```

**Controllers hold no logic; repositories hold no rules.** Every service method takes the
`Principal` first and applies scope itself (invariant 11).

## Decisions worth knowing before you extend it

**Authentication is global and opt-out.** `AuthGuard` is registered as an `APP_GUARD`, so a new
route is protected the moment it exists and has to opt out with `@Public()`. The opposite default
means the one route someone forgets is the one that leaks.

**The principal is rebuilt from the database on every request**, not read from the token. Revoking a
permission or narrowing a city scope takes effect immediately; otherwise the access token's lifetime
becomes the lag on every security change. Verified — `verify-auth.ts` revokes a permission and
re-calls `/auth/me` with the *same* token.

**`@RequirePermission` is a coarse gate only.** It answers "may this actor touch this module at
all?". *Which records* they may touch is scope, and a guard cannot see rows — so scope lives in the
service. Never filter by scope in a controller.

**Refresh tokens are opaque and rotate.** A refresh token must be revocable, and a self-contained
JWT cannot be revoked without a lookup — at which point the lookup is the source of truth anyway.
Presenting an already-rotated token means a copy leaked, since the legitimate holder has exactly
one: the whole chain is revoked rather than just refusing the request, because refusing would leave
the thief's newer token working.

**Login does not reveal which accounts exist.** The message is identical for an unknown address and
a wrong password — and a missing account still runs a full hash, so the *timing* is identical too.
Skipping that work turns login latency into an enumeration oracle even when the message is careful.

**Out-of-scope reads return 404, not 403.** A 403 tells a scoped operator that a record exists in
another region, which is itself the leak.

**Money leaves as a string.** `JSON.stringify(1n)` throws, and `Number(bigint)` loses precision
above 2^53 — reachable by a college contract's total in paise. The `SerialiseInterceptor` converts
`bigint` to string on the way out; clients parse it as a big integer, never a float.

**An empty body is accepted where the route takes no body.** Fastify's default
JSON parser rejects an empty payload that declares `application/json`, and many
HTTP clients set that header unconditionally — so `DELETE /courses/:id` would
fail for a caller doing nothing wrong. Nest's own parser is disabled
(`bodyParser: false`) and replaced with one that reads an empty body as `{}`.
Malformed JSON is still a clean `VALIDATION_FAILED`.

**Lockout needs Redis in production.** Five failures in fifteen minutes locks for thirty. Without
`REDIS_URL` it falls back to a per-process counter and warns loudly at boot — which lets an attacker
have five attempts *per replica*, so that fallback is for local development only.

## Adding a module

Six files, in this order. `courses/` is the worked example for an unscoped
module, `colleges/` for one scoped on both axes.

1. **Contract first** — `packages/contracts/src/<module>/index.ts`: the entity
   schema, `<X>Query` extending `pageQuerySchema`, and the create/update inputs.
2. **Service** — takes the `Principal` first, applies scope itself, holds every
   rule.
3. **Controller** — parse, delegate, serialise. `@RequirePermission(module, action)`
   on each route.
4. **Module** — register it in `app.module.ts`.
5. **OpenAPI** — add the path entries in `src/openapi.ts`; the schemas come
   from the contract automatically.
6. **Verify** — extend `scripts/verify-modules.ts`, especially the scope
   section.

### Rules the modules already follow

**Scope is applied in the service, never the controller.** `cityScope()` and
`collegeScope()` produce Prisma `where` fragments; `assertInScope()` guards
writes, where the caller already holds the id. A guard cannot see rows, so it
cannot do this job.

**Reads filter, writes assert.** An out-of-scope row simply does not appear in a
list. Fetching one by id returns **404, not 403** — a 403 confirms that a record
exists in another region, which is itself the leak.

**Row mapping is explicit.** Every service ends with a `toX(row)` function
listing fields one by one rather than spreading the record. That is what keeps
`password_hash` off the wire when someone adds a column later.

**Booleans from a query string use `queryBoolean`, never `z.coerce.boolean()`.**
Coercion runs JavaScript's `Boolean()`, under which every non-empty string is
true — so `?includeDeleted=false` parsed as TRUE and an operational read
returned soft-deleted rows. A UI that always sends the parameter explicitly is
exactly the case that hits it.

**Money is parsed, never floated.** Operator input goes through `parseRupees`
(integer arithmetic on the string) and leaves as a paise string.

**Business IDs are allocated OUTSIDE the transaction that inserts the row.**
Inside one, a failed insert rolls the counter back with it, so a retry asks for
the same number and can never make progress. Burning a code on a failed attempt
leaves a gap, which costs nothing. Creates that allocate a code are wrapped in
`withBusinessIdRetry`, because a counter can fall behind the rows it names — a
restored backup or a renumbered key — and the next number is free, so a
collision should not be a 500.

**A sequence key must be derived from the same stem the code carries.** Keying
a counter on a full name while building the code from initials gives "Data
Analytics" and "Digital Assurance" independent counters and then the same
`BTC-DA-SEP-A`. Use `codeInitials()` for both.

**Business IDs come from `IdService`.** Allocation is a single atomic
`INSERT … ON CONFLICT DO UPDATE`, not a read-then-write, so two operators
creating a record in the same second cannot receive the same code. Update
schemas never accept one — a business ID is immutable once issued.

**Certificate ACCESS is not the same as eligibility.** A retail student
downloads their own; a college student — who earned it on identical terms —
downloads none, because their institution holds it. The rule lives in
`certificateAccess()` as a pure function precisely so it can be asserted for
the STUDENT actor, whose portal does not exist yet and therefore cannot be
exercised over HTTP.

**The seed's module list must match `MODULES` in the contracts package.** A
module missing from a role's permissions is not a cosmetic gap: the guard
denies it outright, so a Super Admin silently loses a whole surface. That is
how `certificates` went missing until M12 exercised it.

**Nothing in the fee ledger deletes.** A receipt is a financial record; the
correction is a reversing entry that leaves the original in place. Overpayment
is refused at write time rather than accepted and corrected — a corrected
overpayment leaves a reversal in the register that never had to exist.

**A reminder's recipient is resolved from the installment's parent**, never a
stored column. A stored recipient is written once at creation and is wrong the
first time a student transfers or a contract changes hands. The specific
failure this prevents: a college's student receiving an invoice that is not
theirs.

**Deletes are soft and guarded.** A course with running batches, a trainer
confirmed on live delivery, and a college with students all refuse removal with
a 409 rather than orphaning what points at them.

## The OpenAPI document is generated, not written

`src/openapi.ts` builds the spec from the Zod schemas in `@gurukulam/contracts` — the same schemas
the API validates against. A hand-maintained spec drifts silently: the API keeps rejecting payloads
the document calls valid, and the mobile team debugs it for a day. Adding an endpoint means adding
its path entry there; the schemas come along automatically.

## Verifying a change

`pnpm --filter @gurukulam/api test` covers the pure logic. `verify` covers the properties that are
expensive to discover missing later, against a running server and a seeded database:

- scope reaches the principal, for admins, regional sub-admins and college users alike
- a revoked permission takes effect on an already-issued token
- a rotated refresh token cannot be replayed, and replaying it kills the chain
- signing out of one device leaves the others signed in
- five failures lock the account
- login does not distinguish an unknown address from a wrong password

Run both before pushing.
