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
echo "== Test 7: Student CANNOT download evidence — expect 403 =="
STUDENT_DOWNLOAD_STATUS=$(curl -s -o /dev/null -w "%{http_code}" \
  -H "x-external-user-id: s1" "$BASE/evidence/$EVIDENCE_ID")
check "student blocked from evidence download" "403" "$STUDENT_DOWNLOAD_STATUS"

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

echo ""
echo "================================"
echo "Results: $PASS passed, $FAIL failed"
echo "================================"
[ "$FAIL" -eq 0 ]
