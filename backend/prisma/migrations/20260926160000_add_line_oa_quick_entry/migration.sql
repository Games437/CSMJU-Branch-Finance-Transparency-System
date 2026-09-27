-- LINE OA quick-entry feature (confirmed with the user, 2026-09-26).
-- Hand-written per this project's established practice of not trusting
-- `prisma migrate dev`'s auto-diff. Purely additive: no existing column,
-- table, or enum value is touched or dropped.

-- 1) New TransactionSourceType value.
-- Safe to run inside a transaction on Postgres 16 (this project's DB
-- version) as long as the new value isn't referenced by any DML in the
-- SAME transaction/migration file, which it isn't here.
ALTER TYPE "TransactionSourceType" ADD VALUE 'LINE_REPORT';

-- 2) New enum for LineMessageEvent.status
CREATE TYPE "LineMessageStatus" AS ENUM (
  'RECEIVED',
  'LINK_CODE_CONSUMED',
  'LINK_CODE_INVALID',
  'UNLINKED_SENDER',
  'NOT_TREASURER',
  'NO_ACTIVE_YEAR',
  'PARSE_FAILED',
  'CREATED'
);

-- 3) line_account_links: one LINE account <-> one CSMJU-BFTS user.
CREATE TABLE "line_account_links" (
  "id"         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  "line_user_id" TEXT NOT NULL,
  "user_id"    UUID NOT NULL,
  "username"   TEXT NOT NULL,
  "linked_at"  TIMESTAMP(3) NOT NULL DEFAULT now(),
  CONSTRAINT "line_account_links_line_user_id_key" UNIQUE ("line_user_id"),
  CONSTRAINT "line_account_links_user_id_key" UNIQUE ("user_id"),
  CONSTRAINT "line_account_links_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id")
);

-- 4) line_link_codes: short-lived, single-use linking codes.
CREATE TABLE "line_link_codes" (
  "id"         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  "code"       TEXT NOT NULL,
  "user_id"    UUID NOT NULL,
  "username"   TEXT NOT NULL,
  "expires_at" TIMESTAMP(3) NOT NULL,
  "used_at"    TIMESTAMP(3),
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT now(),
  CONSTRAINT "line_link_codes_code_key" UNIQUE ("code"),
  CONSTRAINT "line_link_codes_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id")
);

-- 5) line_message_events: audit/debug trail of every inbound LINE message.
CREATE TABLE "line_message_events" (
  "id"              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  "line_user_id"    TEXT NOT NULL,
  "username"        TEXT,
  "raw_text"        TEXT NOT NULL,
  "parsed_category" TEXT,
  "parsed_amount"   DECIMAL(14, 2),
  "parsed_type"     "TransactionType",
  "status"          "LineMessageStatus" NOT NULL DEFAULT 'RECEIVED',
  "error_reason"    TEXT,
  "transaction_id"  UUID,
  "received_at"     TIMESTAMP(3) NOT NULL DEFAULT now(),
  CONSTRAINT "line_message_events_transaction_id_fkey" FOREIGN KEY ("transaction_id") REFERENCES "transactions"("id")
);

CREATE INDEX "line_message_events_line_user_id_received_at_idx"
  ON "line_message_events" ("line_user_id", "received_at");
