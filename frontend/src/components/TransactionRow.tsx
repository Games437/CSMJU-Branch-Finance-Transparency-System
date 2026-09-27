"use client";

import { useState } from "react";
import type { Transaction } from "@/lib/api";
import { statusBadgeClasses, statusLabelTh } from "@/lib/status-styles";
import { EvidenceViewer } from "@/components/EvidenceViewer";

// ============================================================================
// Row for the Year Account Detail page — shown to every role
// (STUDENT/TREASURER/BRANCH_HEAD all read transactions branch-wide or
// within their own year, per transactions.service.ts#list). No edit or
// approve/reject/confirm actions here — editing an EXPENSE lives on the
// Treasurer's own Expenses page (ExpenseRow.tsx), and approval decisions
// live on the Branch Head's Approvals page (ApprovalRow.tsx). This is a
// browsing/audit view of a transaction plus its evidence — EXCEPT for one
// thing added 2026-09-27, at the user's explicit request: evidence UPLOAD
// for a Treasurer's own INCOME transaction, since (unlike EXPENSE) there is
// no dedicated "/incomes" page to put an upload control on — manual income
// creation isn't built, so income transactions exist today only via LINE,
// and this table is the only place a Treasurer ever sees their own income
// row to attach a bill to. See EvidenceViewer.tsx's `canUpload` for how the
// upload UI itself works.
// ============================================================================

const thb = new Intl.NumberFormat("th-TH", { style: "currency", currency: "THB" });
const dateFmt = new Intl.DateTimeFormat("th-TH", { year: "numeric", month: "short", day: "numeric" });

const typeLabelTh: Record<Transaction["type"], string> = {
  INCOME: "รายรับ",
  EXPENSE: "รายจ่าย",
  ADJUSTMENT: "รายการปรับปรุง",
};

interface Props {
  transaction: Transaction;
  externalUserId: string;
  // Both optional and both required together to enable upload: a caller
  // that doesn't pass them (e.g. a screen with no signed-in identity handy)
  // just gets the pre-2026-09-27 read-only behavior back, canUpload below
  // resolves to false either way.
  currentUserId?: string;
  role?: "STUDENT" | "TREASURER" | "BRANCH_HEAD";
}

export function TransactionRow({ transaction, externalUserId, currentUserId, role }: Props) {
  const [expanded, setExpanded] = useState(false);

  // Same ownership rule ExpenseRow.tsx uses for its own upload control
  // (`canEdit`), generalized to whichever "not yet decided" status this
  // transaction's type actually uses (Business Rule 6 / evidence.service.ts,
  // amended 2026-09-27): PENDING for EXPENSE, NEEDS_REVIEW for INCOME.
  // ADJUSTMENT is excluded above the render already (that flow doesn't
  // exist yet), so it never reaches here.
  const notYetDecidedStatus = transaction.type === "EXPENSE" ? "PENDING" : "NEEDS_REVIEW";
  const canUpload =
    role === "TREASURER" && transaction.createdBy === currentUserId && transaction.status === notYetDecidedStatus;

  return (
    <div className="rounded-passbook border-2 border-paperLine bg-white">
      <button
        onClick={() => setExpanded((e) => !e)}
        className="flex w-full items-center justify-between gap-3 p-4 text-left"
      >
        <div className="min-w-0 flex-1">
          <p className="truncate font-medium text-ink">{transaction.description}</p>
          <p className="text-xs text-inkFaint">
            {dateFmt.format(new Date(transaction.transactionDate))} · {typeLabelTh[transaction.type]}
            {transaction.category ? ` · ${transaction.category}` : ""}
            {transaction.sourceType === "LINE_REPORT" ? " · แจ้งผ่าน LINE" : ""}
          </p>
        </div>
        <span
          className={`font-mono font-semibold ${transaction.type === "EXPENSE" ? "text-rust" : "text-jade"}`}
        >
          {transaction.type === "EXPENSE" ? "-" : "+"}
          {thb.format(Number(transaction.amount))}
        </span>
        <span
          className={`shrink-0 rounded-full px-2 py-0.5 text-xs font-medium ${statusBadgeClasses(transaction.status)}`}
        >
          {statusLabelTh(transaction.status)}
        </span>
      </button>

      {expanded && transaction.type !== "ADJUSTMENT" && (
        // Business Rule 6 (amended 2026-09-27): evidence can now exist on
        // either INCOME or EXPENSE, not EXPENSE only — this used to be
        // gated to `transaction.type === "EXPENSE"`, which is exactly why
        // a PDF attached to an income report via LINE wasn't visible
        // here. ADJUSTMENT is excluded only because that flow doesn't
        // exist yet (see evidence.service.ts's note on it), not because
        // it's been decided to exclude it once it does.
        <div className="border-t border-paperLine p-4">
          <EvidenceViewer
            transactionId={transaction.id}
            externalUserId={externalUserId}
            transactionType={transaction.type === "INCOME" ? "INCOME" : "EXPENSE"}
            canUpload={canUpload}
          />
        </div>
      )}
    </div>
  );
}
