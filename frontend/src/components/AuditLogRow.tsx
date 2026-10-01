"use client";

import { useState } from "react";
import { ApiError, getTransactionAuditTrail, type AuditLogEntry } from "@/lib/api";
import { cardClass, secondaryButtonClass } from "@/components/csmju/ui";

// ============================================================================
// One row of the Branch Head Audit Log Viewer
// (08_UI_UX_INFORMATION_ARCHITECTURE.md Section 7: "timeline/table with:
// Timestamp, Actor, Action, Target, Result, Year, Details drawer").
//
// "Result" has no dedicated field on AuditLog (every row already
// represents a *completed* mutation — audit.record() is only ever called
// after a transaction succeeds, never on a denied/failed attempt; grep
// confirms no failure-path call sites exist yet). So "Result" here is
// derived from the action name itself (approved/confirmed/created vs.
// rejected/voided), the same success/error color convention used
// everywhere else in this app for status — not invented pass/fail data.
// ============================================================================

const dateTimeFmt = new Intl.DateTimeFormat("th-TH", {
  year: "numeric",
  month: "short",
  day: "numeric",
  hour: "2-digit",
  minute: "2-digit",
});

const ACTION_LABEL_TH: Record<string, string> = {
  EXPENSE_CREATED: "สร้างรายการเบิกจ่าย",
  EXPENSE_UPDATED: "แก้ไขรายการเบิกจ่าย",
  UPLOAD_BILL: "อัปโหลดหลักฐาน/บิล",
  TRANSACTION_APPROVED: "อนุมัติรายการ",
  TRANSACTION_REJECTED: "ปฏิเสธรายการ",
  VOID_TRANSACTION: "ยกเลิกรายการ (หัวหน้าสาขา)",
  INCOME_CONFIRMED: "ยืนยันรายรับ",
  EXPENSE_CANCELLED: "ยกเลิกรายการ (ผู้สร้างรายการ)",
  ADVANCE_ACADEMIC_YEAR: "เลื่อนปีการศึกษา",
};

function actionLabel(action: string): string {
  return ACTION_LABEL_TH[action] ?? action;
}

function resultBadgeClasses(action: string): string {
  if (action === "TRANSACTION_REJECTED" || action === "VOID_TRANSACTION" || action === "EXPENSE_CANCELLED") {
    return "bg-error-container text-on-error-container";
  }
  return "bg-success/10 text-emerald-700";
}

function resultLabel(action: string): string {
  if (action === "TRANSACTION_REJECTED") return "ปฏิเสธ";
  if (action === "VOID_TRANSACTION") return "ยกเลิก (หัวหน้าสาขา)";
  if (action === "EXPENSE_CANCELLED") return "ยกเลิก (ผู้สร้าง)";
  return "สำเร็จ";
}

interface Props {
  entry: AuditLogEntry;
  externalUserId: string | null;
}

export function AuditLogRow({ entry, externalUserId }: Props) {
  const [expanded, setExpanded] = useState(false);
  const isSuccessTone = resultBadgeClasses(entry.action).includes("success");

  return (
    <div className={cardClass}>
      <button
        type="button"
        onClick={() => setExpanded((e) => !e)}
        aria-expanded={expanded}
        className="grid w-full grid-cols-1 gap-1 p-4 text-left hover:bg-surface/50 sm:grid-cols-[1fr_1fr_1fr_auto] sm:items-center sm:gap-3"
      >
        <div>
          <p className="text-caption text-on-surface-variant">{dateTimeFmt.format(new Date(entry.createdAt))}</p>
          <p className="text-body-md font-medium text-on-surface">{actionLabel(entry.action)}</p>
        </div>
        <div className="text-body-md text-on-surface-variant">
          ผู้กระทำ: {entry.actor ? `${entry.actor.displayName} (${entry.actor.externalUserId})` : "ระบบ"}
        </div>
        <div className="text-body-md text-on-surface-variant">
          {entry.targetType} · {entry.targetId.slice(0, 8)}…
          {entry.yearAccount ? ` · ${entry.yearAccount.name}` : ""}
        </div>
        <span
          className={`inline-flex shrink-0 items-center gap-1.5 justify-self-start rounded-full px-2.5 py-0.5 text-label-sm sm:justify-self-end ${resultBadgeClasses(entry.action)}`}
        >
          {isSuccessTone && <span className="h-1.5 w-1.5 rounded-full bg-success" aria-hidden="true" />}
          {resultLabel(entry.action)}
        </span>
      </button>

      {expanded && (
        <div className="border-t border-outline-variant/40 p-4">
          <DetailsDrawer entry={entry} externalUserId={externalUserId} />
        </div>
      )}
    </div>
  );
}

function DetailsDrawer({ entry, externalUserId }: { entry: AuditLogEntry; externalUserId: string | null }) {
  const [trail, setTrail] = useState<AuditLogEntry[] | null>(null);
  const [loadingTrail, setLoadingTrail] = useState(false);
  const [trailError, setTrailError] = useState<string | null>(null);

  const loadTrail = async () => {
    setLoadingTrail(true);
    setTrailError(null);
    try {
      const result = await getTransactionAuditTrail(externalUserId, entry.targetId);
      setTrail(result);
    } catch (err) {
      setTrailError(err instanceof ApiError ? err.message : "โหลดประวัติรายการไม่สำเร็จ");
    } finally {
      setLoadingTrail(false);
    }
  };

  return (
    <div className="space-y-3 text-body-md">
      <dl className="grid grid-cols-1 gap-2 sm:grid-cols-2">
        <div>
          <dt className="text-caption text-on-surface-variant">IP Address</dt>
          <dd className="font-mono text-on-surface">{entry.ipAddress ?? "—"}</dd>
        </div>
        <div>
          <dt className="text-caption text-on-surface-variant">User Agent</dt>
          <dd className="truncate font-mono text-on-surface" title={entry.userAgent ?? undefined}>
            {entry.userAgent ?? "—"}
          </dd>
        </div>
      </dl>

      <JsonBlock label="ก่อนดำเนินการ (before)" value={entry.beforeJson} />
      <JsonBlock label="หลังดำเนินการ (after)" value={entry.afterJson} />
      <JsonBlock label="ข้อมูลเพิ่มเติม (metadata)" value={entry.metadataJson} />

      {entry.targetType === "Transaction" && (
        <div>
          {trail === null && (
            <button type="button" onClick={loadTrail} disabled={loadingTrail} className={secondaryButtonClass}>
              {loadingTrail ? "กำลังโหลด..." : "ดูประวัติทั้งหมดของรายการนี้"}
            </button>
          )}
          {trailError && <p className="mt-2 text-caption text-error">{trailError}</p>}
          {trail !== null && (
            <div className="mt-2 space-y-2 border-t border-outline-variant/40 pt-2">
              <p className="text-caption font-semibold text-on-surface">
                ประวัติทั้งหมดของรายการ ({trail.length} เหตุการณ์)
              </p>
              {trail.map((t) => (
                <div key={t.id} className="rounded-lg border border-outline-variant/40 bg-surface-container-low p-2 text-caption">
                  <span className="text-on-surface-variant">{dateTimeFmt.format(new Date(t.createdAt))}</span>{" "}
                  <span className="font-medium text-on-surface">{actionLabel(t.action)}</span>{" "}
                  <span className="text-on-surface-variant">
                    — {t.actor ? `${t.actor.displayName} (${t.actor.externalUserId})` : "ระบบ"}
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function JsonBlock({ label, value }: { label: string; value: unknown }) {
  if (value === null || value === undefined) return null;
  return (
    <div>
      <p className="mb-1 text-caption font-semibold text-on-surface">{label}</p>
      <pre className="overflow-x-auto rounded-lg bg-surface-container-low p-2 font-mono text-caption text-on-surface-variant">
        {JSON.stringify(value, null, 2)}
      </pre>
    </div>
  );
}
