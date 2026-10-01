"use client";

import { useEffect, useRef, useState } from "react";
import {
  ApiError,
  fetchEvidenceObjectUrl,
  listEvidenceForTransaction,
  uploadEvidence,
  type EvidenceMeta,
} from "@/lib/api";
import { alertClasses, tonalButtonClass } from "@/components/csmju/ui";

// ============================================================================
// Evidence display, shared by any screen where a viewer needs to see a
// transaction's attached bill. Used by ApprovalRow.tsx (Branch Head
// reviewing, read-only) and the Year Account Detail transaction table (all
// roles browsing — read-only for most, upload-capable for the Treasurer who
// owns the transaction, via `canUpload`).
//
// Upload was added 2026-09-27 (the user asked for it explicitly, after
// Business Rule 6 was amended to allow evidence on INCOME too — see
// evidence.service.ts): previously this component was read-only and the
// only upload control lived in ExpenseRow.tsx, which is EXPENSE-specific
// (the Treasurer's own /expenses page). There is no equivalent "/incomes"
// page — manual income creation isn't built; INCOME transactions exist
// today only via LINE — so the Year Account Detail table (which already
// lists every transaction, INCOME included) is where an income-evidence
// upload control belongs. ExpenseRow.tsx's own upload UI is left as-is
// (duplication, but working code — not touched without being asked).
//
// Backend confirms all three roles (STUDENT, TREASURER, BRANCH_HEAD) are
// permitted to call GET /expenses/:id/evidence and GET /evidence/:id (see
// evidence.controller.ts — Section 31 #12 resolved full bill visibility
// for students); POST is TREASURER/BRANCH_HEAD only, so `canUpload` should
// only ever be passed as true for those roles — this component trusts the
// caller's gate and additionally relies on the backend's own RBAC/year-scope
// checks as the real enforcement (a wrongly-passed `canUpload` just gets a
// 403, not a security hole).
// ============================================================================

export function EvidenceViewer({
  transactionId,
  externalUserId,
  transactionType = "EXPENSE",
  canUpload = false,
}: {
  transactionId: string;
  externalUserId: string | null;
  // Only affects the "no evidence yet" copy below (Business Rule 4.2's
  // "must have evidence before approval" applies to EXPENSE only — see
  // approvals.service.ts). Evidence itself can exist on either type
  // (Business Rule 6, amended 2026-09-27) — the fetch/display logic
  // below doesn't need to know which.
  transactionType?: "INCOME" | "EXPENSE" | "ADJUSTMENT";
  // Whether to show the upload/replace control. The caller decides this
  // (role === TREASURER, transaction.createdBy === current user, and the
  // transaction still in its not-yet-decided status) — see TransactionRow.tsx.
  canUpload?: boolean;
}) {
  const [evidence, setEvidence] = useState<EvidenceMeta[] | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const refresh = async () => {
    try {
      const list = await listEvidenceForTransaction(externalUserId, transactionId);
      setEvidence(list);
    } catch (err) {
      setLoadError(err instanceof ApiError ? err.message : "โหลดรายการหลักฐานไม่สำเร็จ");
    }
  };

  useEffect(() => {
    setEvidence(null);
    setLoadError(null);
    refresh();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [transactionId, externalUserId]);

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploading(true);
    setUploadError(null);
    try {
      await uploadEvidence(externalUserId, transactionId, file);
      await refresh();
    } catch (err) {
      setUploadError(err instanceof ApiError ? err.message : "อัปโหลดไฟล์ไม่สำเร็จ");
    } finally {
      setUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  };

  const currentEvidence = evidence?.find((e) => e.isCurrent);

  return (
    <div className="mb-4">
      <h4 className="mb-2 text-label-md text-on-surface">หลักฐาน/บิล</h4>
      {loadError && <p className="mb-2 text-body-md text-error">{loadError}</p>}
      {uploadError && <p className="mb-2 text-body-md text-error">{uploadError}</p>}
      {evidence === null ? (
        <p className="text-body-md text-on-surface-variant">กำลังโหลด...</p>
      ) : currentEvidence ? (
        <EvidencePreview evidence={currentEvidence} externalUserId={externalUserId} />
      ) : (
        <p className={`${alertClasses.warning} mb-2`}>
          {transactionType === "EXPENSE"
            ? "ยังไม่มีหลักฐานแนบ — ต้องมีหลักฐานก่อนจึงจะอนุมัติได้ (ตามกฎการเงินข้อ 4.2)"
            : "ยังไม่มีหลักฐานแนบ (ไม่บังคับสำหรับรายรับ)"}
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

function EvidencePreview({ evidence, externalUserId }: { evidence: EvidenceMeta; externalUserId: string | null }) {
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
