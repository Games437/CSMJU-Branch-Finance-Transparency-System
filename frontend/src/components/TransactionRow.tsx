"use client";

import { useState } from "react";
import type { Transaction } from "@/lib/api";
import { statusBadgeClasses, statusLabelTh } from "@/lib/status-styles";
import { EvidenceViewer } from "@/components/EvidenceViewer";

// ============================================================================
// Read-only row for the Year Account Detail page — shown to every role
// (STUDENT/TREASURER/BRANCH_HEAD all read transactions branch-wide or
// within their own year, per transactions.service.ts#list). No edit or
// approval actions here on purpose: editing lives on the Treasurer's own
// Expenses page (ExpenseRow.tsx) and approve/reject/confirm live on the
// Branch Head's Approvals page (ApprovalRow.tsx). This is purely a
// browsing/audit view of a transaction plus its evidence, when it has any.
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
}

export function TransactionRow({ transaction, externalUserId }: Props) {
  const [expanded, setExpanded] = useState(false);

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

      {expanded && transaction.type === "EXPENSE" && (
        <div className="border-t border-paperLine p-4">
          <EvidenceViewer transactionId={transaction.id} externalUserId={externalUserId} />
        </div>
      )}
    </div>
  );
}
