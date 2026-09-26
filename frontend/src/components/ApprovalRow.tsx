"use client";

import { useState } from "react";
import {
  ApiError,
  approveTransaction,
  confirmIncome,
  rejectTransaction,
  type PendingApprovalItem,
  type Transaction,
} from "@/lib/api";
import { statusBadgeClasses, statusLabelTh } from "@/lib/status-styles";
import { EvidenceViewer } from "@/components/EvidenceViewer";

// ============================================================================
// Separate from ExpenseRow.tsx on purpose (per project decision): this is a
// Branch Head reviewing someone else's transaction — no editing, no
// evidence upload, and it needs approve/reject/confirm actions that
// ExpenseRow has no reason to know about. Keeping them apart avoids
// regression risk on the already-verified expenses page.
//
// listPendingApprovals() (backend's approvals.service.ts#listPending) only
// ever returns EXPENSE transactions in PENDING and INCOME transactions in
// NEEDS_REVIEW — never ADJUSTMENT — so this component only implements
// those two branches. There is no void action here: void only applies to
// already-APPROVED transactions (see approvals.service.ts#void), which
// never appear in this "pending" list.
// ============================================================================

const thb = new Intl.NumberFormat("th-TH", { style: "currency", currency: "THB" });
const dateFmt = new Intl.DateTimeFormat("th-TH", { year: "numeric", month: "short", day: "numeric" });

interface Props {
  item: PendingApprovalItem;
  externalUserId: string;
  onResolved: (transactionId: string, updated: Transaction) => void;
}

export function ApprovalRow({ item, externalUserId, onResolved }: Props) {
  const [expanded, setExpanded] = useState(false);
  const [acting, setActing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showRejectForm, setShowRejectForm] = useState(false);

  const handleApprove = async () => {
    setActing(true);
    setError(null);
    try {
      const updated = await approveTransaction(externalUserId, item.id);
      onResolved(item.id, updated);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "อนุมัติไม่สำเร็จ");
      setActing(false);
    }
  };

  const handleConfirmIncome = async () => {
    setActing(true);
    setError(null);
    try {
      const updated = await confirmIncome(externalUserId, item.id);
      onResolved(item.id, updated);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "ยืนยันรายรับไม่สำเร็จ");
      setActing(false);
    }
  };

  const handleReject = async (reason: string) => {
    setActing(true);
    setError(null);
    try {
      const updated = await rejectTransaction(externalUserId, item.id, reason);
      onResolved(item.id, updated);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "ปฏิเสธไม่สำเร็จ");
      setActing(false);
    }
  };

  return (
    <div className="rounded-passbook border-2 border-paperLine bg-white">
      <button
        onClick={() => setExpanded((e) => !e)}
        className="flex w-full items-center justify-between gap-3 p-4 text-left"
      >
        <div className="min-w-0 flex-1">
          <p className="truncate font-medium text-ink">{item.description}</p>
          <p className="text-xs text-inkFaint">{dateFmt.format(new Date(item.transactionDate))}</p>
        </div>
        <span className="font-mono font-semibold text-ink">{thb.format(Number(item.amount))}</span>
        <span className={`shrink-0 rounded-full px-2 py-0.5 text-xs font-medium ${statusBadgeClasses(item.status)}`}>
          {statusLabelTh(item.status)}
        </span>
      </button>

      {expanded && (
        <div className="border-t border-paperLine p-4">
          {error && <p className="mb-3 text-sm text-rust">{error}</p>}

          {item.type === "EXPENSE" && (
            <EvidenceViewer transactionId={item.id} externalUserId={externalUserId} />
          )}

          {item.type === "EXPENSE" && !showRejectForm && (
            <div className="flex gap-2">
              <button
                onClick={handleApprove}
                disabled={acting}
                className="rounded-full bg-jade px-4 py-1.5 text-sm text-white disabled:opacity-50"
              >
                {acting ? "กำลังดำเนินการ..." : "อนุมัติ"}
              </button>
              <button
                onClick={() => setShowRejectForm(true)}
                disabled={acting}
                className="rounded-full border border-rust px-4 py-1.5 text-sm text-rust disabled:opacity-50"
              >
                ปฏิเสธ
              </button>
            </div>
          )}

          {item.type === "EXPENSE" && showRejectForm && (
            <RejectForm
              acting={acting}
              onCancel={() => setShowRejectForm(false)}
              onSubmit={handleReject}
            />
          )}

          {item.type === "INCOME" && (
            <button
              onClick={handleConfirmIncome}
              disabled={acting}
              className="rounded-full bg-jade px-4 py-1.5 text-sm text-white disabled:opacity-50"
            >
              {acting ? "กำลังดำเนินการ..." : "ยืนยันรายรับ"}
            </button>
          )}
        </div>
      )}
    </div>
  );
}

function RejectForm({
  acting,
  onCancel,
  onSubmit,
}: {
  acting: boolean;
  onCancel: () => void;
  onSubmit: (reason: string) => void;
}) {
  const [reason, setReason] = useState("");

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const trimmed = reason.trim();
    if (!trimmed) return;
    onSubmit(trimmed);
  };

  return (
    <form onSubmit={handleSubmit}>
      <label className="mb-2 block text-sm text-inkFaint">
        เหตุผลที่ปฏิเสธ (จำเป็นต้องระบุ)
        <textarea
          value={reason}
          onChange={(e) => setReason(e.target.value)}
          required
          maxLength={500}
          rows={2}
          className="mt-1 w-full rounded border border-paperLine px-2 py-1 text-ink"
        />
      </label>
      <div className="flex gap-2">
        <button
          type="submit"
          disabled={acting || !reason.trim()}
          className="rounded-full bg-rust px-4 py-1.5 text-sm text-white disabled:opacity-50"
        >
          {acting ? "กำลังดำเนินการ..." : "ยืนยันการปฏิเสธ"}
        </button>
        <button
          type="button"
          onClick={onCancel}
          disabled={acting}
          className="rounded-full border border-paperLine px-4 py-1.5 text-sm text-inkFaint disabled:opacity-50"
        >
          ยกเลิก
        </button>
      </div>
    </form>
  );
}
