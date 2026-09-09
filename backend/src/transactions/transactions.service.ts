import { ConflictException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { Role, TransactionStatus } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { YearScopeService } from '../rbac/year-scope.service';
import { AuditService } from '../audit/audit.service';
import { AuthenticatedUser } from '../auth/interfaces/authenticated-user.interface';
import { CreateExpenseDto } from './dto/create-expense.dto';
import { UpdateExpenseDto } from './dto/update-expense.dto';
import { ListTransactionsQueryDto } from './dto/list-transactions-query.dto';

@Injectable()
export class TransactionsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly yearScope: YearScopeService,
    private readonly audit: AuditService,
  ) {}

  async createExpense(user: AuthenticatedUser, dto: CreateExpenseDto) {
    // STUDENT is already blocked by @Roles() on the controller; this is
    // the year-scope half of authorization (role alone is not sufficient
    // — Role Matrix Section 4).
    await this.yearScope.assertCanAccessYear(user, dto.yearAccountId);

    const transaction = await this.prisma.transaction.create({
      data: {
        yearAccountId: dto.yearAccountId,
        type: 'EXPENSE',
        status: 'PENDING',
        amount: dto.amount,
        transactionDate: new Date(dto.transactionDate),
        description: dto.description,
        category: dto.category,
        sourceType: 'MANUAL',
        createdBy: user.id,
      },
    });

    await this.audit.record({
      actorId: user.id,
      action: 'EXPENSE_CREATED',
      targetType: 'Transaction',
      targetId: transaction.id,
      yearAccountId: transaction.yearAccountId,
      afterJson: { status: transaction.status, amount: transaction.amount.toString() },
    });

    return transaction;
  }

  async list(user: AuthenticatedUser, query: ListTransactionsQueryDto) {
    const where: Record<string, unknown> = {};

    if (query.type) where.type = query.type;
    if (query.status) where.status = query.status;

    if (user.role === Role.TREASURER) {
      const activeIds = await this.yearScope.getActiveYearAccountIds(user.id);

      if (query.yearAccountId) {
        // Explicit IDOR attempt: asking for a year outside their scope.
        // Deny rather than silently ignoring the filter.
        if (!activeIds.includes(query.yearAccountId)) {
          throw new ForbiddenException('You do not have permission to access this resource.');
        }
        where.yearAccountId = query.yearAccountId;
      } else {
        // No filter given: default to only what they're scoped to,
        // rather than accidentally returning branch-wide data.
        where.yearAccountId = { in: activeIds };
      }
    } else if (query.yearAccountId) {
      // STUDENT / BRANCH_HEAD: branch-wide read, optional filter.
      where.yearAccountId = query.yearAccountId;
    }

    const skip = (query.page - 1) * query.pageSize;

    const [items, total] = await Promise.all([
      this.prisma.transaction.findMany({
        where,
        orderBy: { transactionDate: 'desc' },
        skip,
        take: query.pageSize,
      }),
      this.prisma.transaction.count({ where }),
    ]);

    return { items: items.map((t) => this.maskForRole(user, t)), page: query.page, pageSize: query.pageSize, total };
  }

  async getById(user: AuthenticatedUser, id: string) {
    const transaction = await this.prisma.transaction.findUnique({ where: { id } });

    if (!transaction) {
      throw new NotFoundException('Transaction not found.');
    }

    if (user.role === Role.TREASURER) {
      await this.yearScope.assertCanAccessYear(user, transaction.yearAccountId);
    }

    return this.maskForRole(user, transaction);
  }

  /**
   * Business Rule 10 (Privacy): "ข้อมูลผู้โอน/เลขบัญชี/Reference
   * รายละเอียดลึกให้จำกัดตาม role" — bank reference details should be
   * limited by role. externalReference can carry a raw bank
   * reference/payer note from the income-integration pipeline (Phase 4),
   * so it's stripped for STUDENT here even though today's seed data
   * doesn't yet populate it for anything but manual testing. Not
   * stripped for TREASURER/BRANCH_HEAD, who need it for reconciliation.
   */
  private maskForRole<T extends { externalReference: string | null }>(user: AuthenticatedUser, transaction: T): T {
    if (user.role === Role.STUDENT) {
      return { ...transaction, externalReference: null };
    }
    return transaction;
  }

  async updateExpense(user: AuthenticatedUser, id: string, dto: UpdateExpenseDto) {
    const transaction = await this.prisma.transaction.findUnique({ where: { id } });

    if (!transaction) {
      throw new NotFoundException('Transaction not found.');
    }

    if (transaction.type !== 'EXPENSE') {
      throw new ConflictException('Only expense transactions can be edited through this endpoint.');
    }

    if (transaction.status !== TransactionStatus.PENDING) {
      // Security Model Section 4: "Approved transaction amounts cannot be
      // silently overwritten." Any status other than PENDING is final
      // enough that a correction must go through void/adjustment, not a
      // plain edit.
      throw new ConflictException(
        `Transaction is ${transaction.status}, not PENDING — it can no longer be edited directly.`,
      );
    }

    if (user.role === Role.TREASURER) {
      await this.yearScope.assertCanAccessYear(user, transaction.yearAccountId);
      // "own/scoped" per Role Matrix: a treasurer can only edit
      // transactions they themselves created, even within their own year
      // (e.g. not another operator's entry, if that ever becomes
      // possible). Branch Head has no such restriction ("✓" unscoped).
      if (transaction.createdBy !== user.id) {
        throw new ForbiddenException('You do not have permission to access this resource.');
      }
    }

    const before = {
      amount: transaction.amount.toString(),
      transactionDate: transaction.transactionDate,
      description: transaction.description,
      category: transaction.category,
    };

    const updated = await this.prisma.transaction.update({
      where: { id },
      data: {
        ...(dto.amount !== undefined ? { amount: dto.amount } : {}),
        ...(dto.transactionDate !== undefined ? { transactionDate: new Date(dto.transactionDate) } : {}),
        ...(dto.description !== undefined ? { description: dto.description } : {}),
        ...(dto.category !== undefined ? { category: dto.category } : {}),
      },
    });

    await this.audit.record({
      actorId: user.id,
      action: 'EXPENSE_UPDATED',
      targetType: 'Transaction',
      targetId: updated.id,
      yearAccountId: updated.yearAccountId,
      beforeJson: before,
      afterJson: {
        amount: updated.amount.toString(),
        transactionDate: updated.transactionDate,
        description: updated.description,
        category: updated.category,
      },
    });

    return updated;
  }
}
