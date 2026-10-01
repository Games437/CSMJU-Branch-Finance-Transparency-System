"use client";

import { useCallback, useEffect, useState } from "react";
import { useDevAuth } from "@/lib/dev-auth";
import { ApiError, getMe, listTransactions, type MeResponse, type Transaction } from "@/lib/api";
import { CreateExpenseForm } from "@/components/CreateExpenseForm";
import { ExpenseRow } from "@/components/ExpenseRow";
import { PageHeader } from "@/components/csmju/PageHeader";
import { EmptyState } from "@/components/csmju/EmptyState";
import { SkeletonRows } from "@/components/csmju/Skeleton";
import { alertClasses } from "@/components/csmju/ui";

export default function ExpensesPage() {
  const { externalUserId, role } = useDevAuth();
  const [me, setMe] = useState<MeResponse | null>(null);
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const yearAccountId = me?.activeYearAssignments[0]?.yearAccountId ?? null;

  const loadTransactions = useCallback(
    async (yid: string) => {
      try {
        const result = await listTransactions(externalUserId, { yearAccountId: yid, type: "EXPENSE", pageSize: 100 });
        setTransactions(result.items);
      } catch (err) {
        setError(err instanceof ApiError ? err.message : "โหลดรายการไม่สำเร็จ");
      }
    },
    [externalUserId],
  );

  useEffect(() => {
    if (!externalUserId || role !== "TREASURER") return;

    let cancelled = false;
    setLoading(true);
    setError(null);

    async function load() {
      try {
        const meResponse = await getMe(externalUserId);
        if (cancelled) return;
        setMe(meResponse);

        const yid = meResponse.activeYearAssignments[0]?.yearAccountId;
        if (yid) {
          await loadTransactions(yid);
        }
      } catch (err) {
        if (cancelled) return;
        setError(err instanceof ApiError ? err.message : "โหลดข้อมูลไม่สำเร็จ");
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    load();
    return () => {
      cancelled = true;
    };
  }, [externalUserId, role, loadTransactions]);

  const handleCreated = (created: Transaction) => {
    setTransactions((prev) => [created, ...prev]);
  };

  const handleUpdated = (updated: Transaction) => {
    setTransactions((prev) => prev.map((t) => (t.id === updated.id ? updated : t)));
  };

  if (!externalUserId) {
    return (
      <EmptyState title="เลือกผู้ใช้งานจากเมนูด้านข้างเพื่อเข้าสู่ระบบ" description="(dev only)" />
    );
  }

  if (role !== "TREASURER") {
    return (
      <EmptyState
        title="หน้านี้สำหรับเหรัญญิกเท่านั้น"
        description={`ผู้ใช้ปัจจุบันมีบทบาท ${role ?? "ไม่ทราบ"}`}
      />
    );
  }

  return (
    <>
      <PageHeader
        title="รายการเบิกจ่าย"
        description={me?.activeYearAssignments[0]?.yearAccount.name ?? "ยังไม่ได้รับมอบหมายชั้นปี"}
      />

      {error && <div className={alertClasses.error}>{error}</div>}

      {loading && !me && <SkeletonRows count={3} />}

      {yearAccountId && (
        <CreateExpenseForm externalUserId={externalUserId} yearAccountId={yearAccountId} onCreated={handleCreated} />
      )}

      {!loading && me && !yearAccountId && (
        <div className={alertClasses.warning}>
          บัญชีนี้ยังไม่ได้รับมอบหมายให้ดูแลชั้นปีใด — ติดต่อหัวหน้าสาขา
        </div>
      )}

      {loading && me ? (
        <SkeletonRows count={3} />
      ) : (
        <div className="space-y-3">
          {transactions.length === 0 ? (
            <EmptyState title="ยังไม่มีรายการเบิกจ่าย" description="สร้างรายการแรกได้จากแบบฟอร์มด้านบน" />
          ) : (
            transactions.map((t) => (
              <ExpenseRow
                key={t.id}
                transaction={t}
                externalUserId={externalUserId}
                currentUserId={me?.id ?? ""}
                onUpdated={handleUpdated}
              />
            ))
          )}
        </div>
      )}
    </>
  );
}
