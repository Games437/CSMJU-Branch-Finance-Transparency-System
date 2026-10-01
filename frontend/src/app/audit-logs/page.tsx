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
import { PageHeader } from "@/components/csmju/PageHeader";
import { EmptyState } from "@/components/csmju/EmptyState";
import { SkeletonRows } from "@/components/csmju/Skeleton";
import { alertClasses, inputClass, labelClass, secondaryButtonClass } from "@/components/csmju/ui";

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
      <EmptyState title="เลือกผู้ใช้งานจากเมนูด้านข้างเพื่อเข้าสู่ระบบ" description="(dev only)" />
    );
  }

  if (role !== "BRANCH_HEAD") {
    return (
      <EmptyState
        title="หน้านี้สำหรับหัวหน้าสาขาเท่านั้น"
        description={`ผู้ใช้ปัจจุบันมีบทบาท ${role ?? "ไม่ทราบ"}`}
      />
    );
  }

  const totalPages = logList ? Math.max(1, Math.ceil(logList.total / PAGE_SIZE)) : 1;
  const hasFilters = yearFilter !== "ALL" || actionFilter !== "ALL";

  return (
    <>
      <PageHeader title="ประวัติการตรวจสอบ (Audit Log)" description="บันทึกการกระทำทั้งหมดในระบบ สำหรับหัวหน้าสาขาเท่านั้น" />

      {error && <div className={alertClasses.error}>{error}</div>}

      <div className="flex flex-wrap gap-4">
        <label>
          <span className={labelClass}>ชั้นปี</span>
          <select
            value={yearFilter}
            onChange={(e) => setYearFilter(e.target.value)}
            className={`${inputClass} w-auto`}
          >
            <option value="ALL">ทั้งหมด</option>
            {yearAccounts.map((a) => (
              <option key={a.id} value={a.id}>
                {a.name}
              </option>
            ))}
          </select>
        </label>
        <label>
          <span className={labelClass}>ประเภทเหตุการณ์</span>
          <select
            value={actionFilter}
            onChange={(e) => setActionFilter(e.target.value)}
            className={`${inputClass} w-auto`}
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

      {loading && <SkeletonRows count={5} />}

      {!loading && logList && (
        <>
          <div className="space-y-3">
            {logList.items.length === 0 ? (
              <EmptyState
                title={hasFilters ? "ไม่พบบันทึกตามเงื่อนไขที่เลือก" : "ยังไม่มีบันทึกในระบบ"}
                description={hasFilters ? "ลองเปลี่ยนตัวกรองด้านบน" : undefined}
              />
            ) : (
              logList.items.map((entry) => (
                <AuditLogRow key={entry.id} entry={entry} externalUserId={externalUserId} />
              ))
            )}
          </div>

          {logList.total > PAGE_SIZE && (
            <div className="flex items-center justify-between text-body-md text-on-surface-variant">
              <button
                onClick={() => setPage((p) => Math.max(1, p - 1))}
                disabled={page <= 1}
                className={secondaryButtonClass}
              >
                ก่อนหน้า
              </button>
              <span className="tabular-nums">
                หน้า {page} / {totalPages} (ทั้งหมด {logList.total} รายการ)
              </span>
              <button
                onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                disabled={page >= totalPages}
                className={secondaryButtonClass}
              >
                ถัดไป
              </button>
            </div>
          )}
        </>
      )}
    </>
  );
}
