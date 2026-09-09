import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import { ValidationPipe } from '@nestjs/common';
import { AppModule } from './app.module';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true }));

  // CORS: needed because the Next.js frontend runs on a different
  // origin/port (localhost:3001 in dev) than this API (localhost:3000).
  // Without this, every browser fetch() call from the frontend fails
  // with a CORS error before it even reaches a route. Explicitly
  // allowing the dev auth stub's x-external-user-id header — the
  // default CORS header allowlist does not include custom headers.
  const corsOrigins = process.env.CORS_ORIGIN?.split(',') ?? ['http://localhost:3001'];
  app.enableCors({
    origin: corsOrigins,
    allowedHeaders: ['Content-Type', 'Authorization', 'x-external-user-id'],
    credentials: true,
  });

  const port = process.env.PORT ? Number(process.env.PORT) : 3000;
  await app.listen(port);
  // eslint-disable-next-line no-console
  console.log(`CSMJU-BFTS backend listening on port ${port}`);
}

bootstrap();
