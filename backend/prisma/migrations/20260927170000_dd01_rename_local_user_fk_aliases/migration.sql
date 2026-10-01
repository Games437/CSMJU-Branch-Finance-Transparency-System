-- DD-01 (csmju2030-standards/docs/data-dictionary.md §9.2): userId/user_id
-- is reserved exclusively for the Core Hub `sub` claim (-> core_user_id /
-- coreUserId elsewhere in this codebase). The three columns below are
-- local foreign keys into this table's own `users` row, not the Core Hub
-- identity, so they must not use the reserved alias.
--
-- Hand-authored per data-dictionary.md §9.3: `prisma migrate dev` would
-- default to DROP COLUMN + ADD COLUMN for a field rename, which loses
-- existing data. This uses ALTER TABLE ... RENAME COLUMN instead, and
-- also renames the associated FK/unique constraints so their names stay
-- in sync with Prisma's default naming convention for the new column
-- names (verified afterwards with `prisma migrate diff --exit-code`).

-- user_year_assignments.user_id -> assignee_id
ALTER TABLE "user_year_assignments" RENAME COLUMN "user_id" TO "assignee_id";
ALTER TABLE "user_year_assignments" RENAME CONSTRAINT "user_year_assignments_user_id_fkey" TO "user_year_assignments_assignee_id_fkey";

-- line_account_links.user_id -> owner_id
ALTER TABLE "line_account_links" RENAME COLUMN "user_id" TO "owner_id";
ALTER TABLE "line_account_links" RENAME CONSTRAINT "line_account_links_user_id_fkey" TO "line_account_links_owner_id_fkey";
ALTER TABLE "line_account_links" RENAME CONSTRAINT "line_account_links_user_id_key" TO "line_account_links_owner_id_key";

-- line_link_codes.user_id -> owner_id
ALTER TABLE "line_link_codes" RENAME COLUMN "user_id" TO "owner_id";
ALTER TABLE "line_link_codes" RENAME CONSTRAINT "line_link_codes_user_id_fkey" TO "line_link_codes_owner_id_fkey";
