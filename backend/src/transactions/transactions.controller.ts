import { Body, Controller, Get, Param, Patch, Post, Query, UseGuards } from '@nestjs/common';
import { Role } from '@prisma/client';
import { AuthGuard } from '../auth/auth.guard';
import { RbacGuard } from '../rbac/rbac.guard';
import { Roles } from '../rbac/roles.decorator';
import { YearScopeParam } from '../rbac/year-scope.decorator';
import { CurrentUser } from '../common/current-user.decorator';
import { AuthenticatedUser } from '../auth/interfaces/authenticated-user.interface';
import { TransactionsService } from './transactions.service';
import { CreateExpenseDto } from './dto/create-expense.dto';
import { UpdateExpenseDto } from './dto/update-expense.dto';
import { ListTransactionsQueryDto } from './dto/list-transactions-query.dto';

@Controller()
@UseGuards(AuthGuard, RbacGuard)
export class TransactionsController {
  constructor(private readonly transactionsService: TransactionsService) {}

  @Get('transactions')
  @Roles(Role.STUDENT, Role.TREASURER, Role.BRANCH_HEAD)
  list(@CurrentUser() user: AuthenticatedUser, @Query() query: ListTransactionsQueryDto) {
    return this.transactionsService.list(user, query);
  }

  @Get('transactions/:transactionId')
  @Roles(Role.STUDENT, Role.TREASURER, Role.BRANCH_HEAD)
  getOne(@CurrentUser() user: AuthenticatedUser, @Param('transactionId') transactionId: string) {
    return this.transactionsService.getById(user, transactionId);
  }

  @Post('expenses')
  @Roles(Role.TREASURER, Role.BRANCH_HEAD)
  @YearScopeParam('yearAccountId') // checked against dto.yearAccountId in the request body
  createExpense(@CurrentUser() user: AuthenticatedUser, @Body() dto: CreateExpenseDto) {
    return this.transactionsService.createExpense(user, dto);
  }

  @Patch('expenses/:transactionId')
  @Roles(Role.TREASURER, Role.BRANCH_HEAD)
  updateExpense(
    @CurrentUser() user: AuthenticatedUser,
    @Param('transactionId') transactionId: string,
    @Body() dto: UpdateExpenseDto,
  ) {
    // No @YearScopeParam() here: the route has no yearAccountId to check
    // against (only transactionId) — TransactionsService.updateExpense
    // looks the transaction up first and does the equivalent check
    // itself. See its comments.
    return this.transactionsService.updateExpense(user, transactionId, dto);
  }
}
