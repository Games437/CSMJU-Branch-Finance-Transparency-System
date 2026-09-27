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
    if (!externalUserId) return;
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
    if (!externalUserId) return;
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
    if (!externalUserId) return;
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
      <main className="mx-auto max-w-2xl p-6">
        <p className="text-inkFaint">เลือกผู้ใช้งานจากแถบด้านบนเพื่อเข้าสู่ระบบ (dev only)</p>
      </main>
    );
  }

  if (role !== "TREASURER") {
    return (
      <main className="mx-auto max-w-2xl p-6">
        <p className="text-inkFaint">
          หน้านี้สำหรับเหรัญญิกเท่านั้น (ผู้ใช้ปัจจุบันมีบทบาท {role ?? "ไม่ทราบ"})
        </p>
      </main>
    );
  }

  return (
    <main className="mx-auto max-w-2xl p-6">
      <h1 className="mb-1 font-display text-2xl font-semibold text-ink">เชื่อมต่อ LINE</h1>
      <p className="mb-6 text-sm text-inkFaint">
        เชื่อมบัญชี LINE ส่วนตัวของท่านกับระบบ เพื่อแจ้งรายรับ-รายจ่ายผ่าน LINE OA ของสาขาได้โดยตรง
      </p>

      {error && (
        <div className="mb-6 rounded-passbook border-2 border-rust bg-rustSoft p-4 text-rust">{error}</div>
      )}

      <div className="mb-6 rounded-passbook border-2 border-paperLine bg-white p-4">
        <h2 className="mb-2 font-display text-lg font-semibold text-ink">สถานะปัจจุบัน</h2>
        {status?.linked ? (
          <>
            <p className="text-jade">
              ✅ เชื่อมต่อแล้ว {status.linkedAt && `(ตั้งแต่ ${dateTimeFmt.format(new Date(status.linkedAt))})`}
            </p>
            <button
              onClick={handleUnlink}
              disabled={loading}
              className="mt-3 rounded-passbook border-2 border-rust px-3 py-1.5 text-sm text-rust hover:bg-rustSoft disabled:opacity-50"
            >
              ยกเลิกการเชื่อมต่อ
            </button>
          </>
        ) : (
          <p className="text-inkFaint">ยังไม่ได้เชื่อมต่อบัญชี LINE</p>
        )}
      </div>

      {!status?.linked && (
        <div className="rounded-passbook border-2 border-jade bg-jadeSoft p-4">
          <h2 className="mb-2 font-display text-lg font-semibold text-ink">ขั้นตอนการเชื่อมต่อ</h2>
          <ol className="mb-4 list-decimal space-y-1 pl-5 text-sm text-ink">
            <li>เพิ่มเพื่อน LINE OA ของสาขา (ขอ LINE ID จากหัวหน้าสาขา)</li>
            <li>กดปุ่ม &quot;ขอรหัสเชื่อมต่อ&quot; ด้านล่าง</li>
            <li>
              พิมพ์ส่งข้อความนี้ไปที่ LINE OA:{" "}
              <span className="font-mono font-semibold">ผูกบัญชี &lt;รหัส&gt;</span>
            </li>
          </ol>

          <button
            onClick={handleGenerateCode}
            disabled={loading}
            className="rounded-passbook bg-jade px-4 py-2 font-medium text-white hover:opacity-90 disabled:opacity-50"
          >
            {loading ? "กำลังขอรหัส..." : "ขอรหัสเชื่อมต่อ"}
          </button>

          {code && (
            <div className="mt-4 rounded-passbook border-2 border-jade bg-white p-4 text-center">
              <p className="text-xs text-inkFaint">รหัสของท่านคือ</p>
              <p className="font-mono text-3xl font-bold tracking-widest text-ink">{code}</p>
              {codeExpiresAt && (
                <p className="mt-1 text-xs text-inkFaint">
                  หมดอายุ {dateTimeFmt.format(new Date(codeExpiresAt))} (ใช้ได้ครั้งเดียว)
                </p>
              )}
              <p className="mt-3 text-sm text-ink">
                พิมพ์ส่งไปที่ LINE OA:{" "}
                <span className="font-mono font-semibold">ผูกบัญชี {code}</span>
              </p>
            </div>
          )}
        </div>
      )}
    </main>
  );
}
