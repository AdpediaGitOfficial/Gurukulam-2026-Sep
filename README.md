# Gurukulam TMS

Multi-tenant training management system for an EdTech operator running technical courses through
two channels: **retail** walk-ins and **B2B college** engagements.

Start with [`CLAUDE.md`](CLAUDE.md), then [`docs/architecture.md`](docs/architecture.md).

> **Architecture note.** This repo splits the frontend and backend into two independently
> deployable services, which reverses `docs/admin-portal-plan.md` §4. The reasoning is recorded in
> [`docs/adr/0001-split-frontend-and-backend.md`](docs/adr/0001-split-frontend-and-backend.md) —
> read that before treating §4 as current.

## Layout

```
apps/
  api/          Node.js (NestJS) backend — deploys independently
  web/          Next.js console — deploys independently
packages/
  db/           Prisma schema, migrations, seed
  contracts/    Zod schemas + inferred types + generated OpenAPI
  ui/           the ported design system
design-kit/     the design system as shipped in the handoff (staging; ported in Phase 5)
docs/           the specification set
```

## Prerequisites

- **Node 22 LTS** and **pnpm 10**
- **PostgreSQL 16** running locally, or `docker compose up -d`

## Getting started

```bash
pnpm install
cp .env.example .env          # then edit DATABASE_URL if yours differs
pnpm db:migrate               # apply migrations
pnpm db:seed                  # both segments: retail + college
```

## Database commands

| Command | What it does |
| --- | --- |
| `pnpm db:migrate` | Apply pending migrations (dev) |
| `pnpm db:generate` | Regenerate the Prisma client |
| `pnpm db:seed` | Load seed data — retail and college paths both represented |
| `pnpm db:reset` | Drop, re-migrate and re-seed |
| `pnpm db:studio` | Open Prisma Studio |
