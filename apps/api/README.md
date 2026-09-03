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
| `pnpm --filter @gurukulam/api verify` | Integration checks against a **running** API |

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

**Lockout needs Redis in production.** Five failures in fifteen minutes locks for thirty. Without
`REDIS_URL` it falls back to a per-process counter and warns loudly at boot — which lets an attacker
have five attempts *per replica*, so that fallback is for local development only.

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
