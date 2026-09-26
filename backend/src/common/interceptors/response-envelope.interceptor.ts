import { CallHandler, ExecutionContext, Injectable, NestInterceptor } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { Prisma } from '@prisma/client';
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

// Base standards item #5 (00_STANDARDS_COMPLIANCE.md Section 3 row 5 /
// api-conventions.md Section 6, data-dictionary.md Section 1): every
// response field must be snake_case, and the field that identifies a
// user must be named `username` everywhere. Applied here, at the same
// one point that already wraps every success response (base item #3),
// rather than renaming properties in every service/DTO.
//
// WIRE_KEY_OVERRIDES is the ONE targeted rename this needs: internally
// this codebase still calls the field `externalUserId` (Prisma model,
// AuthenticatedUser, auth strategy, dev header — none of that changes,
// confirmed with the user as the low-risk path over a full internal
// rename). Only the JSON key that reaches the network changes, from
// `external_user_id` (what mechanical snake_casing alone would produce)
// to `username` (what data-dictionary.md Section 1 actually requires).
// The frontend undoes both the casing and this rename symmetrically in
// api.ts's unwrapEnvelope(), so no existing component needs to change.
const WIRE_KEY_OVERRIDES: Record<string, string> = {
  external_user_id: 'username',
};

function toSnakeCase(key: string): string {
  return key.replace(/[A-Z]/g, (letter) => `_${letter.toLowerCase()}`);
}

function toWireKey(key: string): string {
  const snakeKey = toSnakeCase(key);
  return WIRE_KEY_OVERRIDES[snakeKey] ?? snakeKey;
}

/**
 * Recursively renames every object key from camelCase to snake_case
 * (applying WIRE_KEY_OVERRIDES along the way), leaving values alone.
 * Date and Prisma.Decimal are treated as leaves — both are class
 * instances that `typeof value === 'object'` would otherwise match, and
 * both already know how to serialize themselves correctly via their own
 * toJSON() (Decimal) or native Date→ISO-string behavior; recursing into
 * their internal properties would corrupt them (Decimal's `d`/`e`/`s`
 * internals are not data fields).
 */
function toWireFormat(value: unknown): unknown {
  if (value === null || value === undefined) {
    return value;
  }
  if (value instanceof Date || value instanceof Prisma.Decimal) {
    return value;
  }
  if (Array.isArray(value)) {
    return value.map((item) => toWireFormat(item));
  }
  if (typeof value === 'object') {
    const result: Record<string, unknown> = {};
    for (const [key, val] of Object.entries(value as Record<string, unknown>)) {
      result[toWireKey(key)] = toWireFormat(val);
    }
    return result;
  }
  return value;
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
            data: toWireFormat(items),
            meta: { page, per_page: pageSize, total },
          };
        }

        return { success: true, data: toWireFormat(result) };
      }),
    );
  }
}
