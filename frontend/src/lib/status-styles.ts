import type { TransactionStatus } from "./api";

/**
 * Status color semantics (CSMJU brand system), kept consistent everywhere
 * a status badge appears: success = settled/approved, warning = pending/
 * needs attention, error = rejected/voided/cancelled. This is a re-skin of
 * the same underlying behavior — WHICH statuses map to which tone is
 * unchanged, only the visual tokens changed (jade/brass/rust -> the
 * design system's success/warning/error tones).
 */
export type StatusTone = "success" | "warning" | "error";

export function statusTone(status: TransactionStatus): StatusTone {
  switch (status) {
    case "APPROVED":
      return "success";
    case "PENDING":
    case "NEEDS_REVIEW":
      return "warning";
    case "REJECTED":
    case "VOIDED":
    case "CANCELLED":
      return "error";
  }
}

export function statusBadgeClasses(status: TransactionStatus): string {
  switch (statusTone(status)) {
    case "success":
      // success (#10B981) fails WCAG AA as text on white — pair with
      // emerald-700 text (~5.5:1) and a dot (see StatusBadge component),
      // never green text alone.
      return "bg-success/10 text-emerald-700";
    case "warning":
      return "bg-brand-amber/10 text-amber-700";
    case "error":
      return "bg-error-container text-on-error-container";
  }
}

export function statusLabelTh(status: TransactionStatus): string {
  switch (status) {
    case "PENDING":
      return "รออนุมัติ";
    case "APPROVED":
      return "อนุมัติแล้ว";
    case "REJECTED":
      return "ถูกปฏิเสธ";
    case "VOIDED":
      return "ถูกยกเลิก (โดยหัวหน้าสาขา)";
    case "NEEDS_REVIEW":
      return "รอตรวจสอบ";
    case "CANCELLED":
      // Distinct from VOIDED: this is the creator withdrawing their own
      // still-PENDING request, not a Branch Head reversing an APPROVED one.
      return "ยกเลิกโดยผู้สร้างรายการ";
  }
}
