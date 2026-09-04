# Deployment

## Read this first — two blockers for a public deployment

The build is production-ready; the **application** is not, in two specific ways. Both are by design
(there is no backend yet), but shipping without addressing them would be a mistake.

### 1. There is no database — writes do not survive

Every write lands in a module-level array:

```
src/features/countries/server/countries-service.ts   COUNTRIES.push(...) / Object.assign(...)
src/features/cities/server/cities-service.ts         CITIES.push(...)
```

Consequences:

- **Serverless / multi-instance (Vercel, Cloud Run, ECS):** a write lands on whichever instance
  served the request. The next request may hit a different one and not see it. Data appears to
  vanish at random.
- **Single Node server:** it works — until the process restarts or you redeploy, at which point
  everything reverts to the seed fixtures.

**Fix before launch:** replace the bodies of the two service files with real queries. Every caller
depends on the typed contracts (`CountryPage`, `CityPage`, …), not on where the data lives, so no
component or page changes. That was the point of the seam.

### 2. There is no authentication

`src/features/auth/server/get-current-user.ts` returns a hardcoded Super Admin. Deploying as-is
publishes an admin console — including the archive and onboarding actions — to anyone with the URL.

**Fix before launch:** wire a real session lookup in that function and add a middleware guard over
the `(console)` route group. Until then, keep the deployment behind SSO, a VPN, or HTTP basic auth
at the proxy.

---

## Prerequisites

- **Node 22 LTS.** Node 20.12 builds, but installs emit `EBADENGINE` warnings because a
  transitive dependency wants `^20.19 || ^22.13 || >=24`. Use 22 and the warnings go away.
- `sharp` is already present via Next 16, so production image optimisation works with no extra step.

## Build and run locally the way production will

```bash
npm ci
npm run build
npm start
```

`npm ci` (not `install`) — it installs exactly what `package-lock.json` pins, which is what you
want on a build machine.

> Do not run `next build` while `next dev` is running against the same checkout. They share
> `.next`, and the dev server will start serving a broken tree with stale module errors.

---

## Option A — Vercel

Lowest effort for Next.js; note the multi-instance warning above applies in full.

```bash
npm i -g vercel
vercel link
vercel --prod
```

Or connect the Git repository in the Vercel dashboard and it builds on push. No configuration is
needed — the framework preset detects Next.js, and `/localisation/countries`, `/localisation/cities`
and `/students` are already marked dynamic in the build output.

## Option B — Node server on a VPS

Best fit today, because a single long-lived process makes the in-memory fixture behave.

```bash
# on the server
git clone <repo> /srv/gurukulam && cd /srv/gurukulam
npm ci
npm run build
```

Run it under a supervisor so it restarts on crash and boot:

```ini
# /etc/systemd/system/gurukulam.service
[Unit]
Description=Gurukulam TMS
After=network.target

[Service]
Type=simple
WorkingDirectory=/srv/gurukulam
Environment=NODE_ENV=production
Environment=PORT=3000
ExecStart=/usr/bin/npm start
Restart=always
User=www-data

[Install]
WantedBy=multi-user.target
```

```bash
sudo systemctl enable --now gurukulam
```

Terminate TLS and proxy at nginx:

```nginx
server {
  listen 443 ssl http2;
  server_name tms.example.com;

  ssl_certificate     /etc/letsencrypt/live/tms.example.com/fullchain.pem;
  ssl_certificate_key /etc/letsencrypt/live/tms.example.com/privkey.pem;

  location / {
    proxy_pass http://127.0.0.1:3000;
    proxy_http_version 1.1;
    proxy_set_header Host              $host;
    proxy_set_header X-Real-IP         $remote_addr;
    proxy_set_header X-Forwarded-For   $proxy_add_x_forwarded_for;
    proxy_set_header X-Forwarded-Proto $scheme;
  }

  # Immutable build assets — safe to cache hard.
  location /_next/static/ {
    proxy_pass http://127.0.0.1:3000;
    add_header Cache-Control "public, max-age=31536000, immutable";
  }
}
```

**Deploy an update:** `git pull && npm ci && npm run build && sudo systemctl restart gurukulam`.
There is a few seconds of downtime on restart; run two instances behind nginx `upstream` and
restart them one at a time if that matters.

## Option C — Docker

Add one line to `next.config.ts` first — it makes the image a fraction of the size by tracing only
the files actually imported:

```ts
const nextConfig: NextConfig = { output: "standalone" };
```

```dockerfile
FROM node:22-alpine AS deps
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci

FROM node:22-alpine AS builder
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY . .
RUN npm run build

FROM node:22-alpine AS runner
WORKDIR /app
ENV NODE_ENV=production PORT=3000
RUN addgroup -S nodejs && adduser -S nextjs -G nodejs
COPY --from=builder /app/public ./public
COPY --from=builder --chown=nextjs:nodejs /app/.next/standalone ./
COPY --from=builder --chown=nextjs:nodejs /app/.next/static ./.next/static
USER nextjs
EXPOSE 3000
HEALTHCHECK --interval=30s --timeout=3s CMD wget -qO- http://127.0.0.1:3000/api/health || exit 1
CMD ["node", "server.js"]
```

`.dockerignore`:

```
node_modules
.next
.git
```

---

## Environment variables

None are required today — nothing in `src/` reads `process.env`. You will need them the moment the
two blockers above are addressed. Add them to `.env.local` for development (already git-ignored)
and to the host's secret store for production. Never commit real values.

Likely first entries: `DATABASE_URL`, and whatever your identity provider needs.

## Health check

`GET /api/health` → `{"status":"ok","uptime":<seconds>}`, uncached.

Point your load balancer or uptime monitor at it. It deliberately does not touch a database — a
health check that runs a query turns a slow query into a false "instance is dead" signal and can
drain the whole fleet.

## After deploying — verify

```bash
curl -fsS https://tms.example.com/api/health
```

Then walk the two write paths, because they are the ones that will expose the persistence problem
if it has not been fixed:

1. `/localisation/countries/new` → onboard a country → confirm it appears under the **Draft** tab.
2. Hard-refresh, or hit the URL again a few times. On a multi-instance host the record will
   intermittently disappear. That is the in-memory fixture, not a bug in the page.
