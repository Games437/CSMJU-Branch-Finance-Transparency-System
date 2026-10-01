import 'reflect-metadata';
import { NestFactory, Reflector } from '@nestjs/core';
import { ValidationPipe } from '@nestjs/common';
import { AppModule } from './app.module';
import { ResponseEnvelopeInterceptor } from './common/interceptors/response-envelope.interceptor';
import { HttpExceptionFilter } from './common/filters/http-exception.filter';

async function bootstrap() {
  // rawBody: true — needed ONLY by LineSignatureGuard (line/guards/
  // line-signature.guard.ts), which must HMAC the exact bytes LINE sent
  // to verify x-line-signature; re-serializing the parsed req.body would
  // not byte-for-byte match what LINE signed. Nest still parses req.body
  // as JSON normally for every other route — this only additionally
  // exposes req.rawBody as a Buffer alongside it.
  const app = await NestFactory.create(AppModule, { rawBody: true });
  app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true }));

  // Base standards item #2 (api-conventions.md Section 1/7): every
  // versioned endpoint lives under /api/v1, set at this ONE point
  // instead of repeating 'api/v1' inside every @Controller() decorator
  // (5 separate places previously — easy to typo or forget on a new
  // controller). 'api/health' is excluded because the real
  // api-conventions.md §1 lists GET /api/health as one of exactly two
  // paths that live outside /api/v1/ — it's infrastructure plumbing,
  // not a versioned business resource. (AMENDED 2026-09-27, "ยึด repo
  // กลาง": this used to exclude bare 'health', from an older draft doc
  // — see health.controller.ts's own comment.)
  //
  app.setGlobalPrefix('api/v1', { exclude: ['api/health'] });

  // Base standards item #3 (api-conventions.md Section 3/5): wrap every
  // successful response as { success: true, data, meta? }, at this ONE
  // point rather than reshaping the return value in every controller
  // method. app.get(Reflector) (not `new Reflector()`) so the
  // interceptor's constructor-injected Reflector is the same instance
  // Nest's DI container already manages — needed for
  // reflector.getAllAndOverride to see @SkipEnvelope() metadata
  // correctly.
  app.useGlobalInterceptors(new ResponseEnvelopeInterceptor(app.get(Reflector)));

  // Base standards item #4 (api-conventions.md Section 4): wrap every
  // ERROR response as { success: false, error: { code, message,
  // details? } } with error.code restricted to the standard 6-value
  // list, at this ONE point rather than shaping errors ad hoc wherever
  // they're thrown. Mirrors the interceptor above, which does the same
  // for success responses (base item #3).
  app.useGlobalFilters(new HttpExceptionFilter());

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
