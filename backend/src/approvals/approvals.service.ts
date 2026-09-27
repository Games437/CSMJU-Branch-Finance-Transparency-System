import { ConflictException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { TransactionStatus, TransactionType } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import { AuthenticatedUser } from '../auth/interfaces/authenticated-user.interface';
import { RejectTransactionDto } from './dto/reject-transaction.dto';
import { VoidTransactionDto } from './dto/void-transaction.dto';

@Injectable()
export class ApprovalsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  async listPending() {
    // EXPENSE goes through PENDING; INCOME goes through NEEDS_REVIEW (see
    // confirmIncome below) — both are "things a Branch Head needs to act
    // on", so both are surfaced here even though they're different
    // statuses and different actions (approve/reject vs confirm).
    return this.prisma.transaction.findMany({
      where: {
        OR: [
          { status: TransactionStatus.PENDING, type: TransactionType.EXPENSE },
          { status: TransactionStatus.NEEDS_REVIEW, type: TransactionType.INCOME },
        ],
      },
      orderBy: { transactionDate: 'asc' },
    });
  }

  async approve(user: AuthenticatedUser, transactionId: string) {
    return this.transitionStatus({
      user,
      transactionId,
      decision: 'APPROVE',
      fromStatus: TransactionStatus.PENDING,
      toStatus: TransactionStatus.APPROVED,
      reason: undefined,
      setApprovedFields: true,
      expectedType: TransactionType.EXPENSE,
    });
  }

  /**
   * AMENDED 2026-09-27 (user's explicit request, "เพิ่มปุ่มไม่อนุมัติด้วยใน
   * ส่วนรายรับ"): originally EXPENSE-only (Business Rule 5 — "PENDING →
   * APPROVED หรือ REJECTED โดย Branch Head" — was written for the Expense
   * flow specifically, and Section 31 #9 only ever resolved a CONFIRM
   * step for INCOME, never a reject path). Generalized the same way
   * void() already is below (expectedType: undefined) rather than adding
   * a parallel rejectIncome() endpoint: unlike confirm-vs-approve (which
   * differ in real-world meaning), reject is the same action for either
   * type — a Branch Head saying "this entry is wrong/duplicate/not
   * ours" — it just starts from a different not-yet-decided status
   * depending on type (PENDING for EXPENSE, NEEDS_REVIEW for INCOME,
   * same rule evidence.service.ts and line.service.ts already use).
   * ADJUSTMENT falls into the NEEDS_REVIEW branch by elimination only —
   * unreached today, same caveat as those two files.
   *
   * Fetches the transaction once here (to know which fromStatus applies)
   * and again inside transitionStatus() (for its own status/type/self-
   * approval checks) — a small redundant read, not a race: the actual
   * state change still happens once, atomically, inside
   * transitionStatus()'s own transaction.
   */
  async reject(user: AuthenticatedUser, transactionId: string, dto: RejectTransactionDto) {
    const transaction = await this.prisma.transaction.findUnique({ where: { id: transactionId } });
    if (!transaction) {
      throw new NotFoundException('Transaction not found.');
    }
    const fromStatus =
      transaction.type === TransactionType.EXPENSE ? TransactionStatus.PENDING : TransactionStatus.NEEDS_REVIEW;

    return this.transitionStatus({
      user,
      transactionId,
      decision: 'REJECT',
      fromStatus,
      toStatus: TransactionStatus.REJECTED,
      reason: dto.reason,
      setApprovedFields: false,
      expectedType: undefined, // both INCOME and EXPENSE can now be rejected — see comment above
    });
  }

  async void(user: AuthenticatedUser, transactionId: string, dto: VoidTransactionDto) {
    // Void only reverses an already-APPROVED transaction. A PENDING one
    // should go through reject instead — voiding it would skip the
    // approval-decision record entirely, which is exactly the kind of
    // gap Security Model Section 6 (trustworthy audit history) exists to
    // prevent.
    return this.transitionStatus({
      user,
      transactionId,
      decision: 'VOID',
      fromStatus: TransactionStatus.APPROVED,
      toStatus: TransactionStatus.VOIDED,
      reason: dto.reason,
      setApprovedFields: false,
      expectedType: undefined, // both INCOME and EXPENSE can be voided once approved
    });
  }

  /**
   * RESOLVED (Section 31 #9 — confirmed by CSMJU): automated bank-feed
   * income is pulled in automatically, but a Branch Head must confirm
   * the amount before it counts toward the balance. So BANK_IMPORT
   * income transactions are created at NEEDS_REVIEW (not APPROVED — see
   * schema.prisma's earlier ASSUMPTION note, now superseded by this
   * confirmed rule), and this is the confirmation step. Still no
   * evidence-REQUIRED check here — Business Rule 4.2 ("evidence before
   * review") only ever applied to Expense, and that hasn't changed.
   * Evidence MAY now optionally exist on an income transaction too (see
   * evidence.service.ts, amended 2026-09-27 — Business Rule 6 no longer
   * restricts evidence to Expense), but confirming income never
   * requires it. Everything else here — self-approval prevention,
   * atomic status+audit write — is identical to expense approval.
   */
  async confirmIncome(user: AuthenticatedUser, transactionId: string) {
    return this.transitionStatus({
      user,
      transactionId,
      decision: 'APPROVE',
      fromStatus: TransactionStatus.NEEDS_REVIEW,
      toStatus: TransactionStatus.APPROVED,
      reason: undefined,
      setApprovedFields: true,
      expectedType: TransactionType.INCOME,
    });
  }

  private async transitionStatus(args: {
    user: AuthenticatedUser;
    transactionId: string;
    decision: 'APPROVE' | 'REJECT' | 'VOID';
    fromStatus: TransactionStatus;
    toStatus: TransactionStatus;
    reason: string | undefined;
    setApprovedFields: boolean;
    expectedType: TransactionType | undefined;
  }) {
    const { user, transactionId, decision, fromStatus, toStatus, reason, setApprovedFields, expectedType } = args;

    const transaction = await this.prisma.transaction.findUnique({ where: { id: transactionId } });

    if (!transaction) {
      throw new NotFoundException('Transaction not found.');
    }

    if (expectedType && transaction.type !== expectedType) {
      // Defensive check: approve()/confirmIncome() are two different
      // endpoints for two different transaction types on purpose (an
      // expense approval and an income confirmation are different
      // real-world actions even though they share the same status
      // transition shape). Calling the wrong one on the wrong type
      // shouldn't silently "work".
      throw new ConflictException(`Transaction is type ${transaction.type}, not ${expectedType}.`);
    }

    if (transaction.status !== fromStatus) {
      throw new ConflictException(
        `Transaction is ${transaction.status}, not ${fromStatus} — cannot ${decision.toLowerCase()} it.`,
      );
    }

    // Segregation of duties (Role Matrix Section 4 / Security Model
    // Section 10 threat "self-approval"). The spec names this
    // specifically for approval, but the same principle applies to
    // reject/void — a Branch Head overriding their own entry with no
    // second party involved is the same risk.
    if (transaction.createdBy === user.id) {
      throw new ForbiddenException('You cannot act on a transaction you created yourself.');
    }

    if (decision === 'APPROVE' && transaction.type === TransactionType.EXPENSE) {
      // Business Rule 4.2: "Expense ต้องมีหลักฐานบิล/เอกสารประกอบก่อนเข้าสู่
      // ขั้นตอนตรวจสอบ" (an expense must have evidence before entering the
      // review step). Checked here rather than at expense-creation time —
      // the API exposes creation and evidence-upload as two separate
      // calls (POST /expenses then POST /expenses/{id}/evidence), so this
      // is the point that actually guarantees the invariant regardless of
      // call order. Placed after the existence/status/self-approval
      // checks above so a bad transactionId or wrong-status transaction
      // still gets its own correct error instead of a misleading
      // "no evidence" message. Gated to EXPENSE only — confirmIncome()
      // also passes decision='APPROVE' but income never has evidence.
      const evidenceCount = await this.prisma.expenseEvidence.count({ where: { transactionId } });
      if (evidenceCount === 0) {
        throw new ConflictException('This expense has no evidence attached and cannot be approved.');
      }
    }

    // THE FIX FROM THE SEED-SCRIPT BUG: the status transition, the
    // approval_action record, AND the audit log entry must all happen in
    // the SAME atomic transaction (Security Model Section 4). If these
    // were separate writes and the process died partway through, the
    // transaction could be left APPROVED with no matching decision row,
    // or approved with no audit trail — exactly the class of bug found
    // (accidentally) in prisma/seed.ts before it was fixed. Using
    // Prisma's interactive transaction form here (not the array form)
    // specifically so AuditService.record can be included in the same
    // atomic unit rather than firing afterwards as a separate write.
    const auditAction =
      decision === 'APPROVE' && transaction.type === TransactionType.INCOME
        ? 'INCOME_CONFIRMED'
        : ({
            APPROVE: 'TRANSACTION_APPROVED',
            REJECT: 'TRANSACTION_REJECTED',
            VOID: 'VOID_TRANSACTION', // matches the example event name in Business Rules Section 9
          } satisfies Record<typeof decision, string>)[decision];

    const updated = await this.prisma.$transaction(async (tx) => {
      const updatedTransaction = await tx.transaction.update({
        where: { id: transactionId },
        data: {
          status: toStatus,
          ...(setApprovedFields
            ? { approvedBy: user.id, approvedByUsername: user.externalUserId, approvedAt: new Date() }
            : {}),
        },
      });

      await tx.approvalAction.create({
        data: {
          transactionId,
          actorId: user.id,
          actorUsername: user.externalUserId,
          decision,
          reason,
        },
      });

      await this.audit.record(
        {
          actorId: user.id,
          actorUsername: user.externalUserId,
          action: auditAction,
          targetType: 'Transaction',
          targetId: transactionId,
          yearAccountId: transaction.yearAccountId,
          beforeJson: { status: fromStatus },
          afterJson: { status: toStatus },
          metadataJson: reason ? { reason } : undefined,
        },
        tx,
      );

      return updatedTransaction;
    });

    return updated;
  }
}
