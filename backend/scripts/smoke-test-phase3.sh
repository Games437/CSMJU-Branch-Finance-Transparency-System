#!/usr/bin/env bash
# Phase 3 smoke test — run after `npm run start:dev` is up and
# `npm run db:seed` has been run (needs s1/t2/bh1 users + Year 2 to exist).
#
# Usage: bash scripts/smoke-test-phase3.sh
#
# Requires `jq` and `curl`. On Windows Git Bash, both are usually already
# available; if `jq` is missing, install it via `winget install jqlang.jq`
# or download the binary and put it on PATH.
set -euo pipefail

BASE="http://localhost:3000/api/v1"
PASS=0
FAIL=0

check() {
  local label="$1" expected="$2" actual="$3"
  if [ "$expected" = "$actual" ]; then
    echo "✅ PASS: $label (got $actual)"
    PASS=$((PASS + 1))
  else
    echo "❌ FAIL: $label (expected $expected, got $actual)"
    FAIL=$((FAIL + 1))
  fi
}

echo "== Setup: fetch Year 2 id =="
YEAR2_ID=$(curl -s -H "x-external-user-id: s1" "$BASE/year-accounts" | jq -r '.[] | select(.yearLevel==2) | .id')
echo "Year 2 id: $YEAR2_ID"
if [ -z "$YEAR2_ID" ] || [ "$YEAR2_ID" = "null" ]; then
  echo "Could not find Year 2 — did you run 'npm run db:seed'?"
  exit 1
fi

echo ""
echo "== Test 1: Treasurer (t2) creates an expense in their own year — expect 201 =="
# Using a HTTPSTATUS: marker + grep/sed instead of `head -n -1` (a GNU
# coreutils flag that isn't guaranteed present on every Git Bash setup) —
# more portable across environments.
CREATE_RAW=$(curl -s -w "HTTPSTATUS:%{http_code}" -X POST "$BASE/expenses" \
  -H "x-external-user-id: t2" -H "Content-Type: application/json" \
  -d "{\"yearAccountId\":\"$YEAR2_ID\",\"amount\":500,\"transactionDate\":\"2026-09-01\",\"description\":\"Test expense\",\"category\":\"SUPPLIES\"}")
CREATE_STATUS=$(echo "$CREATE_RAW" | grep -o 'HTTPSTATUS:[0-9]*' | cut -d: -f2)
CREATE_BODY=$(echo "$CREATE_RAW" | sed 's/HTTPSTATUS\:[0-9]*$//')
TXN_ID=$(echo "$CREATE_BODY" | jq -r '.id')
check "create expense succeeds" "201" "$CREATE_STATUS"
echo "  transactionId: $TXN_ID"

echo ""
echo "== Test 1b: pendingExpenseTotal reflects the still-PENDING expense (RESOLVED Section 31 #4, Option A: display-only) =="
PENDING_TOTAL=$(curl -s -H "x-external-user-id: bh1" "$BASE/year-accounts/$YEAR2_ID/summary" | jq -r '.pendingExpenseTotal')
check "pendingExpenseTotal includes the new 500 expense" "500" "$PENDING_TOTAL"

echo ""
echo "== Test 2: same treasurer tries a fake/other year id — expect 403 =="
OTHER_STATUS=$(curl -s -o /dev/null -w "%{http_code}" -X POST "$BASE/expenses" \
  -H "x-external-user-id: t2" -H "Content-Type: application/json" \
  -d "{\"yearAccountId\":\"00000000-0000-0000-0000-000000000000\",\"amount\":500,\"transactionDate\":\"2026-09-01\",\"description\":\"Should fail\",\"category\":\"SUPPLIES\"}")
check "IDOR attempt blocked" "403" "$OTHER_STATUS"

echo ""
echo "== Test 3: Branch Head tries to approve with NO evidence yet — expect 409 =="
APPROVE_NO_EVIDENCE_STATUS=$(curl -s -o /dev/null -w "%{http_code}" -X POST \
  -H "x-external-user-id: bh1" "$BASE/transactions/$TXN_ID/approve")
check "approve blocked without evidence" "409" "$APPROVE_NO_EVIDENCE_STATUS"

echo ""
echo "== Test 4: upload evidence (a minimal generated PNG) =="
# Windows Git Bash note: curl.exe (Windows-native, not the MSYS one) does
# NOT understand MSYS-internal paths like /tmp/... inside a -F value —
# it needs a path Windows itself can resolve. Using a relative path in
# the current working directory (a real Windows-visible folder) instead
# of $(mktemp) fixes "curl: (26) Failed to open/read local data from
# file/application" on Windows. This was found via manual testing, not
# assumed — see conversation history for the exact repro.
TMP_PNG="./smoketest_evidence.png"
# 1x1 transparent PNG, base64-decoded — avoids needing a real file on disk.
echo "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=" | base64 -d > "$TMP_PNG"
UPLOAD_RAW=$(curl -s -w "HTTPSTATUS:%{http_code}" -X POST "$BASE/expenses/$TXN_ID/evidence" \
  -H "x-external-user-id: t2" -F "file=@$TMP_PNG;type=image/png")
UPLOAD_STATUS=$(echo "$UPLOAD_RAW" | grep -o 'HTTPSTATUS:[0-9]*' | cut -d: -f2)
UPLOAD_BODY=$(echo "$UPLOAD_RAW" | sed 's/HTTPSTATUS\:[0-9]*$//')
EVIDENCE_ID=$(echo "$UPLOAD_BODY" | jq -r '.id')
check "evidence upload succeeds" "201" "$UPLOAD_STATUS"
echo "  evidenceId: $EVIDENCE_ID"

echo ""
echo "== Test 5: approve now succeeds — expect 201 =="
APPROVE_STATUS=$(curl -s -o /dev/null -w "%{http_code}" -X POST \
  -H "x-external-user-id: bh1" "$BASE/transactions/$TXN_ID/approve")
check "approve succeeds with evidence" "201" "$APPROVE_STATUS"

echo ""
echo "== Test 6: Student can read the transaction but externalReference is masked =="
STUDENT_EXT_REF=$(curl -s -H "x-external-user-id: s1" "$BASE/transactions/$TXN_ID" | jq -r '.externalReference')
check "externalReference masked for student" "null" "$STUDENT_EXT_REF"

echo ""
echo "== Test 7: Student CAN download evidence (RESOLVED Section 31 #12: full transparency) — expect 200 =="
STUDENT_DOWNLOAD_STATUS=$(curl -s -o /dev/null -w "%{http_code}" \
  -H "x-external-user-id: s1" "$BASE/evidence/$EVIDENCE_ID")
check "student can download evidence" "200" "$STUDENT_DOWNLOAD_STATUS"

echo ""
echo "== Test 8: Branch Head CAN download evidence — expect 200 =="
BH_DOWNLOAD_STATUS=$(curl -s -o /dev/null -w "%{http_code}" \
  -H "x-external-user-id: bh1" "$BASE/evidence/$EVIDENCE_ID")
check "branch head can download evidence" "200" "$BH_DOWNLOAD_STATUS"

echo ""
echo "== Test 9: self-approval is blocked (Branch Head creates + tries to approve own expense) =="
SELF_CREATE=$(curl -s -X POST "$BASE/expenses" \
  -H "x-external-user-id: bh1" -H "Content-Type: application/json" \
  -d "{\"yearAccountId\":\"$YEAR2_ID\",\"amount\":100,\"transactionDate\":\"2026-09-01\",\"description\":\"Self-approval test\"}")
SELF_TXN_ID=$(echo "$SELF_CREATE" | jq -r '.id')
curl -s -X POST "$BASE/expenses/$SELF_TXN_ID/evidence" \
  -H "x-external-user-id: bh1" -F "file=@$TMP_PNG;type=image/png" > /dev/null
SELF_APPROVE_STATUS=$(curl -s -o /dev/null -w "%{http_code}" -X POST \
  -H "x-external-user-id: bh1" "$BASE/transactions/$SELF_TXN_ID/approve")
check "self-approval blocked" "403" "$SELF_APPROVE_STATUS"

echo ""
echo "== Test 10: reject without a reason — expect 400 =="
REJECT_NO_REASON_STATUS=$(curl -s -o /dev/null -w "%{http_code}" -X POST \
  -H "x-external-user-id: bh1" -H "Content-Type: application/json" \
  -d '{}' "$BASE/transactions/$SELF_TXN_ID/reject")
check "reject without reason blocked" "400" "$REJECT_NO_REASON_STATUS"

echo ""
echo "== Test 11: void without a reason — expect 400 =="
VOID_NO_REASON_STATUS=$(curl -s -o /dev/null -w "%{http_code}" -X POST \
  -H "x-external-user-id: bh1" -H "Content-Type: application/json" \
  -d '{}' "$BASE/transactions/$TXN_ID/void")
check "void without reason blocked" "400" "$VOID_NO_REASON_STATUS"

echo ""
echo "== Test 12: balance reflects the approved expense =="
BALANCE=$(curl -s -H "x-external-user-id: bh1" "$BASE/year-accounts/$YEAR2_ID/summary" | jq -r '.balance')
echo "  Year 2 balance is now: $BALANCE"

rm -f "$TMP_PNG"

# ----------------------------------------------------------------------
# Phase 3.5 additions: confirm-income and advance-academic-year.
#
# There is no public API to CREATE a NEEDS_REVIEW income row yet (that
# only happens via the bank-import integration pipeline, which isn't
# built — see Section 35). To test confirm-income at all, this script
# inserts one directly via `docker exec ... psql` against the same
# Postgres container `npm run db:up` starts, rather than skipping the
# test or requiring a local psql client the user may not have.
# ----------------------------------------------------------------------

echo ""
echo "== Test 13: confirm-income moves a NEEDS_REVIEW income to APPROVED =="
INCOME_TXN_ID=$(docker exec -i bfts_postgres_dev psql -q -t -A -U bfts -d bfts_dev -c "
INSERT INTO transactions (year_account_id, type, amount, transaction_date, description, source_type, created_by, status)
SELECT '$YEAR2_ID', 'INCOME', 750, '2026-09-01', 'Smoke test income', 'BANK_IMPORT',
  (SELECT id FROM users WHERE external_user_id='t2'), 'NEEDS_REVIEW'
RETURNING id;
" | head -n1 | tr -d '[:space:]')
echo "  incomeTransactionId: $INCOME_TXN_ID"

CONFIRM_STATUS=$(curl -s -o /dev/null -w "%{http_code}" -X POST \
  -H "x-external-user-id: bh1" "$BASE/transactions/$INCOME_TXN_ID/confirm-income")
check "confirm-income succeeds" "201" "$CONFIRM_STATUS"

INCOME_STATUS_AFTER=$(curl -s -H "x-external-user-id: bh1" "$BASE/transactions/$INCOME_TXN_ID" | jq -r '.status')
check "income status is now APPROVED" "APPROVED" "$INCOME_STATUS_AFTER"

echo ""
echo "== Test 14: confirm-income rejects being called on an EXPENSE — expect 409 =="
WRONG_TYPE_STATUS=$(curl -s -o /dev/null -w "%{http_code}" -X POST \
  -H "x-external-user-id: bh1" "$BASE/transactions/$TXN_ID/confirm-income")
check "confirm-income rejects non-income transaction" "409" "$WRONG_TYPE_STATUS"

# ----------------------------------------------------------------------
# advance-academic-year is placed LAST deliberately: it mutates every
# active cohort's yearLevel branch-wide, so nothing after this point in
# the script should assume $YEAR2_ID is still "year_level == 2".
# ----------------------------------------------------------------------

echo ""
echo "== Test 15: advance-academic-year promotes the cohort and creates a new Year 1 =="
ADVANCE_RAW=$(curl -s -w "HTTPSTATUS:%{http_code}" -X POST "$BASE/year-accounts/advance-academic-year" \
  -H "x-external-user-id: bh1" -H "Content-Type: application/json" \
  -d '{"newAcademicYear":"2569"}')
ADVANCE_STATUS=$(echo "$ADVANCE_RAW" | grep -o 'HTTPSTATUS:[0-9]*' | cut -d: -f2)
ADVANCE_BODY=$(echo "$ADVANCE_RAW" | sed 's/HTTPSTATUS\:[0-9]*$//')
check "advance-academic-year succeeds" "201" "$ADVANCE_STATUS"
echo "  response: $ADVANCE_BODY"

PROMOTED_COUNT=$(echo "$ADVANCE_BODY" | jq -r '.promotedCount')
check "exactly 1 cohort promoted (only Year 2 existed, nothing was at Year 4 to graduate)" "1" "$PROMOTED_COUNT"

echo ""
echo "== Test 16: the promoted cohort now shows yearLevel 3 (same id) =="
NEW_LEVEL=$(curl -s -H "x-external-user-id: s1" "$BASE/year-accounts" | jq -r --arg id "$YEAR2_ID" '.[] | select(.id==$id) | .yearLevel')
check "cohort promoted from 2 to 3" "3" "$NEW_LEVEL"

echo ""
echo "== Test 17: re-running advance-academic-year for the same year is rejected — expect 409 =="
REPEAT_STATUS=$(curl -s -o /dev/null -w "%{http_code}" -X POST "$BASE/year-accounts/advance-academic-year" \
  -H "x-external-user-id: bh1" -H "Content-Type: application/json" \
  -d '{"newAcademicYear":"2569"}')
check "duplicate advance-academic-year rejected (idempotency)" "409" "$REPEAT_STATUS"

echo ""
echo "== Test 18: Student cannot call advance-academic-year — expect 403 =="
STUDENT_ADVANCE_STATUS=$(curl -s -o /dev/null -w "%{http_code}" -X POST "$BASE/year-accounts/advance-academic-year" \
  -H "x-external-user-id: s1" -H "Content-Type: application/json" \
  -d '{"newAcademicYear":"2570"}')
check "student blocked from advance-academic-year" "403" "$STUDENT_ADVANCE_STATUS"

echo ""
echo "================================"
echo "Results: $PASS passed, $FAIL failed"
echo "================================"
[ "$FAIL" -eq 0 ]
