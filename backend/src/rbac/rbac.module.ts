import { Global, Module } from '@nestjs/common';
import { RbacGuard } from './rbac.guard';
import { YearScopeService } from './year-scope.service';

// @Global(): same rationale as AuthModule — RbacGuard is applied via
// @UseGuards() in every feature controller, so it must be resolvable
// without every module remembering to import RbacModule explicitly.
@Global()
@Module({
  providers: [RbacGuard, YearScopeService],
  exports: [RbacGuard, YearScopeService],
})
export class RbacModule {}
