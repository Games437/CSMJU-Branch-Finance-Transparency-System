"use client";

import { useState } from "react";
import { ApiError, getTransactionAuditTrail, type AuditLogEntry } from "@/lib/api";

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
// rejected/voided), the same jade/rust color convention used everywhere
// else in this app for status — not invented pass/fail data.
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
    return "bg-rustSoft text-rust";
  }
  return "bg-jadeSoft text-jade";
}

function resultLabel(action: string): string {
  if (action === "TRANSACTION_REJECTED") return "ปฏิเสธ";
  if (action === "VOID_TRANSACTION") return "ยกเลิก (หัวหน้าสาขา)";
  if (action === "EXPENSE_CANCELLED") return "ยกเลิก (ผู้สร้าง)";
  return "สำเร็จ";
}

interface Props {
  entry: AuditLogEntry;
  externalUserId: string;
}

export function AuditLogRow({ entry, externalUserId }: Props) {
  const [expanded, setExpanded] = useState(false);

  return (
    <div className="rounded-passbook border-2 border-paperLine bg-white">
      <button
        onClick={() => setExpanded((e) => !e)}
        className="grid w-full grid-cols-1 gap-1 p-4 text-left sm:grid-cols-[1fr_1fr_1fr_auto] sm:items-center sm:gap-3"
      >
        <div>
          <p className="text-xs text-inkFaint">{dateTimeFmt.format(new Date(entry.createdAt))}</p>
          <p className="font-medium text-ink">{actionLabel(entry.action)}</p>
        </div>
        <div className="text-sm text-inkFaint">
          ผู้กระทำ: {entry.actor ? `${entry.actor.displayName} (${entry.actor.externalUserId})` : "ระบบ"}
        </div>
        <div className="text-sm text-inkFaint">
          {entry.targetType} · {entry.targetId.slice(0, 8)}…
          {entry.yearAccount ? ` · ${entry.yearAccount.name}` : ""}
        </div>
        <span className={`shrink-0 justify-self-start rounded-full px-2 py-0.5 text-xs font-medium sm:justify-self-end ${resultBadgeClasses(entry.action)}`}>
          {resultLabel(entry.action)}
        </span>
      </button>

      {expanded && (
        <div className="border-t border-paperLine p-4">
          <DetailsDrawer entry={entry} externalUserId={externalUserId} />
        </div>
      )}
    </div>
  );
}

function DetailsDrawer({ entry, externalUserId }: { entry: AuditLogEntry; externalUserId: string }) {
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
    <div className="space-y-3 text-sm">
      <dl className="grid grid-cols-1 gap-2 sm:grid-cols-2">
        <div>
          <dt className="text-xs text-inkFaint">IP Address</dt>
          <dd className="font-mono text-ink">{entry.ipAddress ?? "—"}</dd>
        </div>
        <div>
          <dt className="text-xs text-inkFaint">User Agent</dt>
          <dd className="truncate font-mono text-ink" title={entry.userAgent ?? undefined}>
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
            <button
              onClick={loadTrail}
              disabled={loadingTrail}
              className="rounded-full border border-jade px-3 py-1 text-xs text-jade hover:bg-jadeSoft disabled:opacity-50"
            >
              {loadingTrail ? "กำลังโหลด..." : "ดูประวัติทั้งหมดของรายการนี้"}
            </button>
          )}
          {trailError && <p className="mt-2 text-xs text-rust">{trailError}</p>}
          {trail !== null && (
            <div className="mt-2 space-y-2 border-t border-paperLine pt-2">
              <p className="text-xs font-semibold text-ink">
                ประวัติทั้งหมดของรายการ ({trail.length} เหตุการณ์)
              </p>
              {trail.map((t) => (
                <div key={t.id} className="rounded border border-paperLine bg-paper p-2 text-xs">
                  <span className="text-inkFaint">{dateTimeFmt.format(new Date(t.createdAt))}</span>{" "}
                  <span className="font-medium text-ink">{actionLabel(t.action)}</span>{" "}
                  <span className="text-inkFaint">
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
      <p className="mb-1 text-xs font-semibold text-ink">{label}</p>
      <pre className="overflow-x-auto rounded bg-paper p-2 font-mono text-xs text-inkFaint">
        {JSON.stringify(value, null, 2)}
      </pre>
    </div>
  );
}
