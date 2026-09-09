import { Global, Module } from '@nestjs/common';
import { AUTH_STRATEGY } from './interfaces/authenticated-user.interface';
import { DevHeaderAuthStrategy } from './strategies/dev-header-auth.strategy';
import { AuthGuard } from './auth.guard';

// @Global(): Auth is a cross-cutting concern needed by every feature
// module's controllers, same as PrismaModule. Being global also fixes a
// real NestJS DI gotcha: @UseGuards(AuthGuard) resolves AuthGuard's own
// constructor dependencies (AUTH_STRATEGY) against the CONSUMING
// controller's module context, not AuthModule's — so even importing
// AuthModule elsewhere and exporting AuthGuard from it was not enough;
// AUTH_STRATEGY itself needed to be visible everywhere too. @Global()
// plus exporting both tokens closes this for every future module.
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
