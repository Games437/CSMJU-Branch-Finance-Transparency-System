"use client";

import { useEffect, useRef, useState } from "react";
import {
  ApiError,
  cancelExpense,
  fetchEvidenceObjectUrl,
  listEvidenceForTransaction,
  updateExpense,
  uploadEvidence,
  type EvidenceMeta,
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
  tonalButtonClass,
} from "@/components/csmju/ui";

const thb = new Intl.NumberFormat("th-TH", { style: "currency", currency: "THB" });
const dateFmt = new Intl.DateTimeFormat("th-TH", { year: "numeric", month: "short", day: "numeric" });

interface Props {
  transaction: Transaction;
  externalUserId: string;
  currentUserId: string;
  onUpdated: (updated: Transaction) => void;
}

export function ExpenseRow({ transaction, externalUserId, currentUserId, onUpdated }: Props) {
  const [expanded, setExpanded] = useState(false);
  const canEdit = transaction.status === "PENDING" && transaction.createdBy === currentUserId;

  return (
    <div className={cardClass}>
      <button
        type="button"
        onClick={() => setExpanded((e) => !e)}
        aria-expanded={expanded}
        className="flex w-full items-center justify-between gap-3 p-4 text-left hover:bg-surface/50"
      >
        <div className="min-w-0 flex-1">
          <p className="truncate text-body-md font-medium text-on-surface">{transaction.description}</p>
          <p className="text-caption text-on-surface-variant">
            {dateFmt.format(new Date(transaction.transactionDate))}
            {transaction.category ? ` · ${transaction.category}` : ""}
          </p>
        </div>
        <span className="tabular-nums font-semibold text-on-surface">{thb.format(Number(transaction.amount))}</span>
        <StatusBadge status={transaction.status} />
      </button>

      {expanded && (
        <div className="border-t border-outline-variant/40 p-4">
          <EvidenceSection transaction={transaction} externalUserId={externalUserId} canUpload={canEdit} />
          {canEdit && (
            <EditForm transaction={transaction} externalUserId={externalUserId} onUpdated={onUpdated} />
          )}
          {canEdit && (
            <CancelSection transaction={transaction} externalUserId={externalUserId} onUpdated={onUpdated} />
          )}
        </div>
      )}
    </div>
  );
}

function EvidenceSection({
  transaction,
  externalUserId,
  canUpload,
}: {
  transaction: Transaction;
  externalUserId: string;
  canUpload: boolean;
}) {
  const [evidence, setEvidence] = useState<EvidenceMeta[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const refresh = async () => {
    try {
      const list = await listEvidenceForTransaction(externalUserId, transaction.id);
      setEvidence(list);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "โหลดรายการหลักฐานไม่สำเร็จ");
    }
  };

  useEffect(() => {
    refresh();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [transaction.id]);

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploading(true);
    setError(null);
    try {
      await uploadEvidence(externalUserId, transaction.id, file);
      await refresh();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "อัปโหลดไฟล์ไม่สำเร็จ");
    } finally {
      setUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  };

  const currentEvidence = evidence?.find((e) => e.isCurrent);

  return (
    <div className="mb-4">
      <h4 className="mb-2 text-label-md text-on-surface">หลักฐาน/บิล</h4>
      {error && <p className="mb-2 text-body-md text-error">{error}</p>}

      {evidence === null ? (
        <p className="text-body-md text-on-surface-variant">กำลังโหลด...</p>
      ) : currentEvidence ? (
        <EvidencePreview evidence={currentEvidence} externalUserId={externalUserId} />
      ) : (
        <p className={`${alertClasses.warning} mb-2`}>
          ยังไม่มีหลักฐานแนบ — ต้องแนบก่อนจึงจะอนุมัติได้ (ตามกฎการเงินข้อ 4.2)
        </p>
      )}

      {canUpload && (
        <div className="mt-2">
          <label className={`${tonalButtonClass} inline-flex cursor-pointer`}>
            {uploading ? "กำลังอัปโหลด..." : currentEvidence ? "แทนที่ไฟล์ใหม่" : "อัปโหลดไฟล์"}
            <input
              ref={fileInputRef}
              type="file"
              accept="application/pdf,image/jpeg,image/png,image/webp"
              className="hidden"
              disabled={uploading}
              onChange={handleFileChange}
            />
          </label>
          <p className="mt-1 text-caption text-on-surface-variant">รองรับ PDF, JPEG, PNG, WEBP ขนาดไม่เกิน 10MB</p>
        </div>
      )}
    </div>
  );
}

function EvidencePreview({ evidence, externalUserId }: { evidence: EvidenceMeta; externalUserId: string }) {
  const [objectUrl, setObjectUrl] = useState<string | null>(null);

  useEffect(() => {
    let revoked = "";
    fetchEvidenceObjectUrl(externalUserId, evidence.id)
      .then((url) => {
        revoked = url;
        setObjectUrl(url);
      })
      .catch(() => setObjectUrl(null));
    return () => {
      if (revoked) URL.revokeObjectURL(revoked);
    };
  }, [evidence.id, externalUserId]);

  return (
    <div className="flex items-center gap-3 rounded-xl border border-outline-variant/40 bg-surface-container-low p-2">
      {objectUrl && evidence.mimeType.startsWith("image/") ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={objectUrl} alt={evidence.originalFilename} className="h-16 w-16 rounded-lg object-cover" />
      ) : (
        <span className="flex h-16 w-16 items-center justify-center rounded-lg bg-primary-container/10 text-label-sm text-primary-container">
          PDF
        </span>
      )}
      <div className="min-w-0 flex-1">
        <p className="truncate text-body-md text-on-surface">{evidence.originalFilename}</p>
        <p className="text-caption text-on-surface-variant">
          เวอร์ชัน {evidence.version} · {(evidence.sizeBytes / 1024).toFixed(0)} KB
        </p>
      </div>
      {objectUrl && (
        <a
          href={objectUrl}
          target="_blank"
          rel="noreferrer"
          className="shrink-0 text-label-sm text-primary-container underline"
        >
          เปิดดู
        </a>
      )}
    </div>
  );
}

function EditForm({
  transaction,
  externalUserId,
  onUpdated,
}: {
  transaction: Transaction;
  externalUserId: string;
  onUpdated: (updated: Transaction) => void;
}) {
  const [amount, setAmount] = useState(transaction.amount);
  const [description, setDescription] = useState(transaction.description);
  const [category, setCategory] = useState(transaction.category ?? "");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    setError(null);
    try {
      const updated = await updateExpense(externalUserId, transaction.id, {
        amount: Number(amount),
        description,
        category: category || undefined,
      });
      onUpdated(updated);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "บันทึกไม่สำเร็จ");
    } finally {
      setSaving(false);
    }
  };

  return (
    <form onSubmit={handleSubmit} className="border-t border-outline-variant/40 pt-4">
      <h4 className="mb-2 text-label-md text-on-surface">แก้ไขรายการ (ทำได้เฉพาะขณะรออนุมัติ)</h4>
      {error && <p className={`${alertClasses.error} mb-2`}>{error}</p>}
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        <label>
          <span className={labelClass}>จำนวนเงิน</span>
          <input
            type="number"
            step="0.01"
            min="0.01"
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            className={`${inputClass} tabular-nums font-mono`}
            required
          />
        </label>
        <label className="sm:col-span-2">
          <span className={labelClass}>รายละเอียด</span>
          <input
            type="text"
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            className={inputClass}
            required
            maxLength={500}
          />
        </label>
        <label>
          <span className={labelClass}>หมวดหมู่ (ถ้ามี)</span>
          <input
            type="text"
            value={category}
            onChange={(e) => setCategory(e.target.value)}
            className={inputClass}
            maxLength={100}
          />
        </label>
      </div>
      <div className="mt-3 flex justify-end">
        <button type="submit" disabled={saving} className={primaryButtonClass}>
          {saving ? "กำลังบันทึก..." : "บันทึกการแก้ไข"}
        </button>
      </div>
    </form>
  );
}

/**
 * Lets the person who created this still-PENDING expense withdraw it
 * before Branch Head review — separate from EditForm above (editing
 * changes the request, cancelling withdraws it entirely). Requires a
 * reason, same pattern as ApprovalRow.tsx's reject/void forms. The
 * transaction is never deleted: it transitions to CANCELLED and stays
 * visible in the list with that status (no hard delete of financial
 * records — see backend's transactions.service.ts#cancelExpense).
 */
function CancelSection({
  transaction,
  externalUserId,
  onUpdated,
}: {
  transaction: Transaction;
  externalUserId: string;
  onUpdated: (updated: Transaction) => void;
}) {
  const [showForm, setShowForm] = useState(false);
  const [reason, setReason] = useState("");
  const [cancelling, setCancelling] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const trimmed = reason.trim();
    if (!trimmed) return;
    setCancelling(true);
    setError(null);
    try {
      const updated = await cancelExpense(externalUserId, transaction.id, trimmed);
      onUpdated(updated);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "ยกเลิกรายการไม่สำเร็จ");
      setCancelling(false);
    }
  };

  if (!showForm) {
    return (
      <div className="mt-3 border-t border-outline-variant/40 pt-3">
        <button type="button" onClick={() => setShowForm(true)} className={dangerButtonClass}>
          ยกเลิกรายการ
        </button>
      </div>
    );
  }

  return (
    <form onSubmit={handleSubmit} className="mt-3 border-t border-outline-variant/40 pt-3">
      <h4 className="mb-2 text-label-md text-on-surface">ยกเลิกรายการนี้</h4>
      {error && <p className={`${alertClasses.error} mb-2`}>{error}</p>}
      <label className="mb-2 block">
        <span className={labelClass}>เหตุผลที่ยกเลิก (จำเป็นต้องระบุ)</span>
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
        <button type="button" onClick={() => setShowForm(false)} disabled={cancelling} className={secondaryButtonClass}>
          ปิด
        </button>
        <button type="submit" disabled={cancelling || !reason.trim()} className={dangerButtonClass}>
          {cancelling ? "กำลังยกเลิก..." : "ยืนยันการยกเลิก"}
        </button>
      </div>
    </form>
  );
}
