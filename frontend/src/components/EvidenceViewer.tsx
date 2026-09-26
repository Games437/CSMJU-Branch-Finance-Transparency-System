"use client";

import { useEffect, useState } from "react";
import {
  ApiError,
  fetchEvidenceObjectUrl,
  listEvidenceForTransaction,
  type EvidenceMeta,
} from "@/lib/api";

// ============================================================================
// Read-only evidence display, shared by any screen where a viewer needs to
// see an expense's attached bill but must NOT be able to upload/replace it
// (that upload control lives only in ExpenseRow.tsx, for the Treasurer who
// owns the transaction). Used by ApprovalRow.tsx (Branch Head reviewing)
// and the Year Account Detail transaction table (all roles browsing).
//
// Backend confirms all three roles (STUDENT, TREASURER, BRANCH_HEAD) are
// permitted to call GET /expenses/:id/evidence and GET /evidence/:id (see
// evidence.controller.ts — Section 31 #12 resolved full bill visibility
// for students), so this component does not need any role gating itself.
// ============================================================================

export function EvidenceViewer({
  transactionId,
  externalUserId,
}: {
  transactionId: string;
  externalUserId: string;
}) {
  const [evidence, setEvidence] = useState<EvidenceMeta[] | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setEvidence(null);
    setLoadError(null);
    listEvidenceForTransaction(externalUserId, transactionId)
      .then((list) => {
        if (!cancelled) setEvidence(list);
      })
      .catch((err) => {
        if (!cancelled) setLoadError(err instanceof ApiError ? err.message : "โหลดรายการหลักฐานไม่สำเร็จ");
      });
    return () => {
      cancelled = true;
    };
  }, [transactionId, externalUserId]);

  const currentEvidence = evidence?.find((e) => e.isCurrent);

  return (
    <div className="mb-4">
      <h4 className="mb-2 text-sm font-semibold text-ink">หลักฐาน/บิล</h4>
      {loadError && <p className="mb-2 text-sm text-rust">{loadError}</p>}
      {evidence === null ? (
        <p className="text-sm text-inkFaint">กำลังโหลด...</p>
      ) : currentEvidence ? (
        <EvidencePreview evidence={currentEvidence} externalUserId={externalUserId} />
      ) : (
        <p className="text-sm text-rust">
          ยังไม่มีหลักฐานแนบ — ต้องมีหลักฐานก่อนจึงจะอนุมัติได้ (ตามกฎการเงินข้อ 4.2)
        </p>
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
