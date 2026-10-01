// AMENDED 2026-09-27 (tech-stack.md v1.1, QA-01 test script): backend had no
// tests at all before this. permission-matrix.ts is a real, security-relevant
// pure function (02_ROLE_PERMISSION_MATRIX.md §3, exposed via GET
// /api/v1/me/permissions), so a regression here is a genuine authorization
// bug, not a cosmetic change — worth a real assertion, not a placeholder.
// This is a read-side projection only (see the file's own header comment):
// it does not replace the @Roles()/@YearScopeParam() guards, but if it
// silently drifted from them the frontend would show controls a role can't
// actually use, or hide ones it can — this test exists to catch that drift.
import { Role } from '@prisma/client';
import { getPermissionSet } from './permission-matrix';

describe('getPermissionSet', () => {
  it('STUDENT can view everything but cannot create, approve, reject, or void', () => {
    const p = getPermissionSet(Role.STUDENT);
    expect(p.viewDashboard).toBe(true);
    expect(p.viewIncome).toBe(true);
    expect(p.viewExpense).toBe(true);
    expect(p.viewProtectedBill).toBe(true);

    expect(p.createExpense).toBe(false);
    expect(p.uploadBill).toBe(false);
    expect(p.approveExpense).toBe(false);
    expect(p.rejectExpense).toBe(false);
    expect(p.voidTransaction).toBe(false);
    expect(p.manageYearAssignment).toBe(false);
  });

  it('TREASURER can create/import/edit/cancel their own scoped work but cannot approve, reject, or void', () => {
    const p = getPermissionSet(Role.TREASURER);
    expect(p.createExpense).toBe(true);
    expect(p.importIncome).toBe(true);
    expect(p.uploadBill).toBe(true);
    expect(p.editPendingExpense).toBe(true);
    expect(p.cancelPendingExpense).toBe(true);

    // A Treasurer must never be able to approve/reject/void their own or
    // anyone else's transactions — that is the Branch Head's job
    // (segregation of duties). If this ever flips to true, it is a real
    // authorization bug, not a style choice.
    expect(p.approveExpense).toBe(false);
    expect(p.rejectExpense).toBe(false);
    expect(p.voidTransaction).toBe(false);
    expect(p.manageYearAssignment).toBe(false);
  });

  it('BRANCH_HEAD can approve, reject, and void, and can see the full audit log', () => {
    const p = getPermissionSet(Role.BRANCH_HEAD);
    expect(p.approveExpense).toBe(true);
    expect(p.rejectExpense).toBe(true);
    expect(p.voidTransaction).toBe(true);
    expect(p.viewFullAuditLog).toBe(true);
    expect(p.manageYearAssignment).toBe(true);
  });

  it('only BRANCH_HEAD can void a transaction', () => {
    expect(getPermissionSet(Role.STUDENT).voidTransaction).toBe(false);
    expect(getPermissionSet(Role.TREASURER).voidTransaction).toBe(false);
    expect(getPermissionSet(Role.BRANCH_HEAD).voidTransaction).toBe(true);
  });

  it('returns every field of PermissionSet for every role (no accidental undefined)', () => {
    const keys: (keyof ReturnType<typeof getPermissionSet>)[] = [
      'viewDashboard', 'viewAllYearBalances', 'viewIncome', 'viewExpense',
      'viewPublicBillPreview', 'viewProtectedBill', 'createIncomeManually',
      'importIncome', 'createExpense', 'uploadBill', 'editPendingExpense',
      'cancelPendingExpense', 'approveExpense', 'rejectExpense',
      'voidTransaction', 'viewFullAuditLog', 'manageYearAssignment',
      'exportFinancialReport',
    ];
    for (const role of [Role.STUDENT, Role.TREASURER, Role.BRANCH_HEAD]) {
      const p = getPermissionSet(role);
      for (const key of keys) {
        expect(typeof p[key]).toBe('boolean');
      }
    }
  });
});
