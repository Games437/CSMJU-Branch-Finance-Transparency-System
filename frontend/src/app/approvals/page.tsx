"use client";

import { useEffect, useState } from "react";
import { useDevAuth } from "@/lib/dev-auth";
import { ApiError, listPendingApprovals, type PendingApprovalItem } from "@/lib/api";
import { ApprovalRow } from "@/components/ApprovalRow";

export default function ApprovalsPage() {
  const { externalUserId, role } = useDevAuth();
  const [items, setItems] = useState<PendingApprovalItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!externalUserId || role !== "BRANCH_HEAD") return;

    let cancelled = false;
    setLoading(true);
    setError(null);

    listPendingApprovals(externalUserId)
      .then((list) => {
        if (!cancelled) setItems(list);
      })
      .catch((err) => {
        if (!cancelled) setError(err instanceof ApiError ? err.message : "โหลดรายการรออนุมัติไม่สำเร็จ");
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [externalUserId, role]);

  const handleResolved = (transactionId: string) => {
    setItems((prev) => prev.filter((item) => item.id !== transactionId));
  };

  if (!externalUserId) {
    return (
      <main className="mx-auto max-w-3xl p-6">
        <p className="text-inkFaint">เลือกผู้ใช้งานจากแถบด้านบนเพื่อเข้าสู่ระบบ (dev only)</p>
      </main>
    );
  }

  if (role !== "BRANCH_HEAD") {
    return (
      <main className="mx-auto max-w-3xl p-6">
        <p className="text-inkFaint">
          หน้านี้สำหรับหัวหน้าสาขาเท่านั้น (ผู้ใช้ปัจจุบันมีบทบาท {role ?? "ไม่ทราบ"})
        </p>
      </main>
    );
  }

  return (
    <main className="mx-auto max-w-3xl p-6">
      <h1 className="mb-1 font-display text-2xl font-semibold text-ink">รายการรออนุมัติ</h1>
      <p className="mb-6 text-sm text-inkFaint">
        รายการเบิกจ่ายที่รออนุมัติ และรายรับจากธนาคารที่รอยืนยัน
      </p>

      {error && (
        <div className="mb-6 rounded-passbook border-2 border-rust bg-rustSoft p-4 text-rust">{error}</div>
      )}

      {loading && <p className="text-inkFaint">กำลังโหลด...</p>}

      {!loading && (
        <div className="space-y-3">
          {items.length === 0 ? (
            <p className="text-inkFaint">ไม่มีรายการรออนุมัติในขณะนี้</p>
          ) : (
            items.map((item) => (
              <ApprovalRow
                key={item.id}
                item={item}
                externalUserId={externalUserId}
                onResolved={handleResolved}
              />
            ))
          )}
        </div>
      )}
    </main>
  );
}
