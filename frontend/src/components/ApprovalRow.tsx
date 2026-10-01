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
import { StatusBadge } from "@/components/csmju/StatusBadge";
import {
  alertClasses,
  cardClass,
  dangerButtonClass,
  inputClass,
  labelClass,
  primaryButtonClass,
  secondaryButtonClass,
} from "@/components/csmju/ui";
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
  externalUserId: string | null;
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
    <div className={cardClass}>
      <button
        type="button"
        onClick={() => setExpanded((e) => !e)}
        aria-expanded={expanded}
        className="flex w-full items-center justify-between gap-3 p-4 text-left hover:bg-surface/50"
      >
        <div className="min-w-0 flex-1">
          <p className="truncate text-body-md font-medium text-on-surface">{item.description}</p>
          <p className="text-caption text-on-surface-variant">{dateFmt.format(new Date(item.transactionDate))}</p>
        </div>
        <span className="tabular-nums font-semibold text-on-surface">{thb.format(Number(item.amount))}</span>
        <StatusBadge status={item.status} />
      </button>

      {expanded && (
        <div className="border-t border-outline-variant/40 p-4">
          {error && <div className={`${alertClasses.error} mb-3`}>{error}</div>}

          {/* Business Rule 6 (amended 2026-09-27): evidence can exist on
              either EXPENSE or INCOME, so the Branch Head needs to be able
              to see what was attached before confirming an income entry
              too (e.g. a donation transfer slip reported via LINE) — this
              used to be gated to `item.type === "EXPENSE"`, which hid the
              file entirely on the income-confirm path. No `canUpload` here
              on purpose: this is someone else's transaction, the Branch
              Head only ever reviews it (see this file's header comment). */}
          <EvidenceViewer
            transactionId={item.id}
            externalUserId={externalUserId}
            transactionType={item.type === "INCOME" ? "INCOME" : "EXPENSE"}
          />

          {/* AMENDED 2026-09-27 (user's explicit request, "เพิ่มปุ่มไม่อนุมัติ
              ด้วยในส่วนรายรับ"): reject used to be EXPENSE-only here,
              matching the backend before this same change — an income
              report had no "this is wrong" path at all, only confirm.
              approvals.service.ts#reject() now accepts either type, so
              this is just removing the `item.type === "EXPENSE"` gate and
              picking the right label/handler for the primary action
              (confirm vs approve) while sharing one reject flow for both,
              since listPendingApprovals() only ever surfaces these two
              types here (this file's header comment). */}
          {!showRejectForm && (
            <div className="flex justify-end gap-3">
              <button type="button" onClick={() => setShowRejectForm(true)} disabled={acting} className={dangerButtonClass}>
                ไม่อนุมัติ
              </button>
              <button
                type="button"
                onClick={item.type === "INCOME" ? handleConfirmIncome : handleApprove}
                disabled={acting}
                className={primaryButtonClass}
              >
                {acting ? "กำลังดำเนินการ..." : item.type === "INCOME" ? "ยืนยันรายรับ" : "อนุมัติ"}
              </button>
            </div>
          )}

          {showRejectForm && (
            <RejectForm acting={acting} onCancel={() => setShowRejectForm(false)} onSubmit={handleReject} />
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
      <label className="mb-2 block">
        <span className={labelClass}>เหตุผลที่ไม่อนุมัติ (จำเป็นต้องระบุ)</span>
        <textarea
          value={reason}
          onChange={(e) => setReason(e.target.value)}
          required
          maxLength={500}
          rows={2}
          className={inputClass}
        />
      </label>
      <div className="flex justify-end gap-3">
        <button type="button" onClick={onCancel} disabled={acting} className={secondaryButtonClass}>
          ยกเลิก
        </button>
        <button type="submit" disabled={acting || !reason.trim()} className={dangerButtonClass}>
          {acting ? "กำลังดำเนินการ..." : "ยืนยันการไม่อนุมัติ"}
        </button>
      </div>
    </form>
  );
}
