-- LINE OA quick-entry: attach evidence photos in-chat (confirmed with the
-- user, 2026-09-27). Purely additive: 3 new enum values, no column/table
-- changes. Separate migration file rather than editing the earlier
-- 20260926160000_add_line_oa_quick_entry migration, since that one may
-- already have been applied elsewhere by the time this ships — additive
-- migrations are layered, never rewritten in place, per this project's
-- established practice.

ALTER TYPE "LineMessageStatus" ADD VALUE 'EVIDENCE_ATTACHED';
ALTER TYPE "LineMessageStatus" ADD VALUE 'EVIDENCE_TARGET_NOT_FOUND';
ALTER TYPE "LineMessageStatus" ADD VALUE 'EVIDENCE_DOWNLOAD_FAILED';
