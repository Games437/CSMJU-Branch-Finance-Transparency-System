import { Role } from '@prisma/client';

/**
 * Machine-readable translation of 02_ROLE_PERMISSION_MATRIX.md Section 3.
 *
 * This is exposed via GET /api/v1/me/permissions so the frontend can decide
 * what to show — but per Security Model Section 7 / Role Matrix Section 4
 * ("Frontend hiding buttons is not authorization"), THIS FILE MUST NEVER be
 * the sole enforcement point. Every mutating endpoint still needs its own
 * @Roles()/@YearScopeParam() guards. Treat this as a read-only projection
 * of the same rules, not a second source of truth — if the matrix changes,
 * update both this file and the relevant controller guards together.
 *
 * SELF-REVIEW NOTE: several cells in the source matrix are not yet crisp
 * enough to encode as booleans — e.g. "Create income manually: policy-based"
 * and "Create expense: ✓/override if needed" for Branch Head. Those are
 * left as `false` here (safer default) with a comment, NOT guessed at,
 * until Section 31's open business rules are locked. Treat any `false`
 * marked ASSUMPTION below as "not yet authorized to build", not as a
 * final policy decision.
 *
 * `cancelPendingExpense` is NOT in the source matrix doc at all — it was
 * added after a Treasurer asked for a way to withdraw their own
 * not-yet-reviewed expense, confirmed with the user rather than guessed
 * (see transactions.service.ts#cancelExpense's comment for the full
 * reasoning). Mirrors `editPendingExpense` exactly: same own/scoped vs.
 * unscoped split, since it's the same kind of pre-review self-service
 * action on the same PENDING expense.
 */
export interface PermissionSet {
  viewDashboard: boolean;
  viewAllYearBalances: boolean;
  viewIncome: boolean;
  viewExpense: boolean;
  viewPublicBillPreview: boolean;
  viewProtectedBill: boolean;
  createIncomeManually: boolean;
  importIncome: boolean;
  createExpense: boolean;
  uploadBill: boolean;
  editPendingExpense: boolean;
  cancelPendingExpense: boolean;
  approveExpense: boolean;
  rejectExpense: boolean;
  voidTransaction: boolean;
  viewFullAuditLog: boolean;
  manageYearAssignment: boolean;
  exportFinancialReport: boolean;
}

export function getPermissionSet(role: Role): PermissionSet {
  switch (role) {
    case Role.STUDENT:
      return {
        viewDashboard: true,
        viewAllYearBalances: true,
        viewIncome: true,
        viewExpense: true,
        viewPublicBillPreview: true,
        viewProtectedBill: true, // RESOLVED (Section 31 #12): students can view bills — full transparency
        createIncomeManually: false,
        importIncome: false,
        createExpense: false,
        uploadBill: false,
        editPendingExpense: false,
        cancelPendingExpense: false,
        approveExpense: false,
        rejectExpense: false,
        voidTransaction: false,
        viewFullAuditLog: false,
        manageYearAssignment: false,
        exportFinancialReport: false, // "optional" — ASSUMPTION: deny until decided
      };
    case Role.TREASURER:
      return {
        viewDashboard: true,
        viewAllYearBalances: true,
        viewIncome: true, // scoped — enforced separately by YearScopeParam, not here
        viewExpense: true, // scoped
        viewPublicBillPreview: true, // scoped
        viewProtectedBill: true, // scoped
        createIncomeManually: false, // "policy-based" — ASSUMPTION: deny until policy is set
        importIncome: true, // scoped
        createExpense: true, // scoped
        uploadBill: true, // scoped
        editPendingExpense: true, // own/scoped
        cancelPendingExpense: true, // own/scoped
        approveExpense: false,
        rejectExpense: false,
        voidTransaction: false,
        viewFullAuditLog: false, // "limited scoped" — ASSUMPTION: full deny until scope is defined precisely
        manageYearAssignment: false,
        exportFinancialReport: true, // scoped
      };
    case Role.BRANCH_HEAD:
      return {
        viewDashboard: true,
        viewAllYearBalances: true,
        viewIncome: true,
        viewExpense: true,
        viewPublicBillPreview: true,
        viewProtectedBill: true,
        createIncomeManually: false, // "✓/policy" — ASSUMPTION: deny until policy is set
        importIncome: true,
        createExpense: true, // "✓/override if needed" — base capability granted; the "override" nuance is not modeled yet
        uploadBill: true,
        editPendingExpense: true,
        cancelPendingExpense: true, // unscoped, same as editPendingExpense
        approveExpense: true,
        rejectExpense: true,
        voidTransaction: true, // "with reason" — enforced by requiring `reason` in the void DTO, not here
        viewFullAuditLog: true,
        manageYearAssignment: true,
        exportFinancialReport: true,
      };
  }
}
