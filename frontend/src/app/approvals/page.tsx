"use client";

import { useEffect, useState } from "react";
import { useDevAuth } from "@/lib/dev-auth";
import { ApiError, listPendingApprovals, type PendingApprovalItem } from "@/lib/api";
import { ApprovalRow } from "@/components/ApprovalRow";
import { PageHeader } from "@/components/csmju/PageHeader";
import { EmptyState } from "@/components/csmju/EmptyState";
import { SkeletonRows } from "@/components/csmju/Skeleton";
import { alertClasses } from "@/components/csmju/ui";

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

  return (
    <>
      <PageHeader
        title="รายการรออนุมัติ"
        description="รายการเบิกจ่ายที่รออนุมัติ และรายรับจากธนาคารที่รอยืนยัน"
      />

      {error && <div className={alertClasses.error}>{error}</div>}

      {loading ? (
        <SkeletonRows count={4} />
      ) : (
        <div className="space-y-3">
          {items.length === 0 ? (
            <EmptyState title="ไม่มีรายการรออนุมัติในขณะนี้" description="รายการใหม่จะปรากฏที่นี่เมื่อมีการส่งคำขอ" />
          ) : (
            items.map((item) => (
              <ApprovalRow key={item.id} item={item} externalUserId={externalUserId} onResolved={handleResolved} />
            ))
          )}
        </div>
      )}
    </>
  );
}
