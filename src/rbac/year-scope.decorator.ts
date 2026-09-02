import { SetMetadata } from '@nestjs/common';

export const YEAR_SCOPE_PARAM_KEY = 'yearScopeParam';

/**
 * Marks a route as operating on a specific year account, and tells
 * RbacGuard which route param (or, if not found there, which body field)
 * holds the yearAccountId to check.
 *
 * TREASURER requests are checked against their active
 * UserYearAssignment for that year. BRANCH_HEAD is branch-wide and always
 * passes this check. STUDENT should generally only reach read endpoints
 * that don't need this decorator at all (branch-wide read).
 *
 * This exists specifically to close the IDOR/BOLA threat named in
 * Security Model Section 10 ("Treasurer changing yearAccountId to another
 * year") — every mutating endpoint that touches a year-scoped resource
 * MUST use this, not just @Roles().
 */
export const YearScopeParam = (paramName: string) => SetMetadata(YEAR_SCOPE_PARAM_KEY, paramName);
