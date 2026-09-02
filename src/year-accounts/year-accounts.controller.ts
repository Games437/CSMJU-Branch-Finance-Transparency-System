import { Controller, Get, Param, UseGuards } from '@nestjs/common';
import { Role } from '@prisma/client';
import { AuthGuard } from '../auth/auth.guard';
import { RbacGuard } from '../rbac/rbac.guard';
import { Roles } from '../rbac/roles.decorator';
import { YearAccountsService } from './year-accounts.service';

// No @YearScopeParam here: per 02_ROLE_PERMISSION_MATRIX.md, "View all
// year balances" is granted to ALL roles including Treasurer, unscoped —
// a Treasurer for Year 1 is allowed to READ Year 2's balance, just not
// mutate it. Year-scope enforcement belongs on the mutating endpoints in
// the (not-yet-built) transactions/approvals modules.
@Controller('api/v1/year-accounts')
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
}
