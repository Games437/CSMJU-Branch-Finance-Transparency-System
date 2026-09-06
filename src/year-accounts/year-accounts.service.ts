import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import { AuthenticatedUser } from '../auth/interfaces/authenticated-user.interface';

@Injectable()
export class YearAccountsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  async listAll() {
    return this.prisma.yearAccount.findMany({
      where: { active: true },
      orderBy: { yearLevel: 'asc' },
      select: {
        id: true,
        yearLevel: true,
        name: true,
        entryAcademicYearLabel: true,
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
    // sum — see approvals.service.ts, which enforces that transition
    // atomically.
    const [incomeAgg, expenseAgg, pendingExpenseAgg] = await Promise.all([
      this.prisma.transaction.aggregate({
        where: { yearAccountId, type: 'INCOME', status: 'APPROVED' },
        _sum: { amount: true },
      }),
      this.prisma.transaction.aggregate({
        where: { yearAccountId, type: 'EXPENSE', status: 'APPROVED' },
        _sum: { amount: true },
      }),
      // RESOLVED (Section 31 #4): display-only, does not affect
      // `balance` above and never blocks creating/approving anything —
      // CSMJU chose to surface this figure so a Treasurer/Branch Head
      // can see it before deciding to submit or approve a new expense,
      // rather than have the system enforce a hard cap. If that changes
      // later (Option B: reject the action once approved + pending
      // would go negative), enforcing it belongs in
      // TransactionsService.createExpense / ApprovalsService.approve,
      // not here — this field would still be useful as the number that
      // check reads from.
      this.prisma.transaction.aggregate({
        where: { yearAccountId, type: 'EXPENSE', status: 'PENDING' },
        _sum: { amount: true },
      }),
    ]);

    const { approvedIncome, approvedExpense, balance } = this.calculateBalance(
      yearAccount.openingBalance,
      incomeAgg._sum.amount,
      expenseAgg._sum.amount,
    );
    const pendingExpenseTotal = Number(pendingExpenseAgg._sum.amount ?? 0);

    return {
      yearAccountId: yearAccount.id,
      yearLevel: yearAccount.yearLevel,
      name: yearAccount.name,
      currency: yearAccount.currency,
      openingBalance: Number(yearAccount.openingBalance),
      approvedIncome,
      approvedExpense,
      balance,
      pendingExpenseTotal,
    };
  }

  /**
   * RESOLVED (Section 31 #1, #15, #16): runs once per academic year,
   * Branch Head only. Every active cohort advances one year_level; the
   * cohort at year_level 4 graduates (archived, active=false) instead of
   * advancing to 5; a brand new Year-1 cohort is created for the
   * incoming class. Each cohort's YearLevelPeriod is closed (with a
   * closing-balance snapshot) and, for cohorts that advance rather than
   * graduate, a new period is opened.
   *
   * Ordered by yearLevel DESC (4 -> 1) and run inside one transaction:
   * the partial unique index on (year_level WHERE active) would reject
   * promoting Year-3 to Year-4 while the OLD Year-4 cohort is still
   * active — archiving Year-4 first, before promoting Year-3 into that
   * slot, avoids that collision entirely.
   */
  async advanceAcademicYear(user: AuthenticatedUser, newAcademicYear: string) {
    return this.prisma.$transaction(async (tx) => {
      const alreadyAdvanced = await tx.yearLevelPeriod.findFirst({
        where: { academicYear: newAcademicYear },
      });
      if (alreadyAdvanced) {
        // Idempotency guard: this is a once-a-year, high-stakes,
        // hard-to-undo operation. Running it twice for the same academic
        // year must be a no-op rejection, not a second silent
        // graduation/promotion pass.
        throw new ConflictException(`Academic year ${newAcademicYear} has already been advanced to.`);
      }

      const activeCohorts = await tx.yearAccount.findMany({
        where: { active: true },
        orderBy: { yearLevel: 'desc' },
      });

      let graduatedCount = 0;
      let promotedCount = 0;

      for (const cohort of activeCohorts) {
        const [incomeAgg, expenseAgg] = await Promise.all([
          tx.transaction.aggregate({
            where: { yearAccountId: cohort.id, type: 'INCOME', status: 'APPROVED' },
            _sum: { amount: true },
          }),
          tx.transaction.aggregate({
            where: { yearAccountId: cohort.id, type: 'EXPENSE', status: 'APPROVED' },
            _sum: { amount: true },
          }),
        ]);
        const { balance } = this.calculateBalance(cohort.openingBalance, incomeAgg._sum.amount, expenseAgg._sum.amount);

        const currentPeriod = await tx.yearLevelPeriod.findFirst({
          where: { yearAccountId: cohort.id, endedAt: null },
        });
        if (currentPeriod) {
          await tx.yearLevelPeriod.update({
            where: { id: currentPeriod.id },
            data: { endedAt: new Date(), closingBalance: balance },
          });
        }

        if (cohort.yearLevel >= 4) {
          await tx.yearAccount.update({
            where: { id: cohort.id },
            data: { active: false },
          });
          graduatedCount += 1;
        } else {
          const newLevel = cohort.yearLevel + 1;
          await tx.yearAccount.update({
            where: { id: cohort.id },
            data: { yearLevel: newLevel },
          });
          await tx.yearLevelPeriod.create({
            data: { yearAccountId: cohort.id, academicYear: newAcademicYear, yearLevel: newLevel },
          });
          promotedCount += 1;
        }
      }

      const newCohort = await tx.yearAccount.create({
        data: {
          yearLevel: 1,
          name: `Year 1 (${newAcademicYear})`,
          entryAcademicYearLabel: newAcademicYear,
          openingBalance: 0,
        },
      });
      await tx.yearLevelPeriod.create({
        data: { yearAccountId: newCohort.id, academicYear: newAcademicYear, yearLevel: 1 },
      });

      await this.audit.record(
        {
          actorId: user.id,
          action: 'ADVANCE_ACADEMIC_YEAR',
          targetType: 'AcademicYear',
          targetId: newCohort.id, // no better single target — this is a branch-wide event
          afterJson: { newAcademicYear, graduatedCount, promotedCount, newCohortId: newCohort.id },
        },
        tx,
      );

      return {
        newAcademicYear,
        graduatedCount,
        promotedCount,
        newYear1CohortId: newCohort.id,
      };
    });
  }

  /**
   * Pure arithmetic only — deliberately takes already-fetched aggregate
   * values rather than a Prisma client + querying itself. An earlier
   * version tried to share the QUERYING too via a hand-written structural
   * interface meant to accept either PrismaService or a $transaction's
   * scoped client, but Prisma's real generated `aggregate` signature uses
   * more specific literal/conditional types than that interface could
   * correctly approximate — it type-checked against a sandbox stub during
   * development but failed to compile against the real generated Prisma
   * Client (`_sum.amount` needs the literal type `true`, not `boolean`,
   * among other mismatches). Keeping this function pure sidesteps needing
   * to match Prisma's client types at all.
   */
  private calculateBalance(openingBalance: unknown, approvedIncomeSum: unknown, approvedExpenseSum: unknown) {
    const approvedIncome = Number(approvedIncomeSum ?? 0);
    const approvedExpense = Number(approvedExpenseSum ?? 0);
    const balance = Number(openingBalance) + approvedIncome - approvedExpense;

    return { approvedIncome, approvedExpense, balance };
  }
}
