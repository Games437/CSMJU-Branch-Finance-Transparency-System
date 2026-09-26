-- Adds CANCELLED to TransactionStatus: lets the creator of a still-PENDING
-- expense withdraw it before Branch Head review (previously impossible —
-- only Branch Head could act on a transaction's status, via
-- approve/reject/void). Per 01_BUSINESS_RULES_SPECIFICATION.md Section 11
-- ("do not hard-delete financial transactions — use a void/cancel workflow
-- with a reason instead"), this is a new terminal status reached only from
-- PENDING, never a row deletion. See transactions.service.ts#cancelExpense.
ALTER TYPE "TransactionStatus" ADD VALUE 'CANCELLED';
