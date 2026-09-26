"use client";

import { useEffect, useState } from "react";
import { useDevAuth } from "@/lib/dev-auth";
import {
  ApiError,
  listAuditLogs,
  listYearAccounts,
  type AuditLogListResponse,
  type YearAccountListItem,
} from "@/lib/api";
import { AuditLogRow } from "@/components/AuditLogRow";

// ============================================================================
// Audit Log Viewer — Branch Head only (backend's permission-matrix.ts:
// viewFullAuditLog is ✗ for Student, denied-by-default for Treasurer
// ["limited scoped" is an unresolved ASSUMPTION, never implemented], ✓ for
// Branch Head only). GET /audit-logs itself 403s for any other role, so
// this page role-gates the same way expenses/page.tsx and
// approvals/page.tsx do for their respective roles.
//
// Only the two known, documented actions from this codebase are offered
// as filter options (see audit.record() call sites across
// transactions/approvals/evidence/year-accounts services) — not a
// made-up list.
// ============================================================================

const PAGE_SIZE = 20;

const KNOWN_ACTIONS = [
  "EXPENSE_CREATED",
  "EXPENSE_UPDATED",
  "UPLOAD_BILL",
  "TRANSACTION_APPROVED",
  "TRANSACTION_REJECTED",
  "VOID_TRANSACTION",
  "INCOME_CONFIRMED",
  "EXPENSE_CANCELLED",
  "ADVANCE_ACADEMIC_YEAR",
] as const;

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

export default function AuditLogsPage() {
  const { externalUserId, role } = useDevAuth();

  const [yearAccounts, setYearAccounts] = useState<YearAccountListItem[]>([]);
  const [yearFilter, setYearFilter] = useState<string>("ALL");
  const [actionFilter, setActionFilter] = useState<string>("ALL");
  const [page, setPage] = useState(1);

  const [logList, setLogList] = useState<AuditLogListResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!externalUserId || role !== "BRANCH_HEAD") return;
    listYearAccounts(externalUserId)
      .then(setYearAccounts)
      .catch(() => {
        // Non-fatal: the year filter just won't have options if this fails;
        // the audit log itself can still load without it.
      });
  }, [externalUserId, role]);

  useEffect(() => {
    setPage(1);
  }, [yearFilter, actionFilter]);

  useEffect(() => {
    if (!externalUserId || role !== "BRANCH_HEAD") return;

    let cancelled = false;
    setLoading(true);
    setError(null);

    listAuditLogs(externalUserId, {
      yearAccountId: yearFilter === "ALL" ? undefined : yearFilter,
      action: actionFilter === "ALL" ? undefined : actionFilter,
      page,
      pageSize: PAGE_SIZE,
    })
      .then((result) => {
        if (!cancelled) setLogList(result);
      })
      .catch((err) => {
        if (!cancelled) setError(err instanceof ApiError ? err.message : "โหลดรายการตรวจสอบไม่สำเร็จ");
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [externalUserId, role, yearFilter, actionFilter, page]);

  if (!externalUserId) {
    return (
      <main className="mx-auto max-w-4xl p-6">
        <p className="text-inkFaint">เลือกผู้ใช้งานจากแถบด้านบนเพื่อเข้าสู่ระบบ (dev only)</p>
      </main>
    );
  }

  if (role !== "BRANCH_HEAD") {
    return (
      <main className="mx-auto max-w-4xl p-6">
        <p className="text-inkFaint">
          หน้านี้สำหรับหัวหน้าสาขาเท่านั้น (ผู้ใช้ปัจจุบันมีบทบาท {role ?? "ไม่ทราบ"})
        </p>
      </main>
    );
  }

  const totalPages = logList ? Math.max(1, Math.ceil(logList.total / PAGE_SIZE)) : 1;

  return (
    <main className="mx-auto max-w-4xl p-6">
      <h1 className="mb-1 font-display text-2xl font-semibold text-ink">ประวัติการตรวจสอบ (Audit Log)</h1>
      <p className="mb-6 text-sm text-inkFaint">บันทึกการกระทำทั้งหมดในระบบ สำหรับหัวหน้าสาขาเท่านั้น</p>

      {error && <div className="mb-6 rounded-passbook border-2 border-rust bg-rustSoft p-4 text-rust">{error}</div>}

      <div className="mb-4 flex flex-wrap gap-3">
        <label className="text-sm text-inkFaint">
          ชั้นปี
          <select
            value={yearFilter}
            onChange={(e) => setYearFilter(e.target.value)}
            className="ml-2 rounded border border-paperLine bg-white px-2 py-1 text-ink"
          >
            <option value="ALL">ทั้งหมด</option>
            {yearAccounts.map((a) => (
              <option key={a.id} value={a.id}>
                {a.name}
              </option>
            ))}
          </select>
        </label>
        <label className="text-sm text-inkFaint">
          ประเภทเหตุการณ์
          <select
            value={actionFilter}
            onChange={(e) => setActionFilter(e.target.value)}
            className="ml-2 rounded border border-paperLine bg-white px-2 py-1 text-ink"
          >
            <option value="ALL">ทั้งหมด</option>
            {KNOWN_ACTIONS.map((a) => (
              <option key={a} value={a}>
                {ACTION_LABEL_TH[a]}
              </option>
            ))}
          </select>
        </label>
      </div>

      {loading && <p className="text-inkFaint">กำลังโหลด...</p>}

      {!loading && logList && (
        <>
          <div className="space-y-3">
            {logList.items.length === 0 ? (
              <p className="text-inkFaint">ไม่พบบันทึกตามเงื่อนไขที่เลือก</p>
            ) : (
              logList.items.map((entry) => (
                <AuditLogRow key={entry.id} entry={entry} externalUserId={externalUserId} />
              ))
            )}
          </div>

          {logList.total > PAGE_SIZE && (
            <div className="mt-4 flex items-center justify-between text-sm text-inkFaint">
              <button
                onClick={() => setPage((p) => Math.max(1, p - 1))}
                disabled={page <= 1}
                className="rounded-full border border-paperLine px-3 py-1 disabled:opacity-40"
              >
                ก่อนหน้า
              </button>
              <span>
                หน้า {page} / {totalPages} (ทั้งหมด {logList.total} รายการ)
              </span>
              <button
                onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                disabled={page >= totalPages}
                className="rounded-full border border-paperLine px-3 py-1 disabled:opacity-40"
              >
                ถัดไป
              </button>
            </div>
          )}
        </>
      )}
    </main>
  );
}
