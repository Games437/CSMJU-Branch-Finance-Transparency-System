import { Global, Module } from '@nestjs/common';
import { AUTH_STRATEGY } from './interfaces/authenticated-user.interface';
import { DevHeaderAuthStrategy } from './strategies/dev-header-auth.strategy';
import { AuthGuard } from './auth.guard';

// @Global(): Auth is a cross-cutting concern needed by every feature
// module's controllers, same as PrismaModule. Being global also fixes a
// subtle bug: without it, only modules that explicitly `imports:
// [AuthModule]` can resolve AUTH_STRATEGY / AuthGuard via DI, so any
// controller relying on AuthGuard without that import would fail at
// startup with "Nest can't resolve dependencies". Just @Injectable()-ing
// AuthModule elsewhere and exporting AuthGuard from it was not enough;
// AUTH_STRATEGY itself needed to be visible everywhere too. @Global()
// plus exporting both tokens closes this for every future module.
//
// REVERTED 2026-09-28: back to the dev-header stub (see
// dev-header-auth.strategy.ts) — the real Core Hub SSO integration
// (CoreHubJwtAuthStrategy / CoreHubTokenVerifierService / AuthController)
// has been removed from this checkout. Swap only the `useClass` line
// below again when re-integrating.
@Global()
@Module({
  providers: [
    // Swap this provider (only this line) once the real CSMJU SSO
    // integration contract is confirmed. See dev-header-auth.strategy.ts
    // for the full rationale.
    { provide: AUTH_STRATEGY, useClass: DevHeaderAuthStrategy },
    AuthGuard,
  ],
  exports: [AUTH_STRATEGY, AuthGuard],
})
export class AuthModule {}
