#!/usr/bin/env bash
set -uo pipefail
BASE="http://localhost:3000/api/v1"
SECRET="test-channel-secret-for-local-verification"
PASS=0
FAIL=0

check() {
  local label="$1" expected="$2" actual="$3"
  if [ "$expected" = "$actual" ]; then
    echo "✅ PASS: $label (got $actual)"
    PASS=$((PASS+1))
  else
    echo "❌ FAIL: $label (expected $expected, got $actual)"
    FAIL=$((FAIL+1))
  fi
}

sign_and_post() {
  # $1 = raw JSON body (must match exactly what curl sends)
  local body="$1"
  local sig
  sig=$(printf '%s' "$body" | openssl dgst -sha256 -hmac "$SECRET" -binary | base64)
  curl -s -o /tmp/line_resp.json -w "%{http_code}" \
    -H "Content-Type: application/json" \
    -H "x-line-signature: $sig" \
    -X POST "$BASE/line/webhook" \
    --data-binary "$body"
}

line_event_body() {
  # $1 = lineUserId, $2 = text, $3 = replyToken
  cat <<EOF
{"destination":"xxx","events":[{"type":"message","replyToken":"$3","source":{"type":"user","userId":"$1"},"message":{"id":"m1","type":"text","text":"$2"},"timestamp":1727330000000}]}
EOF
}

line_image_event_body() {
  # $1 = lineUserId, $2 = messageId, $3 = replyToken
  cat <<EOF
{"destination":"xxx","events":[{"type":"message","replyToken":"$3","source":{"type":"user","userId":"$1"},"message":{"id":"$2","type":"image"},"timestamp":1727330000000}]}
EOF
}

line_file_event_body() {
  # $1 = lineUserId, $2 = messageId, $3 = replyToken, $4 = fileName
  cat <<EOF
{"destination":"xxx","events":[{"type":"message","replyToken":"$3","source":{"type":"user","userId":"$1"},"message":{"id":"$2","type":"file","fileName":"$4","fileSize":102400},"timestamp":1727330000000}]}
EOF
}

echo "== Test A: generate link code as t2 (TREASURER) =="
CODE_RESP=$(curl -s -H "x-external-user-id: t2" -X POST "$BASE/line/link-codes")
echo "$CODE_RESP" | jq .
CODE=$(echo "$CODE_RESP" | jq -r '.data.code')
check "link code generated (8 chars)" "8" "${#CODE}"

echo ""
echo "== Test A2: link-status before linking shows linked=false =="
STATUS_BEFORE=$(curl -s -H "x-external-user-id: t2" "$BASE/line/link-status" | jq -r '.data.linked')
check "not linked yet" "false" "$STATUS_BEFORE"

echo ""
echo "== Test B: invalid webhook signature is rejected (401) =="
BAD_SIG_STATUS=$(curl -s -o /dev/null -w "%{http_code}" \
  -H "Content-Type: application/json" -H "x-line-signature: bogus==" \
  -X POST "$BASE/line/webhook" --data-binary '{"destination":"x","events":[]}')
check "bad signature rejected" "401" "$BAD_SIG_STATUS"

echo ""
echo "== Test C: send 'ผูกบัญชี <code>' from a fresh LINE user id =="
LINE_UID="Ufake0000000000000000000000001"
BODY=$(line_event_body "$LINE_UID" "ผูกบัญชี $CODE" "reply-token-1")
STATUS=$(sign_and_post "$BODY")
check "link command webhook accepted" "200" "$STATUS"

sleep 0.3
LINK_EVENT_STATUS=$(psql "postgresql://bfts:bfts_dev_password@localhost:5432/bfts_dev" -t -A -c \
  "SELECT status FROM line_message_events WHERE line_user_id='$LINE_UID' ORDER BY received_at DESC LIMIT 1;")
check "message event recorded as LINK_CODE_CONSUMED" "LINK_CODE_CONSUMED" "$LINK_EVENT_STATUS"

LINKED_USERNAME=$(psql "postgresql://bfts:bfts_dev_password@localhost:5432/bfts_dev" -t -A -c \
  "SELECT username FROM line_account_links WHERE line_user_id='$LINE_UID';")
check "LineAccountLink resolves to t2" "t2" "$LINKED_USERNAME"

echo ""
echo "== Test A3: link-status after linking shows linked=true =="
STATUS_AFTER=$(curl -s -H "x-external-user-id: t2" "$BASE/line/link-status" | jq -r '.data.linked')
check "now linked" "true" "$STATUS_AFTER"

echo ""
echo "== Test D: re-sending the same code again should be rejected (single-use) =="
BODY2=$(line_event_body "$LINE_UID" "ผูกบัญชี $CODE" "reply-token-2")
sign_and_post "$BODY2" > /dev/null
sleep 0.3
REUSE_STATUS=$(psql "postgresql://bfts:bfts_dev_password@localhost:5432/bfts_dev" -t -A -c \
  "SELECT status FROM line_message_events WHERE line_user_id='$LINE_UID' ORDER BY received_at DESC LIMIT 1;")
check "reused code rejected (LINK_CODE_INVALID)" "LINK_CODE_INVALID" "$REUSE_STATUS"

echo ""
echo "== Test E: income quick-entry — 'เก็บเงินห้องได้ 10000 บาท' =="
BODY3=$(line_event_body "$LINE_UID" "เก็บเงินห้องได้ 10000 บาท" "reply-token-3")
sign_and_post "$BODY3" > /dev/null
sleep 0.3
ROW=$(psql "postgresql://bfts:bfts_dev_password@localhost:5432/bfts_dev" -t -A -F'|' -c \
  "SELECT t.type, t.status, t.amount, t.category, t.description, t.source_type, t.created_by_username FROM transactions t
   JOIN line_message_events e ON e.transaction_id = t.id
   WHERE e.line_user_id='$LINE_UID' AND e.parsed_category IS NOT NULL ORDER BY t.created_at DESC LIMIT 1;")
echo "  row: $ROW"
IFS='|' read -r TTYPE TSTATUS TAMOUNT TCATEGORY TDESC TSRC TCREATOR <<< "$ROW"
check "type is INCOME" "INCOME" "$TTYPE"
check "status is NEEDS_REVIEW" "NEEDS_REVIEW" "$TSTATUS"
check "amount is 10000.00" "10000.00" "$TAMOUNT"
check "category parsed as เก็บเงินห้อง" "เก็บเงินห้อง" "$TCATEGORY"
check "description mirrors category" "เก็บเงินห้อง" "$TDESC"
check "sourceType is LINE_REPORT" "LINE_REPORT" "$TSRC"
check "createdByUsername is t2" "t2" "$TCREATOR"

echo ""
echo "== Test F: expense quick-entry — 'จ่ายค่าอาหารกลางวัน 250 บาท' =="
BODY4=$(line_event_body "$LINE_UID" "จ่ายค่าอาหารกลางวัน 250 บาท" "reply-token-4")
sign_and_post "$BODY4" > /dev/null
sleep 0.3
ROW2=$(psql "postgresql://bfts:bfts_dev_password@localhost:5432/bfts_dev" -t -A -F'|' -c \
  "SELECT type, status, amount FROM transactions WHERE created_by_username='t2' AND source_type='LINE_REPORT' AND type='EXPENSE' ORDER BY created_at DESC LIMIT 1;")
IFS='|' read -r ETYPE ESTATUS EAMOUNT <<< "$ROW2"
check "expense type is EXPENSE" "EXPENSE" "$ETYPE"
check "expense status is PENDING (never NEEDS_REVIEW)" "PENDING" "$ESTATUS"
check "expense amount is 250.00" "250.00" "$EAMOUNT"

echo ""
echo "== Test G: unparsable message (no number) is NOT turned into a transaction =="
TXN_COUNT_BEFORE=$(psql "postgresql://bfts:bfts_dev_password@localhost:5432/bfts_dev" -t -A -c \
  "SELECT count(*) FROM transactions WHERE created_by_username='t2' AND source_type='LINE_REPORT';")
BODY5=$(line_event_body "$LINE_UID" "สวัสดีครับวันนี้อากาศดี" "reply-token-5")
sign_and_post "$BODY5" > /dev/null
sleep 0.3
TXN_COUNT_AFTER=$(psql "postgresql://bfts:bfts_dev_password@localhost:5432/bfts_dev" -t -A -c \
  "SELECT count(*) FROM transactions WHERE created_by_username='t2' AND source_type='LINE_REPORT';")
check "no new transaction created" "$TXN_COUNT_BEFORE" "$TXN_COUNT_AFTER"
PARSE_FAIL_STATUS=$(psql "postgresql://bfts:bfts_dev_password@localhost:5432/bfts_dev" -t -A -c \
  "SELECT status FROM line_message_events WHERE line_user_id='$LINE_UID' ORDER BY received_at DESC LIMIT 1;")
check "recorded as PARSE_FAILED" "PARSE_FAILED" "$PARSE_FAIL_STATUS"

echo ""
echo "== Test H: message from an UNLINKED LINE user id =="
BODY6=$(line_event_body "Uunknown000000000000000000000" "เก็บเงินอะไรสักอย่าง 999 บาท" "reply-token-6")
sign_and_post "$BODY6" > /dev/null
sleep 0.3
UNLINKED_STATUS=$(psql "postgresql://bfts:bfts_dev_password@localhost:5432/bfts_dev" -t -A -c \
  "SELECT status FROM line_message_events WHERE line_user_id='Uunknown000000000000000000000' ORDER BY received_at DESC LIMIT 1;")
check "recorded as UNLINKED_SENDER" "UNLINKED_SENDER" "$UNLINKED_STATUS"

echo ""
echo "== Test J: photo sent right after the expense (Test F) binds to that transaction =="
EXPENSE_TXN_ID=$(psql "postgresql://bfts:bfts_dev_password@localhost:5432/bfts_dev" -t -A -c \
  "SELECT id FROM transactions WHERE created_by_username='t2' AND source_type='LINE_REPORT' AND type='EXPENSE' ORDER BY created_at DESC LIMIT 1;")
IMG_BODY=$(line_image_event_body "$LINE_UID" "msg-img-1" "reply-token-img-1")
IMG_STATUS=$(sign_and_post "$IMG_BODY")
check "image webhook accepted" "200" "$IMG_STATUS"
sleep 0.3
IMG_ROW=$(psql "postgresql://bfts:bfts_dev_password@localhost:5432/bfts_dev" -t -A -F'|' -c \
  "SELECT status, transaction_id, error_reason FROM line_message_events WHERE line_user_id='$LINE_UID' ORDER BY received_at DESC LIMIT 1;")
IFS='|' read -r IMG_EVT_STATUS IMG_EVT_TXN IMG_EVT_REASON <<< "$IMG_ROW"
check "bound to the right transaction (Test F's expense)" "$EXPENSE_TXN_ID" "$IMG_EVT_TXN"
# No LINE_CHANNEL_ACCESS_TOKEN is configured in this sandbox, so the
# download step itself is expected to fail gracefully — this still
# proves the binding query found the correct target transaction before
# ever attempting the download.
check "download fails gracefully (no access token configured here)" "EVIDENCE_DOWNLOAD_FAILED" "$IMG_EVT_STATUS"
check "error reason is content_download_failed" "content_download_failed" "$IMG_EVT_REASON"

echo ""
echo "== Test K: photo from an unlinked LINE user id is rejected the same way text is =="
IMG_BODY2=$(line_image_event_body "Uunknown000000000000000000000" "msg-img-2" "reply-token-img-2")
sign_and_post "$IMG_BODY2" > /dev/null
sleep 0.3
IMG_UNLINKED_STATUS=$(psql "postgresql://bfts:bfts_dev_password@localhost:5432/bfts_dev" -t -A -c \
  "SELECT status FROM line_message_events WHERE line_user_id='Uunknown000000000000000000000' ORDER BY received_at DESC LIMIT 1;")
check "unlinked sender's photo recorded as UNLINKED_SENDER" "UNLINKED_SENDER" "$IMG_UNLINKED_STATUS"

echo ""
echo "== Test L: a 'file' message (e.g. PDF receipt) binds the same way an image does =="
FILE_BODY=$(line_file_event_body "$LINE_UID" "msg-file-1" "reply-token-file-1" "receipt.pdf")
FILE_STATUS=$(sign_and_post "$FILE_BODY")
check "file webhook accepted" "200" "$FILE_STATUS"
sleep 0.3
FILE_ROW=$(psql "postgresql://bfts:bfts_dev_password@localhost:5432/bfts_dev" -t -A -F'|' -c \
  "SELECT status, transaction_id FROM line_message_events WHERE line_user_id='$LINE_UID' ORDER BY received_at DESC LIMIT 1;")
IFS='|' read -r FILE_EVT_STATUS FILE_EVT_TXN <<< "$FILE_ROW"
check "file also bound to Test F's expense" "$EXPENSE_TXN_ID" "$FILE_EVT_TXN"
# Same reasoning as Test J: no LINE_CHANNEL_ACCESS_TOKEN in this sandbox,
# so the download step fails gracefully — this still proves a "file"
# message reaches the same binding logic an "image" message does, and
# that the type: "file" branch (added for PDF receipts) doesn't crash.
check "file download fails gracefully (no access token configured here)" "EVIDENCE_DOWNLOAD_FAILED" "$FILE_EVT_STATUS"

echo ""
echo "== Test M: a file from an unlinked LINE user id is rejected the same way =="
FILE_BODY2=$(line_file_event_body "Uunknown000000000000000000000" "msg-file-2" "reply-token-file-2" "receipt.pdf")
sign_and_post "$FILE_BODY2" > /dev/null
sleep 0.3
FILE_UNLINKED_STATUS=$(psql "postgresql://bfts:bfts_dev_password@localhost:5432/bfts_dev" -t -A -c \
  "SELECT status FROM line_message_events WHERE line_user_id='Uunknown000000000000000000000' ORDER BY received_at DESC LIMIT 1;")
check "unlinked sender's file recorded as UNLINKED_SENDER" "UNLINKED_SENDER" "$FILE_UNLINKED_STATUS"

echo ""
echo "== Test N: evidence now also binds to an INCOME report (Business Rule 6, amended 2026-09-27 =="
echo "   after a real report showed a photo sent right after an income entry being wrongly rejected) =="
BODY_INCOME2=$(line_event_body "$LINE_UID" "ได้รับเงินบริจาคจากศิษย์เก่า 300 บาท" "reply-token-income2")
sign_and_post "$BODY_INCOME2" > /dev/null
sleep 0.3
INCOME2_TXN_ID=$(psql "postgresql://bfts:bfts_dev_password@localhost:5432/bfts_dev" -t -A -c \
  "SELECT id FROM transactions WHERE created_by_username='t2' AND source_type='LINE_REPORT' AND type='INCOME' ORDER BY created_at DESC LIMIT 1;")
IMG_BODY3=$(line_image_event_body "$LINE_UID" "msg-img-income2" "reply-token-img-income2")
IMG_STATUS3=$(sign_and_post "$IMG_BODY3")
check "photo-after-income webhook accepted" "200" "$IMG_STATUS3"
sleep 0.3
IMG_ROW3=$(psql "postgresql://bfts:bfts_dev_password@localhost:5432/bfts_dev" -t -A -F'|' -c \
  "SELECT status, transaction_id FROM line_message_events WHERE line_user_id='$LINE_UID' ORDER BY received_at DESC LIMIT 1;")
IFS='|' read -r IMG3_STATUS IMG3_TXN <<< "$IMG_ROW3"
check "bound to the new INCOME transaction (NOT rejected for being income)" "$INCOME2_TXN_ID" "$IMG3_TXN"
check "degrades gracefully same as the expense case (no access token here)" "EVIDENCE_DOWNLOAD_FAILED" "$IMG3_STATUS"

echo ""
echo "== Test O: direct web upload proves evidenceService.upload() itself now accepts INCOME =="
echo "   (Test N only proves the LINE pre-check stopped rejecting it early — the LINE download"
echo "   step never actually reaches upload() in this sandbox, no real access token — so this"
echo "   hits the real upload path the way the web UI does, bypassing LINE entirely.)"
UPLOAD_RESP=$(curl -s -H "x-external-user-id: t2" -X POST \
  "$BASE/expenses/$INCOME2_TXN_ID/evidence" \
  -F "file=@/tmp/dummy-evidence.pdf;type=application/pdf")
echo "  upload response: $UPLOAD_RESP"
UPLOAD_OK=$(echo "$UPLOAD_RESP" | jq -r '.success')
check "web upload to an INCOME transaction succeeds (was a 409 before this fix)" "true" "$UPLOAD_OK"

EVIDENCE_LIST=$(curl -s -H "x-external-user-id: t2" "$BASE/expenses/$INCOME2_TXN_ID/evidence")
# Wire format is snake_case (ResponseEnvelopeInterceptor's transform),
# not the camelCase the Prisma/TS layer uses internally.
EVIDENCE_CURRENT=$(echo "$EVIDENCE_LIST" | jq -r '.data[0].is_current')
EVIDENCE_MIME=$(echo "$EVIDENCE_LIST" | jq -r '.data[0].mime_type')
check "evidence row is current" "true" "$EVIDENCE_CURRENT"
check "evidence row has the right MIME type" "application/pdf" "$EVIDENCE_MIME"

echo ""
echo "== Test P: Branch Head can now REJECT an income transaction, not just confirm it =="
echo "   (added 2026-09-27, user's explicit request — approvals.service.ts#reject() was"
echo "   EXPENSE-only before this; reuses Test N/O's income transaction, AFTER those"
echo "   checks already ran against it, so rejecting it here doesn't undermine them)"
REJECT_RESP=$(curl -s -X POST -H "x-external-user-id: bh1" -H "Content-Type: application/json" \
  "$BASE/transactions/$INCOME2_TXN_ID/reject" -d '{"reason":"ทดสอบ: ปฏิเสธรายรับเพื่อยืนยัน Test P"}')
echo "  reject response: $REJECT_RESP"
REJECT_STATUS=$(echo "$REJECT_RESP" | jq -r '.data.status')
check "income transaction status is now REJECTED" "REJECTED" "$REJECT_STATUS"

AUDIT_ACTION=$(psql "postgresql://bfts:bfts_dev_password@localhost:5432/bfts_dev" -t -A -c \
  "SELECT action FROM audit_logs WHERE target_id='$INCOME2_TXN_ID' ORDER BY created_at DESC LIMIT 1;")
check "audit action is the generic TRANSACTION_REJECTED (not income-specific)" "TRANSACTION_REJECTED" "$AUDIT_ACTION"

PENDING_STILL_LISTS_IT=$(curl -s -H "x-external-user-id: bh1" "$BASE/approvals/pending" | \
  jq -r --arg id "$INCOME2_TXN_ID" '[.data[] | select(.id == $id)] | length')
check "rejected income no longer appears in the pending-approvals list" "0" "$PENDING_STILL_LISTS_IT"

echo ""
echo "== Test I: unlink endpoint, then link-status is false again =="
curl -s -H "x-external-user-id: t2" -X DELETE "$BASE/line/link" > /dev/null
STATUS_UNLINKED=$(curl -s -H "x-external-user-id: t2" "$BASE/line/link-status" | jq -r '.data.linked')
check "unlinked" "false" "$STATUS_UNLINKED"

echo ""
echo "=================================================="
echo "PASS: $PASS   FAIL: $FAIL"
echo "=================================================="
[ "$FAIL" -eq 0 ]
