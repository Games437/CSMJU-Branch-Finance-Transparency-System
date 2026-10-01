// AMENDED 2026-09-27 (tech-stack.md v1.1, Prisma 7.9.1 driver-adapter bump):
// Prisma 7 moved the Migrate/Studio/db push connection string out of
// schema.prisma's `datasource { url = ... }` (no longer valid — see the
// AMENDED comment there) and into this file. Application code does NOT
// read this file; it builds its own PrismaPg driver adapter directly from
// DATABASE_URL (see src/prisma/prisma.service.ts).
import 'dotenv/config';
import { defineConfig, env } from 'prisma/config';

export default defineConfig({
  schema: 'prisma/schema.prisma',
  migrations: {
    path: 'prisma/migrations',
    seed: 'ts-node prisma/seed.ts',
  },
  datasource: {
    url: env('DATABASE_URL'),
  },
});
