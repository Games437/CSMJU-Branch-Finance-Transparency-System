/**
 * Free-text parser for LINE OA quick-entry messages (e.g. a Treasurer
 * typing "เก็บเงินห้องได้ 10000 บาท" straight into the branch's LINE OA).
 *
 * ASSUMPTION (confirmed with the user, 2026-09-26 — chose "flexible,
 * auto-extract" over a strict fixed format or a Quick-Reply-button flow):
 * the LAST number found in the message is the amount, and everything
 * before it — with a small set of trailing connector words stripped — is
 * the category label. This is a best-effort heuristic, not a guarantee:
 * a message the heuristic can't confidently parse an amount out of is
 * left unparsed (amount: null) rather than guessed, and the caller
 * (LineService) must NOT create a transaction in that case — see
 * LineMessageStatus.PARSE_FAILED.
 *
 * Deliberately a pure function with no I/O, so it can be verified in
 * isolation (see verify-line-parser.ts) without a database or a running
 * server.
 */

export interface ParsedLineMessage {
  type: "INCOME" | "EXPENSE";
  amount: number | null;
  category: string | null;
}

// Presence of any of these words anywhere in the message flips the
// inferred type to EXPENSE. Kept short and specific on purpose — a false
// EXPENSE classification is easy for a Branch Head to catch and reject at
// the NEEDS_REVIEW/PENDING approval step either way (Integration Spec
// principle: land conservatively, let a human confirm), so this list only
// needs to be "good enough", not perfect.
const EXPENSE_KEYWORDS = ["จ่าย", "ซื้อ", "รายจ่าย", "เบิก", "ค่าใช้จ่าย"];

// Trailing words stripped off the end of the category candidate, applied
// repeatedly until none match. Order doesn't matter since each pass scans
// the whole list.
const TRAILING_STOPWORDS = [
  "ได้รับ",
  "ได้",
  "จำนวน",
  "เป็นเงิน",
  "รวมเป็นเงิน",
  "รวม",
  "ทั้งหมด",
  "รับมา",
  "รับ",
  "จาก",
  "มา",
  "แล้ว",
];

// Matches a run of digits (with optional comma thousands separators and
// an optional decimal part), e.g. "10000", "5,000.50". Requires at least
// one digit so it never matches a bare "." or ",".
const NUMBER_PATTERN = /\d[\d,]*(?:\.\d+)?/g;

export function inferTransactionType(text: string): "INCOME" | "EXPENSE" {
  return EXPENSE_KEYWORDS.some((keyword) => text.includes(keyword)) ? "EXPENSE" : "INCOME";
}

export function parseLineMessage(rawText: string): ParsedLineMessage {
  const text = rawText.trim();
  const type = inferTransactionType(text);

  const matches = [...text.matchAll(NUMBER_PATTERN)];
  if (matches.length === 0) {
    return { type, amount: null, category: null };
  }

  const last = matches[matches.length - 1];
  const amount = Number(last[0].replace(/,/g, ""));
  if (!Number.isFinite(amount) || amount <= 0) {
    return { type, amount: null, category: null };
  }

  let category = text.slice(0, last.index).trim();
  let changed = true;
  while (changed) {
    changed = false;
    for (const stopword of TRAILING_STOPWORDS) {
      if (category.endsWith(stopword)) {
        category = category.slice(0, category.length - stopword.length).trim();
        changed = true;
      }
    }
  }
  category = category.replace(/[:\-–—,.\s]+$/u, "").trim();

  return { type, amount, category: category.length > 0 ? category : null };
}

// "ผูกบัญชี <code>" — the one command this feature recognizes besides a
// plain transaction report. Checked BEFORE parseLineMessage() is even
// called (see LineService#handleMessage) so a link code never gets
// mistaken for a transaction report.
export const LINK_COMMAND_PREFIX = "ผูกบัญชี";

export function extractLinkCode(rawText: string): string | null {
  const text = rawText.trim();
  if (!text.startsWith(LINK_COMMAND_PREFIX)) {
    return null;
  }
  const rest = text.slice(LINK_COMMAND_PREFIX.length).trim();
  return rest.length > 0 ? rest.toUpperCase() : null;
}
