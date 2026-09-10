"use client";

import { useEffect, useRef, useState } from "react";
import {
  ApiError,
  fetchEvidenceObjectUrl,
  listEvidenceForTransaction,
  updateExpense,
  uploadEvidence,
  type EvidenceMeta,
  type Transaction,
} from "@/lib/api";
import { statusBadgeClasses, statusLabelTh } from "@/lib/status-styles";

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
    <div className="rounded-passbook border-2 border-paperLine bg-white">
      <button
        onClick={() => setExpanded((e) => !e)}
        className="flex w-full items-center justify-between gap-3 p-4 text-left"
      >
        <div className="min-w-0 flex-1">
          <p className="truncate font-medium text-ink">{transaction.description}</p>
          <p className="text-xs text-inkFaint">
            {dateFmt.format(new Date(transaction.transactionDate))}
            {transaction.category ? ` · ${transaction.category}` : ""}
          </p>
        </div>
        <span className="font-mono font-semibold text-ink">{thb.format(Number(transaction.amount))}</span>
        <span className={`shrink-0 rounded-full px-2 py-0.5 text-xs font-medium ${statusBadgeClasses(transaction.status)}`}>
          {statusLabelTh(transaction.status)}
        </span>
      </button>

      {expanded && (
        <div className="border-t border-paperLine p-4">
          <EvidenceSection
            transaction={transaction}
            externalUserId={externalUserId}
            canUpload={canEdit}
          />
          {canEdit && (
            <EditForm
              transaction={transaction}
              externalUserId={externalUserId}
              onUpdated={onUpdated}
            />
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
      <h4 className="mb-2 text-sm font-semibold text-ink">หลักฐาน/บิล</h4>
      {error && <p className="mb-2 text-sm text-rust">{error}</p>}

      {evidence === null ? (
        <p className="text-sm text-inkFaint">กำลังโหลด...</p>
      ) : currentEvidence ? (
        <EvidencePreview evidence={currentEvidence} externalUserId={externalUserId} />
      ) : (
        <p className="mb-2 text-sm text-rust">
          ยังไม่มีหลักฐานแนบ — ต้องแนบก่อนจึงจะอนุมัติได้ (ตามกฎการเงินข้อ 4.2)
        </p>
      )}

      {canUpload && (
        <div className="mt-2">
          <label className="inline-block cursor-pointer rounded-full border border-jade px-3 py-1 text-xs text-jade hover:bg-jadeSoft">
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
          <p className="mt-1 text-xs text-inkFaint">รองรับ PDF, JPEG, PNG, WEBP ขนาดไม่เกิน 10MB</p>
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
    <div className="flex items-center gap-3 rounded-passbook border border-paperLine bg-paper p-2">
      {objectUrl && evidence.mimeType.startsWith("image/") ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={objectUrl} alt={evidence.originalFilename} className="h-16 w-16 rounded object-cover" />
      ) : (
        <span className="flex h-16 w-16 items-center justify-center rounded bg-jadeSoft text-xs text-jade">
          PDF
        </span>
      )}
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm text-ink">{evidence.originalFilename}</p>
        <p className="text-xs text-inkFaint">
          เวอร์ชัน {evidence.version} · {(evidence.sizeBytes / 1024).toFixed(0)} KB
        </p>
      </div>
      {objectUrl && (
        <a href={objectUrl} target="_blank" rel="noreferrer" className="shrink-0 text-xs text-jade underline">
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
    <form onSubmit={handleSubmit} className="border-t border-paperLine pt-4">
      <h4 className="mb-2 text-sm font-semibold text-ink">แก้ไขรายการ (ทำได้เฉพาะขณะรออนุมัติ)</h4>
      {error && <p className="mb-2 text-sm text-rust">{error}</p>}
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        <label className="text-sm text-inkFaint">
          จำนวนเงิน
          <input
            type="number"
            step="0.01"
            min="0.01"
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            className="mt-1 w-full rounded border border-paperLine px-2 py-1 font-mono text-ink"
            required
          />
        </label>
        <label className="text-sm text-inkFaint sm:col-span-2">
          รายละเอียด
          <input
            type="text"
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            className="mt-1 w-full rounded border border-paperLine px-2 py-1 text-ink"
            required
            maxLength={500}
          />
        </label>
        <label className="text-sm text-inkFaint">
          หมวดหมู่ (ถ้ามี)
          <input
            type="text"
            value={category}
            onChange={(e) => setCategory(e.target.value)}
            className="mt-1 w-full rounded border border-paperLine px-2 py-1 text-ink"
            maxLength={100}
          />
        </label>
      </div>
      <button
        type="submit"
        disabled={saving}
        className="mt-3 rounded-full bg-jade px-4 py-1.5 text-sm text-white disabled:opacity-50"
      >
        {saving ? "กำลังบันทึก..." : "บันทึกการแก้ไข"}
      </button>
    </form>
  );
}
