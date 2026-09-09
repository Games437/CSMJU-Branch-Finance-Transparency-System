import { SetMetadata } from '@nestjs/common';

export const IS_PUBLIC_KEY = 'isPublic';

/**
 * Explicit opt-out of RbacGuard's default-deny. No route in this
 * codebase currently needs this — every existing handler has @Roles()
 * applied (audited when default-deny was introduced). This exists so
 * that IF a genuinely public route is ever needed (a health check, for
 * example), the intent is a visible, deliberate decorator rather than
 * an accidentally-missing @Roles().
 *
 * Note this only affects RbacGuard. A truly public (unauthenticated)
 * route would also need to not run AuthGuard, since AuthGuard requires
 * an identity header/token regardless of role. This decorator alone
 * does not achieve that — it only means "any authenticated user, any
 * role, may access this," which is different from "no login required."
 */
export const Public = () => SetMetadata(IS_PUBLIC_KEY, true);
