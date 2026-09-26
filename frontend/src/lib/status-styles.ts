import type { TransactionStatus } from "./api";

/**
 * Passbook color semantics, kept consistent everywhere a status badge
 * appears: jade = settled/approved, brass = pending/needs attention,
 * rust = rejected/voided. Centralized here so the approval pages
 * (not yet built) use the same mapping rather than each page
 * reinventing it slightly differently.
 */
export function statusBadgeClasses(status: TransactionStatus): string {
  switch (status) {
    case "APPROVED":
      return "bg-jadeSoft text-jade";
    case "PENDING":
    case "NEEDS_REVIEW":
      return "bg-brassSoft text-brass";
    case "REJECTED":
    case "VOIDED":
    case "CANCELLED":
      return "bg-rustSoft text-rust";
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
