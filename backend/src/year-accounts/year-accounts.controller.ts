import { Body, Controller, Get, Param, Post, UseGuards } from '@nestjs/common';
import { Role } from '@prisma/client';
import { AuthGuard } from '../auth/auth.guard';
import { RbacGuard } from '../rbac/rbac.guard';
import { Roles } from '../rbac/roles.decorator';
import { CurrentUser } from '../common/current-user.decorator';
import { AuthenticatedUser } from '../auth/interfaces/authenticated-user.interface';
import { YearAccountsService } from './year-accounts.service';
import { AdvanceAcademicYearDto } from './dto/advance-academic-year.dto';

// No @YearScopeParam here: per 02_ROLE_PERMISSION_MATRIX.md, "View all
// year balances" is granted to ALL roles including Treasurer, unscoped —
// a Treasurer for Year 1 is allowed to READ Year 2's balance, just not
// mutate it. Year-scope enforcement belongs on the mutating endpoints in
// the transactions/approvals modules (advance-year below is branch-wide
// by nature, not scoped to any single year).
@Controller('year-accounts')
@UseGuards(AuthGuard, RbacGuard)
export class YearAccountsController {
  constructor(private readonly yearAccountsService: YearAccountsService) {}

  @Get()
  @Roles(Role.STUDENT, Role.TREASURER, Role.BRANCH_HEAD)
  list() {
    return this.yearAccountsService.listAll();
  }

  @Get(':yearAccountId/summary')
  @Roles(Role.STUDENT, Role.TREASURER, Role.BRANCH_HEAD)
  summary(@Param('yearAccountId') yearAccountId: string) {
    return this.yearAccountsService.getSummary(yearAccountId);
  }

  // RESOLVED (Section 31 #1, #15, #16): once-a-year, Branch-Head-only
  // action. Deliberately a POST with an explicit newAcademicYear body
  // field (not inferred from the current date) — this is a rare,
  // high-stakes, hard-to-undo operation; requiring the caller to state
  // the year explicitly makes accidental double-invocation (see the
  // service's idempotency guard) and off-by-one year mistakes easier to
  // catch in review/testing than a "just figure it out" endpoint would.
  @Post('advance-academic-year')
  @Roles(Role.BRANCH_HEAD)
  advanceAcademicYear(@CurrentUser() user: AuthenticatedUser, @Body() dto: AdvanceAcademicYearDto) {
    return this.yearAccountsService.advanceAcademicYear(user, dto.newAcademicYear);
  }
}
