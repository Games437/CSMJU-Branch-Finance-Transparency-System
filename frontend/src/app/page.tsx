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
import { PageHeader } from "@/components/csmju/PageHeader";
import { EmptyState } from "@/components/csmju/EmptyState";
import { Skeleton, SkeletonCard } from "@/components/csmju/Skeleton";
import { alertClasses, cardClass } from "@/components/csmju/ui";

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
      <EmptyState title="เลือกผู้ใช้งานจากเมนูด้านข้างเพื่อเข้าสู่ระบบ" description="(dev only)" />
    );
  }

  return (
    <>
      <PageHeader
        title="ภาพรวม"
        description="ระบบตรวจสอบและความโปร่งใสทางการเงินของสาขา CSMJU"
      />

      {role === "BRANCH_HEAD" && (
        <section className={`${cardClass} p-5`}>
          <h2 className="mb-2 text-headline-md font-display text-on-surface">รายการรออนุมัติ</h2>
          {pendingApprovals === null ? (
            <p className="text-body-md text-on-surface-variant">กำลังโหลด...</p>
          ) : pendingApprovals.length === 0 ? (
            <p className="text-body-md text-on-surface-variant">ไม่มีรายการรออนุมัติ</p>
          ) : (
            <p className="text-body-md text-on-surface">
              มี <span className="tabular-nums font-semibold text-primary-container">{pendingApprovals.length}</span>{" "}
              รายการรอดำเนินการ (ค่าใช้จ่ายรออนุมัติ / เงินเข้ารอยืนยัน)
            </p>
          )}
        </section>
      )}

      {error && <div className={alertClasses.error}>{error}</div>}

      {loading && yearAccounts.length === 0 && (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <SkeletonCard />
          <SkeletonCard />
        </div>
      )}

      {!loading && yearAccounts.length === 0 && !error && (
        <EmptyState title="ยังไม่มีบัญชีชั้นปีในระบบ" description="ยังไม่มีข้อมูลให้แสดงในขณะนี้" />
      )}

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        {yearAccounts.map((account) => (
          <YearAccountCard key={account.id} account={account} summary={summaries[account.id]} />
        ))}
      </div>
    </>
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
    <div className={`${cardClass} p-5`}>
      <div className="mb-3 flex items-baseline justify-between">
        <h3 className="font-display text-headline-md text-on-surface">{account.name}</h3>
        <span className="rounded-full bg-primary-container/10 px-2 py-0.5 text-label-sm text-primary-container">
          ปี {account.yearLevel}
        </span>
      </div>

      {!summary ? (
        <div className="space-y-2">
          <Skeleton className="h-9 w-40" />
          <Skeleton className="h-3 w-24" />
        </div>
      ) : (
        <>
          <p className="tabular-nums font-display text-display-lg text-on-surface">
            {thb.format(summary.balance)}
          </p>
          <p className="mb-3 text-caption text-on-surface-variant">ยอดคงเหลือ (อนุมัติแล้ว)</p>

          {summary.pendingExpenseTotal > 0 && (
            <p className="mb-3 rounded-full bg-brand-amber/10 px-3 py-1 text-label-sm text-amber-700">
              มีคำขอเบิกรออนุมัติรวม {thb.format(summary.pendingExpenseTotal)} (ยังไม่หักจากยอดนี้)
            </p>
          )}

          <dl className="grid grid-cols-2 gap-2 border-t border-outline-variant/40 pt-3 text-body-md">
            <div>
              <dt className="text-caption text-on-surface-variant">เงินเข้า (อนุมัติแล้ว)</dt>
              <dd className="tabular-nums text-emerald-700">{thb.format(summary.approvedIncome)}</dd>
            </div>
            <div>
              <dt className="text-caption text-on-surface-variant">เงินออก (อนุมัติแล้ว)</dt>
              <dd className="tabular-nums text-error">{thb.format(summary.approvedExpense)}</dd>
            </div>
          </dl>
        </>
      )}
    </div>
  );
}
