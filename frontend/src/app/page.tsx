"use client";

import { useEffect, useState } from "react";
import { useDevAuth } from "@/lib/dev-auth";
import {
  ApiError,
  getYearAccountSummary,
  listPendingApprovals,
  listYearAccounts,
  type PendingApprovalItem,
  type YearAccountListItem,
  type YearAccountSummary,
} from "@/lib/api";

const thb = new Intl.NumberFormat("th-TH", { style: "currency", currency: "THB" });

export default function DashboardPage() {
  const { externalUserId, role } = useDevAuth();

  const [yearAccounts, setYearAccounts] = useState<YearAccountListItem[]>([]);
  const [summaries, setSummaries] = useState<Record<string, YearAccountSummary>>({});
  const [pendingApprovals, setPendingApprovals] = useState<PendingApprovalItem[] | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!externalUserId) return;

    let cancelled = false;
    setLoading(true);
    setError(null);

    async function load() {
      try {
        const accounts = await listYearAccounts(externalUserId);
        if (cancelled) return;
        setYearAccounts(accounts);

        // Fetch each year's summary in parallel — this is a small,
        // fixed number of year accounts (4 active cohorts at most), so
        // N parallel requests is fine; this would need pagination/
        // batching if the branch ever had many more concurrent cohorts.
        const summaryEntries = await Promise.all(
          accounts.map(async (account) => {
            const summary = await getYearAccountSummary(externalUserId, account.id);
            return [account.id, summary] as const;
          }),
        );
        if (cancelled) return;
        setSummaries(Object.fromEntries(summaryEntries));

        // Pending-approvals queue is Branch Head only (backend 403s
        // otherwise) — only fetch it for that role rather than firing a
        // request guaranteed to fail for everyone else.
        if (role === "BRANCH_HEAD") {
          const pending = await listPendingApprovals(externalUserId);
          if (!cancelled) setPendingApprovals(pending);
        } else {
          setPendingApprovals(null);
        }
      } catch (err) {
        if (cancelled) return;
        setError(err instanceof ApiError ? err.message : "Failed to load dashboard data.");
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    load();
    return () => {
      cancelled = true;
    };
  }, [externalUserId, role]);

  if (!externalUserId) {
    return (
      <main className="mx-auto max-w-5xl p-6">
        <p className="text-inkFaint">เลือกผู้ใช้งานจากแถบด้านบนเพื่อเข้าสู่ระบบ (dev only)</p>
      </main>
    );
  }

  return (
    <main className="mx-auto max-w-5xl p-6">
      <h1 className="mb-1 font-display text-2xl font-semibold text-ink">
        CSMJU Branch Finance — ภาพรวม
      </h1>
      <p className="mb-6 text-sm text-inkFaint">
        ระบบตรวจสอบและความโปร่งใสทางการเงินของสาขา CSMJU
      </p>

      {role === "BRANCH_HEAD" && (
        <section className="mb-6 rounded-passbook border-2 border-brass bg-brassSoft p-4">
          <h2 className="font-semibold text-ink">รายการรออนุมัติ</h2>
          {pendingApprovals === null ? (
            <p className="text-sm text-inkFaint">กำลังโหลด...</p>
          ) : pendingApprovals.length === 0 ? (
            <p className="text-sm text-inkFaint">ไม่มีรายการรออนุมัติ</p>
          ) : (
            <p className="text-sm text-ink">
              มี <span className="font-mono font-semibold">{pendingApprovals.length}</span>{" "}
              รายการรอดำเนินการ (ค่าใช้จ่ายรออนุมัติ / เงินเข้ารอยืนยัน)
            </p>
          )}
        </section>
      )}

      {error && (
        <div className="mb-6 rounded-passbook border-2 border-rust bg-rustSoft p-4 text-rust">
          {error}
        </div>
      )}

      {loading && yearAccounts.length === 0 && (
        <p className="text-inkFaint">กำลังโหลดข้อมูล...</p>
      )}

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        {yearAccounts.map((account) => (
          <YearAccountCard key={account.id} account={account} summary={summaries[account.id]} />
        ))}
      </div>
    </main>
  );
}

function YearAccountCard({
  account,
  summary,
}: {
  account: YearAccountListItem;
  summary: YearAccountSummary | undefined;
}) {
  return (
    <div className="rounded-passbook border-2 border-paperLine bg-white p-5 shadow-sm">
      <div className="mb-3 flex items-baseline justify-between">
        <h3 className="font-display text-lg font-semibold text-ink">{account.name}</h3>
        <span className="rounded-full bg-jadeSoft px-2 py-0.5 text-xs font-medium text-jade">
          ปี {account.yearLevel}
        </span>
      </div>

      {!summary ? (
        <p className="text-sm text-inkFaint">กำลังโหลดยอด...</p>
      ) : (
        <>
          <p className="font-mono text-3xl font-semibold text-ink">
            {thb.format(summary.balance)}
          </p>
          <p className="mb-3 text-xs text-inkFaint">ยอดคงเหลือ (อนุมัติแล้ว)</p>

          {summary.pendingExpenseTotal > 0 && (
            <p className="mb-3 rounded-full bg-brassSoft px-3 py-1 text-xs text-brass">
              มีคำขอเบิกรออนุมัติรวม {thb.format(summary.pendingExpenseTotal)} (ยังไม่หักจากยอดนี้)
            </p>
          )}

          <dl className="grid grid-cols-2 gap-2 border-t border-paperLine pt-3 text-sm">
            <div>
              <dt className="text-inkFaint">เงินเข้า (อนุมัติแล้ว)</dt>
              <dd className="font-mono text-jade">{thb.format(summary.approvedIncome)}</dd>
            </div>
            <div>
              <dt className="text-inkFaint">เงินออก (อนุมัติแล้ว)</dt>
              <dd className="font-mono text-rust">{thb.format(summary.approvedExpense)}</dd>
            </div>
          </dl>
        </>
      )}
    </div>
  );
}
