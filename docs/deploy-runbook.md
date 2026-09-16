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

## 0. STOP — the live database has no migration history

The deploy on 16 September got as far as migrating and was refused:

```
10 migrations found in prisma/migrations
Following migrations have not yet been applied:
20260903075419_init
... all ten ...
Error: P3005
The database schema is not empty.
```

Prisma sees a database full of tables and a `_prisma_migrations` table that
knows about **none** of them, so it refuses to run `init` over live data. This
is right, and it has to be resolved by a person before any deploy can migrate.

It went unnoticed because the workflow's migration check never matched (§7), so
every deploy printed "No pending migrations" and skipped straight to the build.
**The schema has been drifting from `prisma/migrations` for the life of this
deployment.**

There are two ways to arrive here and they need opposite fixes, so **diagnose
before you touch anything**:

```bash
cd /var/www/html/gurukulam/gurukulam-claude/Gurukulam-2026-Sep
sudo -u postgres psql gurukulam -f packages/db/scripts/diagnose-schema.sql
```

**If everything in section 2 reads `present`** — the schema was migrated
properly and the history table was lost. Baseline it: tell Prisma what is
already there, then deploy normally.

```bash
for m in 20260903075419_init 20260903075500_constraints 20260903091133_id_sequences \
         20260903091817_trainer_city_relation 20260903113810_portal_login_identity \
         20260904111720_college_user_revoke_reason 20260904121708_trainer_suspension_reason \
         20260908120000_in_house_trainers 20260908130000_assignment_release_reason; do
  npx prisma migrate resolve --applied "$m" --schema=./packages/db/prisma/schema.prisma
done
```

Note what is **not** in that list: `20260916090000_session_day_uniqueness`, this
release's migration. It genuinely has not been applied, so it is left for
`migrate deploy` to apply for real.

**If anything reads `MISSING`** — the schema came from `prisma db push` or a
dump of one. `db push` applies the schema and skips hand-written SQL entirely,
which means the CHECK constraints, the GENERATED columns and the live-row
unique indexes **do not exist on production and the invariants they enforce are
not being enforced**. Do not baseline past them. Apply that migration's SQL
first, confirm the diagnostic turns `present`, and only then resolve it:

```bash
sudo -u postgres psql gurukulam \
  -f packages/db/prisma/migrations/20260903075500_constraints/migration.sql
```

That file is idempotent in the parts that matter, but read it first — it drops
and recreates three generated columns, and on a busy database that is a moment
of downtime rather than a no-op.

---

## 1. Before you push: the one thing that can fail this release

Release `20260916090000_session_day_uniqueness` adds a **partial unique index**
on `batch_sessions (batch_id, scheduled_date, start_time)` for live,
uncancelled rows. Every migration before it only added columns. This one can be
**rejected by existing data**: if the live database already holds two sessions
for one batch at the same time on the same day, `CREATE UNIQUE INDEX` fails.

Check first. On the box:

```bash
sudo -u postgres psql gurukulam -c "
SELECT batch_id, scheduled_date, start_time, count(*), string_agg(session_code, ', ')
  FROM batch_sessions
 WHERE deleted_at IS NULL AND status <> 'CANCELLED'
 GROUP BY 1, 2, 3
HAVING count(*) > 1;"
```

**No rows** — you are clear, push and stop reading this section.

**Rows returned** — each is two sessions claiming one cohort at one moment, so
one of them is wrong and a person has to say which. Cancel or soft-delete the
loser through the console (Sessions → the batch → the row), then re-run the
query. Do not delete rows in SQL: a session carries attendance, a recording and
assignments, and the console's guards exist to keep those attached.

**If it fails anyway, nothing is broken.** Postgres rolls the failed index back,
the workflow stops before building or restarting, and the box keeps serving the
previous build against the previous schema. Fix the duplicates and push again.

---

## 2. Set the receipt issuer, or receipts print half-addressed

New in this release. The receipt is a financial document and its issuer block
comes from the environment, because the schema holds no organisation row.

Add to the box's env file — `/var/www/html/gurukulam/gurukulam-claude/Gurukulam-2026-Sep/.env`:

```bash
ORG_LEGAL_NAME="Gurukulam"          # whatever the legal entity actually is
ORG_ADDRESS="…, Kochi, Kerala 682…"
ORG_GSTIN="32ABCDE1234F1Z5"
ORG_EMAIL="accounts@gurukulam.club"
ORG_PHONE="+91 …"
```

Only the name has a default. **A field you leave blank is left off the
document** — deliberately, because a receipt printing a placeholder GSTIN is a
document somebody will file and act on. Set these *before* pushing, so the
first receipt anyone issues is already correct.

---

## 3. Deploy

```bash
git push origin claude/project-analysis-6t08cr
```

Then watch it: **Actions → Deploy Gurukulam App**. The run is ordered so that a
failure at any step leaves the box on the previous, working build:

1. **Back up the database.** Refuses to continue if the dump is implausibly
   small — a backup that silently wrote nothing is worse than none, because it
   is what you reach for at the worst possible moment.
2. **Reset to the remote.** `git reset --hard origin/<branch>`, not `git pull`:
   a pull can conflict, or leave a merge commit on a box nobody resolves
   conflicts on.
3. **Take ownership** of the project directory.
4. **`npm ci`.** Exactly the lockfile, or fail.
5. **`prisma migrate deploy`.** Idempotent — applies what is missing.
6. **Build.** contracts → db → api → web.
7. **Restart PM2.**
8. **Health-check both processes**, and print the PM2 log if either does not
   answer.

Migrate → build → restart, in that order, because the running code must never
be newer than the schema underneath it.

---

## 4. Check the live site

```bash
curl -sS -o /dev/null -w '%{http_code}\n' https://gurukulam.club/login
```

Then in a browser, signed in — the four things this release actually changed:

- **`/batches/<id>` → Upload sessions.** Paste two rows, press **Check the
  file**, read the plan, commit. Then paste *the same rows again*: every line
  must come back "Already there", and the batch's session count must not move.
  That is the whole guarantee — an upload adds and never replaces.
- **A delivered session** cannot be deleted, and still takes a recording.
- **Fee Ledger → a student → Receipt TXN-…** opens the receipt on its own page.
  Check the issuer block reads correctly (§2) and that **Print** produces a
  clean page.
- **A reversed payment's receipt** is stamped REVERSED and names the entry that
  reversed it.

---

## 5. If you must do it by hand

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

## 6. Rolling back

The build is what serves traffic, so rolling back is a checkout and a rebuild:

```bash
cd /var/www/html/gurukulam/gurukulam-claude/Gurukulam-2026-Sep
git reset --hard <last-good-sha>
npm ci && npm run build
sudo pm2 restart gurukulam-api gurukulam-web --update-env
```

**Do not roll the database back to match** unless you have to. Every migration
in this release is additive — a new nullable column, a new index — so the
previous build runs correctly against the newer schema. Restoring the dump from
step 1 throws away every payment, session and student recorded since it was
taken, which is almost always worse than the bug you are backing out.

---

## 7. The grep that never matched — READ THIS BEFORE THE NEXT DEPLOY

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
they are not. Section 1 is the duplicate-session query that has to come back
empty before the unique index can apply.

Order: diagnose (§0) → clear duplicates (§1) → baseline → then make the
workflow migrate.

## 8. The other thing that was silently wrong

**The build died on file permissions.** `prisma generate` writes into
`node_modules/.prisma/client`, and something in that tree was owned by another
user — one `sudo npm install` is enough to do it. The build failed `EACCES`, the
run stopped after the checkout, and the box was left with new source and an old
build. The current workflow chowns the project directory to `ubuntu` on every
run, which covers it.

That, and the grep in §7, are why the two deploys on 16 September looked fine
and were not. Neither was visible from the app, which is the point: a deploy
that reports success without running the migration is worse than one that
fails, because nobody goes looking.
