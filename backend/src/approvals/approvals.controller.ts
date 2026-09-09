import { Body, Controller, Get, Param, Post, UseGuards } from '@nestjs/common';
import { Role } from '@prisma/client';
import { AuthGuard } from '../auth/auth.guard';
import { RbacGuard } from '../rbac/rbac.guard';
import { Roles } from '../rbac/roles.decorator';
import { CurrentUser } from '../common/current-user.decorator';
import { AuthenticatedUser } from '../auth/interfaces/authenticated-user.interface';
import { ApprovalsService } from './approvals.service';
import { RejectTransactionDto } from './dto/reject-transaction.dto';
import { VoidTransactionDto } from './dto/void-transaction.dto';

// No @YearScopeParam() anywhere in this controller: every action here is
// @Roles(Role.BRANCH_HEAD) only, and Branch Head is branch-wide by design
// (Role Matrix Section 2) — there is no year to scope against.
@Controller('api/v1')
@UseGuards(AuthGuard, RbacGuard)
export class ApprovalsController {
  constructor(private readonly approvalsService: ApprovalsService) {}

  @Get('approvals/pending')
  @Roles(Role.BRANCH_HEAD)
  listPending() {
    return this.approvalsService.listPending();
  }

  @Post('transactions/:transactionId/approve')
  @Roles(Role.BRANCH_HEAD)
  approve(@CurrentUser() user: AuthenticatedUser, @Param('transactionId') transactionId: string) {
    return this.approvalsService.approve(user, transactionId);
  }

  @Post('transactions/:transactionId/reject')
  @Roles(Role.BRANCH_HEAD)
  reject(
    @CurrentUser() user: AuthenticatedUser,
    @Param('transactionId') transactionId: string,
    @Body() dto: RejectTransactionDto,
  ) {
    return this.approvalsService.reject(user, transactionId, dto);
  }

  @Post('transactions/:transactionId/confirm-income')
  @Roles(Role.BRANCH_HEAD)
  confirmIncome(@CurrentUser() user: AuthenticatedUser, @Param('transactionId') transactionId: string) {
    return this.approvalsService.confirmIncome(user, transactionId);
  }

  @Post('transactions/:transactionId/void')
  @Roles(Role.BRANCH_HEAD)
  void_(
    @CurrentUser() user: AuthenticatedUser,
    @Param('transactionId') transactionId: string,
    @Body() dto: VoidTransactionDto,
  ) {
    return this.approvalsService.void(user, transactionId, dto);
  }
}
