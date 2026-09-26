import { Controller, Get, Param, Query, UseGuards } from '@nestjs/common';
import { Role } from '@prisma/client';
import { AuthGuard } from '../auth/auth.guard';
import { RbacGuard } from '../rbac/rbac.guard';
import { Roles } from '../rbac/roles.decorator';
import { AuditService } from './audit.service';
import { ListAuditLogsQueryDto } from './dto/list-audit-logs-query.dto';

// Branch-Head-only for both routes: 02_ROLE_PERMISSION_MATRIX.md's
// "View full audit log" is ✗ for Student and left as an unresolved,
// denied-by-default ASSUMPTION for Treasurer's "limited scoped" cell
// (see permission-matrix.ts) — only Branch Head has a crisp ✓, so that's
// the only role granted here. No @YearScopeParam(): a year-scoped audit
// view for Treasurer would need that "limited scoped" definition first,
// which per the note above hasn't been decided.
@Controller()
@UseGuards(AuthGuard, RbacGuard)
export class AuditController {
  constructor(private readonly auditService: AuditService) {}

  @Get('audit-logs')
  @Roles(Role.BRANCH_HEAD)
  list(@Query() query: ListAuditLogsQueryDto) {
    return this.auditService.list(query);
  }

  @Get('transactions/:transactionId/audit')
  @Roles(Role.BRANCH_HEAD)
  auditForTransaction(@Param('transactionId') transactionId: string) {
    return this.auditService.listForTarget('Transaction', transactionId);
  }
}
