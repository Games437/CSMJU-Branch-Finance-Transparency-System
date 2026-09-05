import { ForbiddenException, Injectable } from '@nestjs/common';
import { Role } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { AuthenticatedUser } from '../auth/interfaces/authenticated-user.interface';

/**
 * Centralizes the "which year(s) can this user touch" logic so it isn't
 * reimplemented slightly differently in TransactionsService,
 * ApprovalsService, and anywhere else that needs it later. This is the
 * codified answer to Security Model Section 10's #1 threat: IDOR/BOLA
 * across year accounts, and Role Matrix Section 4: "Treasurer Year 1 must
 * never access or mutate Year 2 resources by changing URL/API IDs."
 */
@Injectable()
export class YearScopeService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Returns the year account ids a TREASURER is currently allowed to
   * touch. Empty array if they have no active assignment (e.g. between
   * handovers) — callers must treat that as "scoped to nothing", not
   * "unscoped".
   */
  async getActiveYearAccountIds(userId: string): Promise<string[]> {
    const assignments = await this.prisma.userYearAssignment.findMany({
      where: { userId, activeTo: null },
      select: { yearAccountId: true },
    });
    return assignments.map((a) => a.yearAccountId);
  }

  /**
   * Throws ForbiddenException unless `user` is allowed to act on
   * `yearAccountId`. BRANCH_HEAD is always allowed (branch-wide).
   * STUDENT is never allowed here — students only reach unscoped
   * branch-wide read endpoints, never this check.
   */
  async assertCanAccessYear(user: AuthenticatedUser, yearAccountId: string): Promise<void> {
    if (user.role === Role.BRANCH_HEAD) {
      return;
    }

    if (user.role === Role.TREASURER) {
      const activeIds = await this.getActiveYearAccountIds(user.id);
      if (activeIds.includes(yearAccountId)) {
        return;
      }
    }

    // Deliberately identical error/shape regardless of WHY access was
    // denied (wrong role vs. wrong year) — per Security Model Section 7,
    // don't leak which reason applied.
    throw new ForbiddenException('You do not have permission to access this resource.');
  }
}
