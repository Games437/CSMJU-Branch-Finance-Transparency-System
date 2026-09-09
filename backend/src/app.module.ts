import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { PrismaModule } from './prisma/prisma.module';
import { AuthModule } from './auth/auth.module';
import { RbacModule } from './rbac/rbac.module';
import { AuditModule } from './audit/audit.module';
import { UsersModule } from './users/users.module';
import { YearAccountsModule } from './year-accounts/year-accounts.module';
import { TransactionsModule } from './transactions/transactions.module';
import { ApprovalsModule } from './approvals/approvals.module';
import { EvidenceModule } from './evidence/evidence.module';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    PrismaModule,
    AuthModule,
    RbacModule,
    AuditModule,
    UsersModule,
    YearAccountsModule,
    TransactionsModule,
    ApprovalsModule,
    EvidenceModule,
  ],
})
export class AppModule {}
