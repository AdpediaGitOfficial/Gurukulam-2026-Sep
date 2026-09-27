-- Why a college portal account's access was withdrawn.
--
-- Hand-written, not diffed. `prisma migrate dev` also proposes DROP DEFAULT on
-- college_contracts.computed_total_minor (a GENERATED column Prisma cannot
-- model) and on two other columns the constraints migration set up in raw SQL.
-- Applying those would drop the generated expression. See ADR 0003.
ALTER TABLE "college_users" ADD COLUMN "revoke_reason" VARCHAR(500);
