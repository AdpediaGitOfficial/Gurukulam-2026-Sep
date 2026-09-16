# Deploying to gurukulam.club

`deployment-uat.md` describes a first-time UAT build under systemd at
`/srv/gurukulam`. **That is not how the live box runs.** Production is a
self-hosted GitHub Actions runner driving PM2, and this document is the truth
about it.

| | |
| --- | --- |
| Trigger | A push to `main` or `claude/project-analysis-6t08cr` |
| Runner | Self-hosted, on the box itself, as `ubuntu` |
| Project | `/var/www/html/gurukulam/gurukulam-claude/Gurukulam-2026-Sep` |
| Backups | `/var/www/html/gurukulam/db-bakup/gurukulamdbbackup_<timestamp>.sql` |
| Processes | `pm2` — `gurukulam-api`, `gurukulam-web` |
| Workflow | `.github/workflows/deployment.yml` |

**Deployment is automatic.** Pushing to the branch deploys it. There is no
manual step in the normal case, and running one by hand *while a run is in
flight* is the main way to get a broken box — see "If you must do it by hand".

---

# THE PROCEDURE — do these in order

Everything below this heading is one pass, start to finish. It was rehearsed
against a scratch copy of the live schema with its migration history removed,
so the commands are the ones that actually worked, not the ones that ought to.

**Read this first, because it explains the order.** The live database has
tables and no migration history, so `prisma migrate deploy` answers **P3005**
and refuses. The deploy workflow never notices, because it decides whether to
migrate by grepping `prisma migrate status` for a string Prisma 6 does not
print ("Why nothing has been migrating", below). Those two faults have been cancelling out: nothing migrates, and
nothing complains.

This release does not tolerate that any more. `colleges.partnership_type` is
read by the college directory, its export and every college detail page — until
its migration runs, **those pages answer 500**.

So: baseline by hand once (Part A), deploy (Part B), verify (Part C). Part A is
a one-time repair. After it, the box migrates normally forever.

---

## Part A — one time, on the box

SSH to the box. Nothing here touches the running site; it repairs the
migration bookkeeping and applies the two pending migrations.

### A1. Back up first

```bash
sudo -u postgres pg_dump gurukulam > ~/gurukulam-before-baseline.sql
ls -lh ~/gurukulam-before-baseline.sql     # sanity: it should not be tiny
```

Every step after this is reversible from that file. Do not skip it.

### A2. Ask what state the database is actually in

```bash
cd /var/www/html/gurukulam/gurukulam-claude/Gurukulam-2026-Sep
git fetch origin && git checkout claude/project-analysis-6t08cr && git pull
sudo -u postgres psql gurukulam -f packages/db/scripts/diagnose-schema.sql
```

Read the last three rows of section 2 and the whole of section 3.

| What you see | What it means | What to do |
| --- | --- | --- |
| Section 2 all **present** | The schema was migrated properly and the history table was lost | Continue to A3 |
| Anything **MISSING** | Those objects were never created — the schema probably came from `db push`, and the invariants they enforce are **not enforced** | **Stop.** Apply that migration's SQL by hand first, then continue. Baselining past it would mark it applied and hide the gap permanently |
| Section 3 returns **rows** | Two live sessions claim one cohort at one moment | **Stop.** Fix them in the console (cancel or reschedule one of each pair), then re-run. The new unique index will be rejected otherwise |
| Section 3 returns **0 rows** | Nothing blocks the index | Continue to A3 |

### A3. Baseline the nine migrations that are already in the schema

These nine are what the live schema already contains. Marking them applied
tells Prisma "these are done" **without re-running them** — it writes history,
it does not touch a table.

```bash
cd /var/www/html/gurukulam/gurukulam-claude/Gurukulam-2026-Sep
SCHEMA=packages/db/prisma/schema.prisma

for m in \
  20260903075419_init \
  20260903075500_constraints \
  20260903091133_id_sequences \
  20260903091817_trainer_city_relation \
  20260903113810_portal_login_identity \
  20260904111720_college_user_revoke_reason \
  20260904121708_trainer_suspension_reason \
  20260908120000_in_house_trainers \
  20260908130000_assignment_release_reason
do
  npx prisma migrate resolve --applied "$m" --schema "$SCHEMA" && echo "  marked $m"
done
```

The two `20260916*` migrations are deliberately **not** in that list. They have
not run, and the next step is what runs them.

### A4. Apply the two that are actually pending

```bash
npx prisma migrate status --schema "$SCHEMA"     # expect exactly 2 pending
npx prisma migrate deploy --schema "$SCHEMA"
```

Expected output:

```
migrations/
  └─ 20260916090000_session_day_uniqueness/
  └─ 20260916120000_college_partnership_type/
All migrations have been successfully applied.
```

Both are safe on existing data: `partnership_type` is an added column with a
`DEFAULT 'B2B'`, so every existing college keeps behaving as it did, and the
session index only fails if A2 section 3 found duplicates, which you have
already cleared.

### A5. Prove it landed

```bash
sudo -u postgres psql gurukulam -c "
  SELECT partnership_type, count(*) FROM colleges GROUP BY 1;
  SELECT indexname FROM pg_indexes WHERE indexname = 'uq_batch_sessions_batch_day_start';
  SELECT count(*) AS applied FROM _prisma_migrations WHERE finished_at IS NOT NULL;"
```

Every college should read `B2B`, the index should be listed, and `applied`
should be **11**.

### A6. Set the receipt issuer

Receipts print the issuing organisation from the environment. Without these
they print half-addressed — which is not an error, just a receipt nobody would
accept. `ORG_LEGAL_NAME` defaults to "Gurukulam"; the rest are blank.

Append to the app's `.env` (the same file Prisma reads):

```bash
cat >> /var/www/html/gurukulam/gurukulam-claude/Gurukulam-2026-Sep/.env <<'ENV'
ORG_LEGAL_NAME="Gurukulam Training Solutions"
ORG_ADDRESS="<street, city, PIN>"
ORG_GSTIN="<GSTIN>"
ORG_EMAIL="accounts@gurukulam.club"
ORG_PHONE="<phone>"
ENV
```

---

## Part B — deploy

Part A left the database ahead of the running code, which is the safe
direction: the old build simply does not read the new column.

**Push to the branch, or re-run the latest workflow from the Actions tab.**
The workflow resets to the remote (`git checkout -B <branch> origin/<branch>`),
so it cannot produce a merge conflict on the box — whatever is on the branch is
what gets deployed.

Wait for the run to finish. Do **not** run a deploy by hand while one is in
flight; that is the main way to get a half-written `node_modules`.

---

## Part C — check the live site

The pages that would have been broken, in the order that proves the most:

| URL | What proves it worked |
| --- | --- |
| `/colleges` | Loads at all. This is the page that 500s without A4, and it now shows a **Partnership** column |
| `/colleges/export` | Downloads a CSV with a `partnership_type` column |
| `/students/certificates` | The register, with **College lists** in the header |
| `/colleges/submissions` | The certificate-list queue exists |
| `/fee-ledger/contracts` | **New contract** in the header; rows open a detail page |
| `/courses/question-bank` | **Add a question** in the header; each card has Edit and Delete |
| `/students` | **Import** in the header; each row has Delete |

From the box, the two health checks the workflow does not currently do:

```bash
curl -fsS http://127.0.0.1:4000/api/v1/health && echo "  api ok"
curl -fsS -o /dev/null http://127.0.0.1:3000/login && echo "  web ok"
sudo pm2 status
```

---

## Part D — so the next release does not need Part A

Part A is a one-time repair. But the workflow will still skip migrations on
every future release until this one line changes, because it tests for a string
Prisma 6 never prints — "Why nothing has been migrating" below has the proof.

In `.github/workflows/deployment.yml`, replace:

```bash
STATUS=$(npx prisma migrate status --schema="${SCHEMA_PATH}" 2>&1 || true)
if echo "${STATUS}" | grep -q "Following migration(s) have not yet been applied"; then
  echo "Applying migrations..."
  npx prisma migrate deploy --schema="${SCHEMA_PATH}"
else
  echo "No pending migrations."
fi
```

with:

```bash
npx prisma migrate deploy --schema="${SCHEMA_PATH}"
```

`migrate deploy` is idempotent — it applies what is missing and prints "No
pending migrations to apply" otherwise — so there is nothing to test for. This
is only safe **after** Part A; before it, every deploy would fail on P3005.

---

## If something goes wrong

**A4 fails on the unique index.** A2 section 3 found nothing but a duplicate
was created between the check and the deploy. Re-run the section 3 query, fix
the pair in the console, run A4 again. Nothing else is affected — Prisma
applies migrations one at a time and stops at the failure.

**A3 marked the wrong thing.** Restore: `sudo -u postgres psql gurukulam <
~/gurukulam-before-baseline.sql`. Nothing in Part A is destructive on its own,
but the backup is what makes that statement safe to rely on.

**The site is down after Part B.** Roll the code back and leave the database
alone — the two migrations are additive and the previous build ignores them:

```bash
sudo pm2 logs gurukulam-api --lines 50 --nostream
git reset --hard <previous-commit> && npm install && npm run build
sudo pm2 restart gurukulam-api gurukulam-web --update-env
```

---

# Background

Not steps. The reasoning behind them, and the two faults that made this
repair necessary — worth reading once so the procedure above is not a
ritual.

## Doing a deploy by hand

Only when the runner itself is down. **Check Actions first** — a manual deploy
racing an automatic one is how a half-written `node_modules` happens.

```bash
cd /var/www/html/gurukulam/gurukulam-claude/Gurukulam-2026-Sep

sudo -u postgres pg_dump gurukulam \
  | sudo tee "/var/www/html/gurukulam/db-bakup/manual_$(date +%F_%H-%M-%S).sql" > /dev/null

git fetch origin --prune
git reset --hard origin/claude/project-analysis-6t08cr

sudo chown -R "$(id -u):$(id -g)" .
npm ci
npx prisma migrate deploy --schema=./packages/db/prisma/schema.prisma
npm run build
sudo pm2 restart gurukulam-api gurukulam-web --update-env

curl -fsS http://127.0.0.1:4000/api/v1/health && echo && \
curl -fsS -o /dev/null -w 'console %{http_code}\n' http://127.0.0.1:3000/login
```

---

## Why nothing has been migrating

**The workflow on this branch does not run migrations.** It was reverted on
16 September to the version that decides whether to migrate by grepping
`prisma migrate status` for:

```
Following migration(s) have not yet been applied
```

Prisma 6 prints `Following migrations have not yet been applied` — no `(s)`.
Reproduced against a scratch database on this branch: that grep matches **zero**
times, so the script takes the `else` branch, prints "No pending migrations",
and `prisma migrate deploy` is never reached. It has never run.

Two migrations are waiting:

| Migration | What it adds |
| --- | --- |
| `20260916090000_session_day_uniqueness` | the partial unique index on `(batch, date, start time)` |
| `20260916120000_college_partnership_type` | the `partnership_type` column and its enum |

**The second one is not optional.** `colleges.service.ts` selects
`partnership_type`, and the college directory, the college export and every
college detail page read it. Until the migration runs, those pages answer 500
on the live box — the column the query names does not exist.

The one-line fix is to stop asking and just do it, because `migrate deploy` is
idempotent — it applies what is missing and does nothing otherwise:

```bash
npx prisma migrate deploy --schema="${SCHEMA_PATH}"
```

**But do not paste that in blind.** The live database has tables and no
migration history, so `migrate deploy` will answer P3005 and stop the deploy —
which is exactly why the workflow "worked" while skipping migrations. Section 0
is the baselining procedure, and it starts by asking whether the hand-written
constraints are actually there, because if the live schema came from `db push`
they are not. Part A2 is the duplicate-session check that has to come back
empty before the unique index can apply.

Order: diagnose (A2) → clear duplicates (A2) → baseline (A3) → apply (A4) →
then make the workflow migrate (Part D).

## The other thing that was silently wrong

**The build died on file permissions.** `prisma generate` writes into
`node_modules/.prisma/client`, and something in that tree was owned by another
user — one `sudo npm install` is enough to do it. The build failed `EACCES`, the
run stopped after the checkout, and the box was left with new source and an old
build. The current workflow chowns the project directory to `ubuntu` on every
run, which covers it.

That, and the grep above, are why the two deploys on 16 September looked fine
and were not. Neither was visible from the app, which is the point: a deploy
that reports success without running the migration is worse than one that
fails, because nobody goes looking.
