import { SetMetadata } from '@nestjs/common';
import { Role } from '@prisma/client';

export const ROLES_KEY = 'roles';

/**
 * Declares which roles may access a route. Must be paired with RbacGuard.
 * This ALONE is not year-scope aware — combine with @YearScopeParam() for
 * any route that operates on a specific year account (Security Model
 * Section 3: "role + assigned_year + action + resource").
 */
export const Roles = (...roles: Role[]) => SetMetadata(ROLES_KEY, roles);
