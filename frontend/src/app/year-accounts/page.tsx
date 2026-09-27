"use client";

import { useEffect, useMemo, useState } from "react";
import { useDevAuth } from "@/lib/dev-auth";
import {
  ApiError,
  getMe,
  getYearAccountSummary,
  listTransactions,
  listYearAccounts,
  type MeResponse,
  type Transaction,
  type TransactionListResponse,
  type TransactionStatus,
  type TransactionType,
  type YearAccountListItem,
  type YearAccountSummary,
} from "@/lib/api";
import { TransactionRow } from "@/components/TransactionRow";

// ============================================================================
// "Year Account Detail": balance summary + transaction table + filters +
// evidence viewing, open to all three roles (Requirements doc Section 21
// lists "Year Account Overview"/"Transaction List"/"Transaction Detail" as
// separate screens for Students, and "Branch Overview"/"Year Comparison"
// for Branch Head; this page combines that into one browsable screen per
// the project's own instruction to build "ยอด+ตาราง transaction+filter+
// evidence view สำหรับทุกรole").
//
// Filters implemented here (type, status, pagination) are exactly what
// transactions.controller.ts's ListTransactionsQueryDto supports today.
// Section 20 also asks for date-range filtering and search-by-reference,
// but the backend query DTO has no such fields yet — adding fake controls
// that don't actually filter anything would be misleading, so those two
// are left out until the backend supports them.
//
// Year-account access: GET /year-accounts and its /summary are unscoped
// for all roles (year-accounts.controller.ts), but GET /transactions
// scopes TREASURER to only their own active year(s) — requesting another
// year 403s for that role (transactions.service.ts#list). So the year
// selector below is restricted to the Treasurer's own assigned year(s)
// when the signed-in role is TREASURER, and shows the full branch-wide
// list for STUDENT/BRANCH_HEAD.
// ============================================================================

const PAGE_SIZE = 20;

const thb = new Intl.NumberFormat("th-TH", { style: "currency", currency: "THB" });

export default function YearAccountsPage() {
  const { externalUserId, role } = useDevAuth();

  const [me, setMe] = useState<MeResponse | null>(null);
  const [allYearAccounts, setAllYearAccounts] = useState<YearAccountListItem[]>([]);
  const [selectedYearAccountId, setSelectedYearAccountId] = useState<string | null>(null);
  const [summary, setSummary] = useState<YearAccountSummary | null>(null);
  const [transactionList, setTransactionList] = useState<TransactionListResponse | null>(null);

  const [typeFilter, setTypeFilter] = useState<TransactionType | "ALL">("ALL");
  const [statusFilter, setStatusFilter] = useState<TransactionStatus | "ALL">("ALL");
  const [page, setPage] = useState(1);

  const [loadingAccounts, setLoadingAccounts] = useState(false);
  const [loadingDetail, setLoadingDetail] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Which year accounts this role is allowed to browse transactions for.
  const availableYearAccounts = useMemo(() => {
    if (role === "TREASURER") {
      const ownIds = new Set((me?.activeYearAssignments ?? []).map((a) => a.yearAccountId));
      return allYearAccounts.filter((a) => ownIds.has(a.id));
    }
    return allYearAccounts;
  }, [allYearAccounts, me, role]);

  // Initial load: who am I (for Treasurer scoping) + the full year-account list.
  useEffect(() => {
    if (!externalUserId) return;

    let cancelled = false;
    setLoadingAccounts(true);
    setError(null);

    async function load() {
      try {
        const [meResponse, accounts] = await Promise.all([
          getMe(externalUserId),
          listYearAccounts(externalUserId),
        ]);
        if (cancelled) return;
        setMe(meResponse);
        setAllYearAccounts(accounts);
      } catch (err) {
        if (cancelled) return;
        setError(err instanceof ApiError ? err.message : "โหลดรายชื่อบัญชีชั้นปีไม่สำเร็จ");
      } finally {
        if (!cancelled) setLoadingAccounts(false);
      }
    }

    load();
    return () => {
      cancelled = true;
    };
  }, [externalUserId]);

  // Default the selection to the first year account this role can see,
  // once that list is known (and re-pick if the current selection falls
  // out of scope, e.g. a Treasurer whose assignment doesn't match).
  useEffect(() => {
    if (availableYearAccounts.length === 0) {
      setSelectedYearAccountId(null);
      return;
    }
    if (!selectedYearAccountId || !availableYearAccounts.some((a) => a.id === selectedYearAccountId)) {
      setSelectedYearAccountId(availableYearAccounts[0].id);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [availableYearAccounts]);

  // Reset to page 1 whenever the year/filters change, so a stale page
  // number from a previous, longer list doesn't request an out-of-range page.
  useEffect(() => {
    setPage(1);
  }, [selectedYearAccountId, typeFilter, statusFilter]);

  // Load the summary + transaction page for the current selection/filters.
  useEffect(() => {
    if (!externalUserId || !selectedYearAccountId) return;

    let cancelled = false;
    setLoadingDetail(true);
    setError(null);

    async function load() {
      try {
        const [summaryResult, listResult] = await Promise.all([
          getYearAccountSummary(externalUserId, selectedYearAccountId!),
          listTransactions(externalUserId, {
            yearAccountId: selectedYearAccountId!,
            type: typeFilter === "ALL" ? undefined : typeFilter,
            status: statusFilter === "ALL" ? undefined : statusFilter,
            page,
            pageSize: PAGE_SIZE,
          }),
        ]);
        if (cancelled) return;
        setSummary(summaryResult);
        setTransactionList(listResult);
      } catch (err) {
        if (cancelled) return;
        setError(err instanceof ApiError ? err.message : "โหลดข้อมูลบัญชีชั้นปีไม่สำเร็จ");
      } finally {
        if (!cancelled) setLoadingDetail(false);
      }
    }

    load();
    return () => {
      cancelled = true;
    };
  }, [externalUserId, selectedYearAccountId, typeFilter, statusFilter, page]);

  if (!externalUserId) {
    return (
      <main className="mx-auto max-w-4xl p-6">
        <p className="text-inkFaint">เลือกผู้ใช้งานจากแถบด้านบนเพื่อเข้าสู่ระบบ (dev only)</p>
      </main>
    );
  }

  const totalPages = transactionList ? Math.max(1, Math.ceil(transactionList.total / PAGE_SIZE)) : 1;

  return (
    <main className="mx-auto max-w-4xl p-6">
      <h1 className="mb-1 font-display text-2xl font-semibold text-ink">รายละเอียดบัญชีชั้นปี</h1>
      <p className="mb-6 text-sm text-inkFaint">ยอดคงเหลือ รายการธุรกรรม และหลักฐานประกอบของแต่ละชั้นปี</p>

      {error && <div className="mb-6 rounded-passbook border-2 border-rust bg-rustSoft p-4 text-rust">{error}</div>}

      {loadingAccounts && <p className="text-inkFaint">กำลังโหลดรายชื่อบัญชี...</p>}

      {!loadingAccounts && availableYearAccounts.length === 0 && (
        <p className="rounded-passbook border-2 border-brass bg-brassSoft p-4 text-brass">
          {role === "TREASURER"
            ? "บัญชีนี้ยังไม่ได้รับมอบหมายให้ดูแลชั้นปีใด — ติดต่อหัวหน้าสาขา"
            : "ยังไม่มีบัญชีชั้นปีในระบบ"}
        </p>
      )}

      {availableYearAccounts.length > 0 && (
        <>
          <label className="mb-4 block text-sm text-inkFaint">
            เลือกชั้นปี
            <select
              value={selectedYearAccountId ?? ""}
              onChange={(e) => setSelectedYearAccountId(e.target.value)}
              className="mt-1 block w-full rounded border border-paperLine bg-white px-2 py-1.5 text-ink sm:w-auto"
            >
              {availableYearAccounts.map((a) => (
                <option key={a.id} value={a.id}>
                  {a.name} (ปี {a.yearLevel})
                </option>
              ))}
            </select>
          </label>

          {summary && (
            <section className="mb-6 rounded-passbook border-2 border-paperLine bg-white p-5 shadow-sm">
              <p className="font-mono text-3xl font-semibold text-ink">{thb.format(summary.balance)}</p>
              <p className="mb-3 text-xs text-inkFaint">ยอดคงเหลือ (อนุมัติแล้ว)</p>

              {summary.pendingExpenseTotal > 0 && (
                <p className="mb-3 rounded-full bg-brassSoft px-3 py-1 text-xs text-brass">
                  มีคำขอเบิกรออนุมัติรวม {thb.format(summary.pendingExpenseTotal)} (ยังไม่หักจากยอดนี้)
                </p>
              )}

              <dl className="grid grid-cols-2 gap-2 border-t border-paperLine pt-3 text-sm sm:grid-cols-4">
                <div>
                  <dt className="text-inkFaint">ยอดยกมา</dt>
                  <dd className="font-mono text-ink">{thb.format(summary.openingBalance)}</dd>
                </div>
                <div>
                  <dt className="text-inkFaint">เงินเข้า (อนุมัติแล้ว)</dt>
                  <dd className="font-mono text-jade">{thb.format(summary.approvedIncome)}</dd>
                </div>
                <div>
                  <dt className="text-inkFaint">เงินออก (อนุมัติแล้ว)</dt>
                  <dd className="font-mono text-rust">{thb.format(summary.approvedExpense)}</dd>
                </div>
                <div>
                  <dt className="text-inkFaint">สกุลเงิน</dt>
                  <dd className="font-mono text-ink">{summary.currency}</dd>
                </div>
              </dl>
            </section>
          )}

          <div className="mb-4 flex flex-wrap gap-3">
            <label className="text-sm text-inkFaint">
              ประเภท
              <select
                value={typeFilter}
                onChange={(e) => setTypeFilter(e.target.value as TransactionType | "ALL")}
                className="ml-2 rounded border border-paperLine bg-white px-2 py-1 text-ink"
              >
                <option value="ALL">ทั้งหมด</option>
                <option value="INCOME">รายรับ</option>
                <option value="EXPENSE">รายจ่าย</option>
                <option value="ADJUSTMENT">รายการปรับปรุง</option>
              </select>
            </label>
            <label className="text-sm text-inkFaint">
              สถานะ
              <select
                value={statusFilter}
                onChange={(e) => setStatusFilter(e.target.value as TransactionStatus | "ALL")}
                className="ml-2 rounded border border-paperLine bg-white px-2 py-1 text-ink"
              >
                <option value="ALL">ทั้งหมด</option>
                <option value="PENDING">รออนุมัติ</option>
                <option value="NEEDS_REVIEW">รอตรวจสอบ</option>
                <option value="APPROVED">อนุมัติแล้ว</option>
                <option value="REJECTED">ถูกปฏิเสธ</option>
                <option value="VOIDED">ถูกยกเลิก (โดยหัวหน้าสาขา)</option>
                <option value="CANCELLED">ยกเลิกโดยผู้สร้างรายการ</option>
              </select>
            </label>
          </div>

          {loadingDetail && <p className="text-inkFaint">กำลังโหลดรายการ...</p>}

          {!loadingDetail && transactionList && (
            <>
              <div className="space-y-3">
                {transactionList.items.length === 0 ? (
                  <p className="text-inkFaint">ไม่พบรายการตามเงื่อนไขที่เลือก</p>
                ) : (
                  transactionList.items.map((t: Transaction) => (
                    <TransactionRow
                      key={t.id}
                      transaction={t}
                      externalUserId={externalUserId}
                      currentUserId={me?.id}
                      role={role ?? undefined}
                    />
                  ))
                )}
              </div>

              {transactionList.total > PAGE_SIZE && (
                <div className="mt-4 flex items-center justify-between text-sm text-inkFaint">
                  <button
                    onClick={() => setPage((p) => Math.max(1, p - 1))}
                    disabled={page <= 1}
                    className="rounded-full border border-paperLine px-3 py-1 disabled:opacity-40"
                  >
                    ก่อนหน้า
                  </button>
                  <span>
                    หน้า {page} / {totalPages} (ทั้งหมด {transactionList.total} รายการ)
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
        </>
      )}
    </main>
  );
}
