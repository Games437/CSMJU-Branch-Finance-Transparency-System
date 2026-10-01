import { Injectable, OnModuleInit, OnModuleDestroy } from '@nestjs/common';
import { PrismaClient } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';

@Injectable()
export class PrismaService extends PrismaClient implements OnModuleInit, OnModuleDestroy {
  // AMENDED 2026-09-27 (tech-stack.md v1.1, Prisma 7.9.1 driver-adapter bump):
  // Prisma 7 removed `datasource { url }` from schema.prisma — application
  // code must build its own driver adapter from DATABASE_URL and pass it to
  // the PrismaClient constructor. See prisma.config.ts for the equivalent
  // wiring used by Migrate/Studio/db push.
  //
  // Built inside the constructor, not at module scope: this class is only
  // instantiated by Nest's DI container once ConfigModule.forRoot() (which
  // loads .env into process.env) has already run — a module-scope constant
  // here would race that and could read DATABASE_URL before it exists.
  constructor() {
    super({ adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL }) });
  }

  async onModuleInit() {
    await this.$connect();
  }

  async onModuleDestroy() {
    await this.$disconnect();
  }
}
