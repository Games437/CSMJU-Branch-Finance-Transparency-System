import { CanActivate, ExecutionContext, ForbiddenException, Injectable } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { Role } from '@prisma/client';
import { ROLES_KEY } from './roles.decorator';
import { YEAR_SCOPE_PARAM_KEY } from './year-scope.decorator';
import { YearScopeService } from './year-scope.service';
import { IS_PUBLIC_KEY } from './public.decorator';
import { AuthenticatedRequest } from '../auth/auth.guard';

/**
 * Enforces `role + assigned_year + action + resource` (Security Model
 * Section 3). Must run AFTER AuthGuard (needs request.user already set).
 *
 * Route protection is opt-in via decorators:
 *   @Roles(Role.TREASURER, Role.BRANCH_HEAD)
 *   @YearScopeParam('yearAccountId')   // only if the route touches one year
 *
 * DEFAULT-DENY: a route with no @Roles() decorator is now REJECTED, not
 * allowed through. This was flipped from the original default-allow
 * behavior after auditing every existing controller in this codebase
 * and confirming every handler already had @Roles() applied — so this
 * change should affect zero currently-working routes, only future ones
 * that forget the decorator. Use @Public() (see public.decorator.ts)
 * for the rare route that should intentionally skip this check.
 *
 * The actual "can this user touch this year" decision is delegated to
 * YearScopeService, which is also used directly (not through this guard)
 * by TransactionsService/ApprovalsService for actions where the year has
 * to be looked up from a transactionId rather than read straight off the
 * route/body — see year-scope.service.ts for why that split exists.
 */
@Injectable()
export class RbacGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly yearScopeService: YearScopeService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const isPublic = this.reflector.getAllAndOverride<boolean | undefined>(IS_PUBLIC_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (isPublic) {
      return true;
    }

    const requiredRoles = this.reflector.getAllAndOverride<Role[] | undefined>(ROLES_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);

    if (!requiredRoles || requiredRoles.length === 0) {
      // Fail closed: no @Roles() and no @Public() means this route's
      // access policy was never decided. Denying is the safe default —
      // an accidentally-open endpoint is a much worse failure mode than
      // an accidentally-blocked one, which at least fails loudly and
      // gets noticed immediately during testing.
      throw new ForbiddenException(
        'This route has no access policy configured (@Roles() or @Public()) — denying by default.',
      );
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

    const yearAccountId =
      request.params?.[yearScopeParam] ??
      (request.body as Record<string, unknown> | undefined)?.[yearScopeParam];

    if (!yearAccountId || typeof yearAccountId !== 'string') {
      // Fail closed: a route that declares a year scope check but can't
      // find the value to check is a bug, not an authorization pass.
      throw new ForbiddenException('Year scope could not be determined for this request.');
    }

    await this.yearScopeService.assertCanAccessYear(user, yearAccountId);
    return true;
  }
}
