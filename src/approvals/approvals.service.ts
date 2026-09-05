import { ConflictException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { TransactionStatus } from '@prisma/client';
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
    // Only EXPENSE currently goes through this PENDING approval
    // workflow — INCOME is either auto-APPROVED or NEEDS_REVIEW per the
    // assumptions documented in schema.prisma, never PENDING in the
    // approval-queue sense. If that changes, this filter needs revisiting.
    return this.prisma.transaction.findMany({
      where: { status: TransactionStatus.PENDING, type: 'EXPENSE' },
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
    });
  }

  async reject(user: AuthenticatedUser, transactionId: string, dto: RejectTransactionDto) {
    return this.transitionStatus({
      user,
      transactionId,
      decision: 'REJECT',
      fromStatus: TransactionStatus.PENDING,
      toStatus: TransactionStatus.REJECTED,
      reason: dto.reason,
      setApprovedFields: false,
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
  }) {
    const { user, transactionId, decision, fromStatus, toStatus, reason, setApprovedFields } = args;

    const transaction = await this.prisma.transaction.findUnique({ where: { id: transactionId } });

    if (!transaction) {
      throw new NotFoundException('Transaction not found.');
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

    if (decision === 'APPROVE') {
      // Business Rule 4.2: "Expense ต้องมีหลักฐานบิล/เอกสารประกอบก่อนเข้าสู่
      // ขั้นตอนตรวจสอบ" (an expense must have evidence before entering the
      // review step). Checked here rather than at expense-creation time —
      // the API exposes creation and evidence-upload as two separate
      // calls (POST /expenses then POST /expenses/{id}/evidence), so this
      // is the point that actually guarantees the invariant regardless of
      // call order. Placed after the existence/status/self-approval
      // checks above so a bad transactionId or wrong-status transaction
      // still gets its own correct error instead of a misleading
      // "no evidence" message.
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
    // Explicit mapping instead of string concatenation — decision + "D"
    // works for APPROVE->APPROVED and REJECT->REJECTED but silently
    // produces "VOIDD" for VOID. Caught by inspection before it ended up
    // in an audit log that's supposed to be a trustworthy permanent record.
    const auditAction: Record<typeof decision, string> = {
      APPROVE: 'TRANSACTION_APPROVED',
      REJECT: 'TRANSACTION_REJECTED',
      VOID: 'VOID_TRANSACTION', // matches the example event name in Business Rules Section 9
    };

    const updated = await this.prisma.$transaction(async (tx) => {
      const updatedTransaction = await tx.transaction.update({
        where: { id: transactionId },
        data: {
          status: toStatus,
          ...(setApprovedFields ? { approvedBy: user.id, approvedAt: new Date() } : {}),
        },
      });

      await tx.approvalAction.create({
        data: {
          transactionId,
          actorId: user.id,
          decision,
          reason,
        },
      });

      await this.audit.record(
        {
          actorId: user.id,
          action: auditAction[decision],
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
