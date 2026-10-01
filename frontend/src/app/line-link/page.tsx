"use client";

import { useCallback, useEffect, useState } from "react";
import { useDevAuth } from "@/lib/dev-auth";
import {
  ApiError,
  generateLineLinkCode,
  getLineLinkStatus,
  unlinkLine,
  type LineLinkStatusResponse,
} from "@/lib/api";
import { PageHeader } from "@/components/csmju/PageHeader";
import { EmptyState } from "@/components/csmju/EmptyState";
import { alertClasses, cardClass, dangerButtonClass, primaryButtonClass } from "@/components/csmju/ui";

const dateTimeFmt = new Intl.DateTimeFormat("th-TH", {
  year: "numeric",
  month: "short",
  day: "numeric",
  hour: "2-digit",
  minute: "2-digit",
});

// ============================================================================
// TREASURER-only page (backend/src/line/line-account.controller.ts is
// @Roles(TREASURER) on every route it exposes) for the LINE OA
// quick-entry feature: generate a one-time code here, then send it to
// the branch's LINE Official Account as "ผูกบัญชี <code>" to link that
// LINE account to this login. See schema.prisma's LineLinkCode comment
// for why this two-step flow exists instead of just typing a username
// straight into LINE.
// ============================================================================

export default function LineLinkPage() {
  const { externalUserId, role } = useDevAuth();
  const [status, setStatus] = useState<LineLinkStatusResponse | null>(null);
  const [code, setCode] = useState<string | null>(null);
  const [codeExpiresAt, setCodeExpiresAt] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const loadStatus = useCallback(async () => {
    try {
      const result = await getLineLinkStatus(externalUserId);
      setStatus(result);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "โหลดสถานะไม่สำเร็จ");
    }
  }, [externalUserId]);

  useEffect(() => {
    if (externalUserId && role === "TREASURER") {
      loadStatus();
    }
  }, [externalUserId, role, loadStatus]);

  const handleGenerateCode = async () => {
    setLoading(true);
    setError(null);
    try {
      const result = await generateLineLinkCode(externalUserId);
      setCode(result.code);
      setCodeExpiresAt(result.expiresAt);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "ขอรหัสไม่สำเร็จ");
    } finally {
      setLoading(false);
    }
  };

  const handleUnlink = async () => {
    setLoading(true);
    setError(null);
    try {
      await unlinkLine(externalUserId);
      setCode(null);
      setCodeExpiresAt(null);
      await loadStatus();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "ยกเลิกการเชื่อมต่อไม่สำเร็จ");
    } finally {
      setLoading(false);
    }
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
        title="เชื่อมต่อ LINE"
        description="เชื่อมบัญชี LINE ส่วนตัวของท่านกับระบบ เพื่อแจ้งรายรับ-รายจ่ายผ่าน LINE OA ของสาขาได้โดยตรง"
      />

      {error && <div className={alertClasses.error}>{error}</div>}

      <div className={`${cardClass} p-5`}>
        <h2 className="mb-2 font-display text-headline-md text-on-surface">สถานะปัจจุบัน</h2>
        {status?.linked ? (
          <>
            <p className="flex items-center gap-2 text-body-md text-emerald-700">
              <span className="h-2 w-2 rounded-full bg-success" aria-hidden="true" />
              เชื่อมต่อแล้ว {status.linkedAt && `(ตั้งแต่ ${dateTimeFmt.format(new Date(status.linkedAt))})`}
            </p>
            <button onClick={handleUnlink} disabled={loading} className={`${dangerButtonClass} mt-3`}>
              {loading ? "กำลังดำเนินการ..." : "ยกเลิกการเชื่อมต่อ"}
            </button>
          </>
        ) : (
          <p className="text-body-md text-on-surface-variant">ยังไม่ได้เชื่อมต่อบัญชี LINE</p>
        )}
      </div>

      {!status?.linked && (
        <div className={`${cardClass} p-5`}>
          <h2 className="mb-2 font-display text-headline-md text-on-surface">ขั้นตอนการเชื่อมต่อ</h2>
          <ol className="mb-4 list-decimal space-y-1 pl-5 text-body-md text-on-surface">
            <li>เพิ่มเพื่อน LINE OA ของสาขา (ขอ LINE ID จากหัวหน้าสาขา)</li>
            <li>กดปุ่ม &quot;ขอรหัสเชื่อมต่อ&quot; ด้านล่าง</li>
            <li>
              พิมพ์ส่งข้อความนี้ไปที่ LINE OA:{" "}
              <span className="font-mono font-semibold">ผูกบัญชี &lt;รหัส&gt;</span>
            </li>
          </ol>

          <button onClick={handleGenerateCode} disabled={loading} className={primaryButtonClass}>
            {loading ? "กำลังขอรหัส..." : "ขอรหัสเชื่อมต่อ"}
          </button>

          {code && (
            <div className="mt-4 rounded-xl border border-outline-variant bg-surface-container-lowest p-4 text-center">
              <p className="text-caption text-on-surface-variant">รหัสของท่านคือ</p>
              <p className="tabular-nums font-mono text-display-lg font-bold tracking-widest text-on-surface">
                {code}
              </p>
              {codeExpiresAt && (
                <p className="mt-1 text-caption text-on-surface-variant">
                  หมดอายุ {dateTimeFmt.format(new Date(codeExpiresAt))} (ใช้ได้ครั้งเดียว)
                </p>
              )}
              <p className="mt-3 text-body-md text-on-surface">
                พิมพ์ส่งไปที่ LINE OA:{" "}
                <span className="font-mono font-semibold">ผูกบัญชี {code}</span>
              </p>
            </div>
          )}
        </div>
      )}
    </>
  );
}
