import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class YearAccountsService {
  constructor(private readonly prisma: PrismaService) {}

  async listAll() {
    return this.prisma.yearAccount.findMany({
      where: { active: true },
      orderBy: { yearLevel: 'asc' },
      select: {
        id: true,
        yearLevel: true,
        name: true,
        academicYearLabel: true,
        currency: true,
      },
      // Deliberately NOT selecting openingBalance in the list view —
      // balance is a derived figure (see getSummary), and exposing the
      // raw opening_balance column here invites a client to (mis)treat it
      // as "the balance" instead of calling the summary endpoint.
    });
  }

  async getSummary(yearAccountId: string) {
    const yearAccount = await this.prisma.yearAccount.findUnique({
      where: { id: yearAccountId },
    });

    if (!yearAccount || !yearAccount.active) {
      throw new NotFoundException('Year account not found.');
    }

    // Balance = opening balance + APPROVED income - APPROVED expense.
    // PENDING/REJECTED/NEEDS_REVIEW never affect balance. VOIDED also
    // never affects balance BY CONSTRUCTION here: a transaction that was
    // APPROVED and later voided has its `status` transitioned to VOIDED
    // (not left as APPROVED), so it is automatically excluded from this
    // sum — there is no separate "subtract voided" step needed. This
    // relies on that status-transition rule always being followed by
    // whatever service performs voiding (not yet built in this phase).
    const [incomeAgg, expenseAgg] = await Promise.all([
      this.prisma.transaction.aggregate({
        where: { yearAccountId, type: 'INCOME', status: 'APPROVED' },
        _sum: { amount: true },
      }),
      this.prisma.transaction.aggregate({
        where: { yearAccountId, type: 'EXPENSE', status: 'APPROVED' },
        _sum: { amount: true },
      }),
    ]);

    const approvedIncome = incomeAgg._sum.amount ?? 0;
    const approvedExpense = expenseAgg._sum.amount ?? 0;
    const balance = Number(yearAccount.openingBalance) + Number(approvedIncome) - Number(approvedExpense);

    return {
      yearAccountId: yearAccount.id,
      yearLevel: yearAccount.yearLevel,
      name: yearAccount.name,
      currency: yearAccount.currency,
      openingBalance: Number(yearAccount.openingBalance),
      approvedIncome: Number(approvedIncome),
      approvedExpense: Number(approvedExpense),
      balance,
    };
  }
}
