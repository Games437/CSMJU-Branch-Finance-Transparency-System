"use client";

import { useCallback, useEffect, useState } from "react";
import { useDevAuth } from "@/lib/dev-auth";
import { ApiError, getMe, listTransactions, type MeResponse, type Transaction } from "@/lib/api";
import { CreateExpenseForm } from "@/components/CreateExpenseForm";
import { ExpenseRow } from "@/components/ExpenseRow";

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
      <main className="mx-auto max-w-3xl p-6">
        <p className="text-inkFaint">เลือกผู้ใช้งานจากแถบด้านบนเพื่อเข้าสู่ระบบ (dev only)</p>
      </main>
    );
  }

  if (role !== "TREASURER") {
    return (
      <main className="mx-auto max-w-3xl p-6">
        <p className="text-inkFaint">
          หน้านี้สำหรับเหรัญญิกเท่านั้น (ผู้ใช้ปัจจุบันมีบทบาท {role ?? "ไม่ทราบ"})
        </p>
      </main>
    );
  }

  return (
    <main className="mx-auto max-w-3xl p-6">
      <h1 className="mb-1 font-display text-2xl font-semibold text-ink">รายการเบิกจ่าย</h1>
      {me && (
        <p className="mb-6 text-sm text-inkFaint">
          {me.activeYearAssignments[0]?.yearAccount.name ?? "ยังไม่ได้รับมอบหมายชั้นปี"}
        </p>
      )}

      {error && (
        <div className="mb-6 rounded-passbook border-2 border-rust bg-rustSoft p-4 text-rust">{error}</div>
      )}

      {loading && !me && <p className="text-inkFaint">กำลังโหลด...</p>}

      {yearAccountId && (
        <CreateExpenseForm externalUserId={externalUserId} yearAccountId={yearAccountId} onCreated={handleCreated} />
      )}

      {!loading && me && !yearAccountId && (
        <p className="mb-6 rounded-passbook border-2 border-brass bg-brassSoft p-4 text-brass">
          บัญชีนี้ยังไม่ได้รับมอบหมายให้ดูแลชั้นปีใด — ติดต่อหัวหน้าสาขา
        </p>
      )}

      <div className="space-y-3">
        {transactions.length === 0 && !loading ? (
          <p className="text-inkFaint">ยังไม่มีรายการเบิกจ่าย</p>
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
    </main>
  );
}
