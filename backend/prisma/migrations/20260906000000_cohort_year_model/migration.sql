-- CSMJU-BFTS: cohort-based year model (Section 31 items #1, #15, #16)
--
-- Confirmed by CSMJU: "Year 2" is not a fixed slot — it's a fixed cohort
-- that advances through year levels together (same treasurer, same
-- account, same balance) until graduation. This migration:
--   1. Renames year_accounts.academic_year_label -> entry_academic_year_label
--      (it's the year the cohort ENTERED as Year 1, fixed forever — the
--      old name read as "current year", which was misleading once
--      yearLevel became mutable).
--   2. Replaces the GLOBAL unique constraint on year_level with a PARTIAL
--      unique index that only applies to active cohorts — multiple
--      graduated (active=false) cohorts can have held the same
--      year_level historically, which is expected under this model.
--   3. Adds year_level_periods: one row per cohort per academic year,
--      recording which level it held and its closing balance when that
--      period ended. Without this, promoting year_level in place would
--      silently destroy the history Section 31 #16 asked for.
--
-- This is a NEW migration rather than an edit to 20260901000000_init
-- because that migration has already been applied in local/dev
-- environments — editing an applied migration file is not safe practice
-- (see README's migrate dev/deploy notes from Phase 1).

ALTER TABLE "year_accounts" RENAME COLUMN "academic_year_label" TO "entry_academic_year_label";

DROP INDEX "year_accounts_year_level_key";

CREATE UNIQUE INDEX "year_accounts_active_year_level_key"
  ON "year_accounts" ("year_level")
  WHERE "active" = true;

CREATE TABLE "year_level_periods" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "year_account_id" UUID NOT NULL,
    "academic_year" TEXT NOT NULL,
    "year_level" INTEGER NOT NULL,
    "started_at" TIMESTAMPTZ NOT NULL DEFAULT now(),
    "ended_at" TIMESTAMPTZ,
    "closing_balance" DECIMAL(14,2),
    CONSTRAINT "year_level_periods_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "year_level_periods_year_account_id_fkey" FOREIGN KEY ("year_account_id") REFERENCES "year_accounts"("id")
);
CREATE UNIQUE INDEX "year_level_periods_year_account_id_academic_year_key"
  ON "year_level_periods" ("year_account_id", "academic_year");
CREATE INDEX "year_level_periods_year_account_id_ended_at_idx"
  ON "year_level_periods" ("year_account_id", "ended_at");

-- Backfill: every currently-active cohort needs a "current period" row
-- (ended_at IS NULL) so the invariant "every active cohort has exactly
-- one open period" holds immediately after this migration, not just for
-- cohorts created after it.
INSERT INTO "year_level_periods" ("year_account_id", "academic_year", "year_level", "started_at")
SELECT "id", COALESCE("entry_academic_year_label", 'unknown'), "year_level", "created_at"
FROM "year_accounts"
WHERE "active" = true;
