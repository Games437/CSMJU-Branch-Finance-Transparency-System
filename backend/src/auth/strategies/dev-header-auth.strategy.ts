import { Injectable, UnauthorizedException } from '@nestjs/common';
import { Request } from 'express';
import { PrismaService } from '../../prisma/prisma.service';
import { AuthStrategy, AuthenticatedUser } from '../interfaces/authenticated-user.interface';

/**
 * ============================================================================
 * DEV/LOCAL STUB — NOT SAFE FOR PRODUCTION AS-IS.
 * ============================================================================
 *
 * The real mechanism for how CSMJU Main Website hands off identity to this
 * subsystem is Open Question #1 in the requirements doc (SSO redirect?
 * signed JWT? shared session store?) and is explicitly unresolved.
 *
 * This stub exists so the RBAC guard, controllers, and services can be
 * built and tested NOW without waiting on that decision. It works like
 * this:
 *
 *   1. Client sends header `x-external-user-id: <id>`.
 *   2. We look up the User row with that externalUserId.
 *   3. We use THAT row's `role` column as the authority — the header only
 *      ever supplies an identity claim, never a role or year claim. This
 *      preserves the trust boundary Security Model Section 2 requires,
 *      even though the transport mechanism itself is a placeholder.
 *
 * When the real integration is confirmed, replace only this file (and its
 * registration in auth.module.ts) with one that verifies a real
 * token/session and then does the same "look role up from our own users
 * table" step. Nothing else in the app should need to change.
 * ============================================================================
 */
@Injectable()
export class DevHeaderAuthStrategy implements AuthStrategy {
  constructor(private readonly prisma: PrismaService) {}

  async resolve(request: Request): Promise<AuthenticatedUser> {
    const externalUserId = request.header('x-external-user-id');

    if (!externalUserId) {
      throw new UnauthorizedException('Missing x-external-user-id header (dev auth stub).');
    }

    const user = await this.prisma.user.findUnique({
      where: { externalUserId },
    });

    if (!user || !user.active) {
      throw new UnauthorizedException('Unknown or inactive user.');
    }

    return {
      id: user.id,
      externalUserId: user.externalUserId,
      role: user.role,
      displayName: user.displayName,
    };
  }
}
