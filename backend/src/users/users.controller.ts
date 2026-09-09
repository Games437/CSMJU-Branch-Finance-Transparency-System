import { Controller, Get, UseGuards } from '@nestjs/common';
import { Role } from '@prisma/client';
import { AuthGuard } from '../auth/auth.guard';
import { RbacGuard } from '../rbac/rbac.guard';
import { Roles } from '../rbac/roles.decorator';
import { CurrentUser } from '../common/current-user.decorator';
import { AuthenticatedUser } from '../auth/interfaces/authenticated-user.interface';
import { UsersService } from './users.service';
import { getPermissionSet } from './permission-matrix';

@Controller('api/v1/me')
@UseGuards(AuthGuard, RbacGuard)
export class UsersController {
  constructor(private readonly usersService: UsersService) {}

  @Get()
  @Roles(Role.STUDENT, Role.TREASURER, Role.BRANCH_HEAD)
  async me(@CurrentUser() user: AuthenticatedUser) {
    const activeYearAssignments = await this.usersService.getActiveYearAssignments(user.id);

    return {
      id: user.id,
      externalUserId: user.externalUserId,
      displayName: user.displayName,
      role: user.role,
      // Only meaningful for TREASURER; empty array for other roles since
      // their scope is branch-wide by role, not by assignment row.
      activeYearAssignments,
    };
  }

  @Get('permissions')
  @Roles(Role.STUDENT, Role.TREASURER, Role.BRANCH_HEAD)
  permissions(@CurrentUser() user: AuthenticatedUser) {
    return getPermissionSet(user.role);
  }
}
