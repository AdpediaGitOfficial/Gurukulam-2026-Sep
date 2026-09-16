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

## 7. Two things that were silently wrong, and are now fixed

Worth knowing, because they explain why earlier deploys looked fine and were
not.

**Migrations never ran.** The workflow decided whether to migrate by grepping
`prisma migrate status` for `Following migration(s) have not yet been applied`.
Prisma 6 prints `Following migrations have not yet been applied` — no `(s)`. The
test never matched, so the script printed "No pending migrations" and skipped
`migrate deploy` every single time. It now runs `migrate deploy`
unconditionally, which is idempotent and cannot be fooled by a wording change.

**The build died on file permissions.** `prisma generate` writes into
`node_modules/.prisma/client`, and something in that tree was owned by another
user — one `sudo npm install` is enough to do it. The build failed `EACCES`, the
run stopped after the checkout, and the box was left with new source and an old
build. The workflow now takes ownership of the project directory on every run.

Both of these failed the two deploys on 16 September. Neither was visible from
the app, which is the point: a deploy that reports success without running the
migration is worse than one that fails.
