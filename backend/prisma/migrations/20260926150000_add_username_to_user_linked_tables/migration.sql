-- Base standards item #6 (00_STANDARDS_COMPLIANCE.md Section 3 row 6 /
-- 04_ERD_DATABASE_SCHEMA.md Section 2): every table linked to a user gets
-- a denormalized `username` column, ADDITIVE alongside the existing UUID
-- foreign key.
--
-- This is the low-risk path confirmed with the user, not the compliance
-- doc's other, "highest risk" option (drop `users.id`/`display_name`,
-- convert every FK from UUID to a username-only key across the whole
-- schema) — that option is explicitly flagged in the doc itself as an
-- unconfirmed team assumption requiring PL sign-off, and would break
-- every "who did this" display in the current UI (there is no other
-- source for a human-readable name until real SSO/Core integration,
-- base standards item #8, lands). This migration only adds columns; it
-- drops nothing and changes no existing FK.
--
-- Hand-written (not `prisma migrate dev` auto-diff) per this project's
-- established practice: the sandbox's Prisma engine has previously
-- produced unrelated FK drop/recreate + timestamp-precision drift on
-- auto-generated migrations (see migration
-- 20260926140000_add_cancelled_transaction_status). A plain set of
-- ADD COLUMN + backfill + SET NOT NULL statements has no such surface.

ALTER TABLE "user_year_assignments" ADD COLUMN "username" TEXT;
ALTER TABLE "transactions" ADD COLUMN "created_by_username" TEXT;
ALTER TABLE "transactions" ADD COLUMN "approved_by_username" TEXT;
ALTER TABLE "expense_evidence" ADD COLUMN "uploaded_by_username" TEXT;
ALTER TABLE "approval_actions" ADD COLUMN "actor_username" TEXT;
ALTER TABLE "audit_logs" ADD COLUMN "actor_username" TEXT;

-- Backfill every existing row from the UUID FK it already has, so
-- nothing sits NULL merely because it predates this column existing.
-- New rows going forward are populated directly by the service layer
-- from the acting user's externalUserId (see transactions.service.ts,
-- approvals.service.ts, evidence.service.ts, audit.service.ts) — this
-- UPDATE only ever needs to run once, here.
UPDATE "user_year_assignments" AS uya
  SET "username" = u.external_user_id
  FROM "users" AS u
  WHERE uya.user_id = u.id;

UPDATE "transactions" AS t
  SET "created_by_username" = u.external_user_id
  FROM "users" AS u
  WHERE t.created_by = u.id;

UPDATE "transactions" AS t
  SET "approved_by_username" = u.external_user_id
  FROM "users" AS u
  WHERE t.approved_by = u.id;

UPDATE "expense_evidence" AS ee
  SET "uploaded_by_username" = u.external_user_id
  FROM "users" AS u
  WHERE ee.uploaded_by = u.id;

UPDATE "approval_actions" AS aa
  SET "actor_username" = u.external_user_id
  FROM "users" AS u
  WHERE aa.actor_id = u.id;

UPDATE "audit_logs" AS al
  SET "actor_username" = u.external_user_id
  FROM "users" AS u
  WHERE al.actor_id = u.id;

-- NOT NULL only where the FK it shadows is itself required. Left
-- nullable where the FK is nullable too (approved_by_username,
-- audit_logs.actor_username), so a NULL FK never forces an impossible
-- backfill.
ALTER TABLE "user_year_assignments" ALTER COLUMN "username" SET NOT NULL;
ALTER TABLE "transactions" ALTER COLUMN "created_by_username" SET NOT NULL;
ALTER TABLE "expense_evidence" ALTER COLUMN "uploaded_by_username" SET NOT NULL;
ALTER TABLE "approval_actions" ALTER COLUMN "actor_username" SET NOT NULL;
