import { CanActivate, ExecutionContext, ForbiddenException, Injectable } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { Role } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { ROLES_KEY } from './roles.decorator';
import { YEAR_SCOPE_PARAM_KEY } from './year-scope.decorator';
import { AuthenticatedRequest } from '../auth/auth.guard';

/**
 * Enforces `role + assigned_year + action + resource` (Security Model
 * Section 3). Must run AFTER AuthGuard (needs request.user already set).
 *
 * Route protection is opt-in via decorators:
 *   @Roles(Role.TREASURER, Role.BRANCH_HEAD)
 *   @YearScopeParam('yearAccountId')   // only if the route touches one year
 *
 * A route with NO @Roles() decorator is NOT protected by this guard at
 * all — it will be allowed through. Every controller in this codebase
 * should have @Roles() on every handler; there is deliberately no
 * "default deny" here yet because retrofitting that safely requires
 * auditing every existing route, which hasn't happened. Flagging this as
 * a known gap rather than a silent assumption.
 */
@Injectable()
export class RbacGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly prisma: PrismaService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const requiredRoles = this.reflector.getAllAndOverride<Role[] | undefined>(ROLES_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);

    if (!requiredRoles || requiredRoles.length === 0) {
      return true;
    }

    const request = context.switchToHttp().getRequest<AuthenticatedRequest>();
    const user = request.user;

    if (!user || !requiredRoles.includes(user.role)) {
      throw new ForbiddenException('You do not have permission to access this resource.');
    }

    const yearScopeParam = this.reflector.getAllAndOverride<string | undefined>(YEAR_SCOPE_PARAM_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);

    if (!yearScopeParam) {
      return true;
    }

    // Branch Head is branch-wide by design (02_ROLE_PERMISSION_MATRIX.md
    // Section 2) — no per-year check needed.
    if (user.role === Role.BRANCH_HEAD) {
      return true;
    }

    const yearAccountId =
      request.params?.[yearScopeParam] ??
      (request.body as Record<string, unknown> | undefined)?.[yearScopeParam];

    if (!yearAccountId || typeof yearAccountId !== 'string') {
      // Fail closed: a route that declares a year scope check but can't
      // find the value to check is a bug, not an authorization pass.
      throw new ForbiddenException('Year scope could not be determined for this request.');
    }

    if (user.role === Role.TREASURER) {
      const assignment = await this.prisma.userYearAssignment.findFirst({
        where: {
          userId: user.id,
          yearAccountId,
          activeTo: null,
        },
      });

      if (!assignment) {
        // Deliberately the same error/shape as any other authorization
        // failure — do not leak whether the yearAccountId exists at all,
        // per Security Model Section 7 ("consistent error messages
        // without excessive internal detail").
        throw new ForbiddenException('You do not have permission to access this resource.');
      }

      return true;
    }

    // STUDENT should not normally reach a year-scoped route at all (their
    // access is branch-wide read via non-scoped endpoints) — deny by
    // default rather than assume a read-only exception applies.
    throw new ForbiddenException('You do not have permission to access this resource.');
  }
}
