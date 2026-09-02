import { Role } from '@prisma/client';

/**
 * This is the ONLY shape the rest of the application (guards, controllers,
 * services) is allowed to depend on for "who is making this request".
 *
 * It intentionally does not expose anything about HOW identity was proven
 * (JWT claims, session cookie, header, etc.) — that is the AuthStrategy's
 * concern (see strategies/). When the real CSMJU Main Website SSO contract
 * is confirmed (Open Question #1 in the requirements doc), only a new
 * AuthStrategy implementation should be needed; this interface, the RBAC
 * guard, and every controller should be unaffected.
 */
export interface AuthenticatedUser {
  id: string; // internal users.id (uuid) — NOT the external SSO id
  externalUserId: string;
  role: Role;
  displayName: string;
}

export const AUTH_STRATEGY = Symbol('AUTH_STRATEGY');

export interface AuthStrategy {
  /**
   * Resolve the authenticated user from the incoming request, or throw
   * an UnauthorizedException if identity cannot be established.
   *
   * IMPORTANT: implementations must never trust a client-supplied role or
   * year value as authority (Security Model Section 2) — role must always
   * be looked up from the users table (or equivalent verified claim),
   * never taken from a header/body the caller controls.
   */
  resolve(request: unknown): Promise<AuthenticatedUser>;
}
