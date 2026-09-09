import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { RbacModule } from '../rbac/rbac.module';
import { YearAccountsController } from './year-accounts.controller';
import { YearAccountsService } from './year-accounts.service';

@Module({
  imports: [AuthModule, RbacModule],
  controllers: [YearAccountsController],
  providers: [YearAccountsService],
})
export class YearAccountsModule {}
