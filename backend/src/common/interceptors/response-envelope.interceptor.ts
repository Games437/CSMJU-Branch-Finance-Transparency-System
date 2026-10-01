import { CallHandler, ExecutionContext, Injectable, NestInterceptor } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { Observable } from 'rxjs';
import { map } from 'rxjs/operators';
import { SKIP_ENVELOPE_KEY } from '../skip-envelope.decorator';

interface PaginatedResult {
  items: unknown[];
  page: number;
  limit: number;
  total: number;
}

function isPaginatedResult(value: unknown): value is PaginatedResult {
  return (
    typeof value === 'object' &&
    value !== null &&
    Array.isArray((value as Record<string, unknown>).items) &&
    typeof (value as Record<string, unknown>).page === 'number' &&
    typeof (value as Record<string, unknown>).limit === 'number' &&
    typeof (value as Record<string, unknown>).total === 'number'
  );
}

/**
 * Base standards item #3 (api-conventions.md Section 3/5): every
 * endpoint's successful response must be wrapped as
 * { success: true, data, meta? }. Applied globally in main.ts via
 * app.useGlobalInterceptors — one point, not one addition per
 * controller — with @SkipEnvelope() as the explicit opt-out.
 *
 * AMENDED 2026-09-27 (team decision: "ยึด repo กลาง" — the real
 * csmju2030-standards repo is now the authoritative contract, replacing
 * an older draft doc that used to be attached to this project). Two
 * things this file used to do are now WRONG under the real contract and
 * have been removed:
 *
 * 1. It used to snake_case every response key. The real api-conventions.md
 *    (v1.1) §6/§9 is explicit that JSON response fields must stay
 *    camelCase — snake_case is only for database columns and OAuth
 *    fields — so no key renaming happens here at all any more. Prisma
 *    models already use camelCase, which is exactly what the wire format
 *    wants, so this interceptor now passes data straight through.
 * 2. It used to rename `external_user_id` to `username` on the wire, to
 *    match the old draft's data dictionary. The real data-dictionary.md
 *    explicitly forbids `username` as an alias for the identity field
 *    (DD-01) and doesn't send `username` in the token at all — so this
 *    rename is gone too. (Whether the internal field itself should also
 *    be renamed from `externalUserId` to `coreUserId` is a related but
 *    separate question, tracked apart from this change — see the
 *    delivery notes.)
 *
 * Pagination `meta` also changed to match api-conventions.md §3/§5
 * exactly: `limit` (not `per_page`) and an added `totalPages`.
 * AMENDED again the same day: the internal PaginatedResult contract
 * (what a service returns to this interceptor) is now keyed `limit` too,
 * not `pageSize` — it was found, while verifying this change, that the
 * incoming query DTOs (ListTransactionsQueryDto/ListAuditLogsQueryDto)
 * still bound the REQUEST-side query parameter as `pageSize`, meaning a
 * real client sending the now-correct `?limit=` per api-conventions.md
 * §5 was silently ignored by ValidationPipe's whitelist. Renaming end to
 * end (query DTO -> service -> this interceptor) closes that gap rather
 * than just fixing the response shape's label.
 *
 * Decimal/Date values need no special handling any more either — both
 * already serialize themselves correctly through their own toJSON()
 * when Nest calls JSON.stringify, so the recursive walker that used to
 * exist here purely to rename keys is gone entirely.
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
          const { items, page, limit, total } = result;
          return {
            success: true,
            data: items,
            meta: {
              total,
              page,
              limit,
              totalPages: limit > 0 ? Math.ceil(total / limit) : 0,
            },
          };
        }

        return { success: true, data: result };
      }),
    );
  }
}
