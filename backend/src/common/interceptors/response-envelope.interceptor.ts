import { CallHandler, ExecutionContext, Injectable, NestInterceptor } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { Observable } from 'rxjs';
import { map } from 'rxjs/operators';
import { SKIP_ENVELOPE_KEY } from '../skip-envelope.decorator';

interface PaginatedResult {
  items: unknown[];
  page: number;
  pageSize: number;
  total: number;
}

function isPaginatedResult(value: unknown): value is PaginatedResult {
  return (
    typeof value === 'object' &&
    value !== null &&
    Array.isArray((value as Record<string, unknown>).items) &&
    typeof (value as Record<string, unknown>).page === 'number' &&
    typeof (value as Record<string, unknown>).pageSize === 'number' &&
    typeof (value as Record<string, unknown>).total === 'number'
  );
}

/**
 * Base standards item #3 (api-conventions.md Section 3/5): every
 * endpoint's successful response must be wrapped as
 * { success: true, data, meta? }. Applied globally in main.ts via
 * app.useGlobalInterceptors — one point, not one addition per
 * controller — with @SkipEnvelope() as the explicit opt-out (see that
 * file for why HealthController needs it and EvidenceController's
 * download() does not).
 *
 * Handles the one existing shape that needs splitting into data+meta:
 * TransactionsService.list()'s { items, page, pageSize, total } becomes
 * { data: items, meta: { page, per_page, total } }, matching
 * api-conventions.md Section 5's pagination example exactly
 * (per_page, not pageSize, in the wire format — pageSize remains the
 * internal/DTO name since renaming that too is base item #5's job, not
 * this one's).
 *
 * This is the ONLY endpoint shape in the codebase that needed special
 * handling as of this change — everything else (single objects, plain
 * arrays like GET /year-accounts or GET /approvals/pending) just goes
 * straight into `data` unchanged.
 */
@Injectable()
export class ResponseEnvelopeInterceptor implements NestInterceptor {
  constructor(private readonly reflector: Reflector) {}

  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    const skip = this.reflector.getAllAndOverride<boolean | undefined>(SKIP_ENVELOPE_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);

    if (skip) {
      return next.handle();
    }

    return next.handle().pipe(
      map((result: unknown) => {
        if (isPaginatedResult(result)) {
          const { items, page, pageSize, total } = result;
          return {
            success: true,
            data: items,
            meta: { page, per_page: pageSize, total },
          };
        }

        return { success: true, data: result };
      }),
    );
  }
}
