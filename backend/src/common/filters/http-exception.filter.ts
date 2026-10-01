import {
  ArgumentsHost,
  BadRequestException,
  Catch,
  ExceptionFilter,
  HttpException,
  HttpStatus,
  Logger,
} from '@nestjs/common';
import { Response } from 'express';

/**
 * Base standards item #4 (api-conventions.md Section 4): every error
 * response must be shaped as
 *   { success: false, error: { code, message, details? } }
 * with error.code restricted to the 6-value standard list from that
 * section's table. Applied globally in main.ts via
 * app.useGlobalFilters(new HttpExceptionFilter()) — one point, mirroring
 * how ResponseEnvelopeInterceptor wraps every SUCCESS response at one
 * point (base item #3) instead of reshaping errors in every catch block
 * or controller.
 *
 * Status -> code mapping (api-conventions.md Section 4 table):
 *   400 (validation failure)  -> VALIDATION_ERROR
 *   401 UnauthorizedException -> UNAUTHORIZED
 *   403 ForbiddenException    -> FORBIDDEN
 *   404 NotFoundException     -> NOT_FOUND
 *   409 ConflictException     -> CONFLICT
 *   anything unhandled        -> INTERNAL_ERROR (500)
 *
 * AMENDED 2026-09-27 (team decision: "ยึด repo กลาง"): this used to
 * re-status validation failures to 422, against an older draft doc.
 * The real api-conventions.md is explicit ("Use VALIDATION_ERROR with
 * 400, not 422 — this matches NestJS ValidationPipe defaults so no
 * custom exception filter is needed") — so this now keeps Nest's own
 * default 400 instead of remapping it, while still recoding it to the
 * standard `VALIDATION_ERROR` envelope shape.
 *
 * BadRequestException is still special-cased for its MESSAGE shape
 * (see resolveValidationError below): grep confirms the ONLY source of
 * BadRequestException anywhere in this codebase is Nest's ValidationPipe
 * (app.useGlobalPipes in main.ts) — no controller or service throws it
 * directly — so every BadRequestException reaching this filter is a
 * validation failure whose default message shape needs flattening into
 * `{ code: 'VALIDATION_ERROR', message, details }`.
 *
 * Anything that is not an HttpException at all (a thrown plain Error,
 * a Prisma error that escaped its service, etc.) is logged server-side
 * with its real stack trace and returned to the client as a generic
 * 500 INTERNAL_ERROR — the message/details are never the raw exception
 * text, so internals (stack traces, SQL, file paths) never leak into a
 * response body.
 */
@Catch()
export class HttpExceptionFilter implements ExceptionFilter {
  private readonly logger = new Logger(HttpExceptionFilter.name);

  catch(exception: unknown, host: ArgumentsHost): void {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse<Response>();

    const resolved = this.resolve(exception);

    if (resolved.status >= HttpStatus.INTERNAL_SERVER_ERROR) {
      this.logger.error(
        exception instanceof Error ? (exception.stack ?? exception.message) : String(exception),
      );
    }

    response.status(resolved.status).json({
      success: false,
      error:
        resolved.details !== undefined
          ? { code: resolved.code, message: resolved.message, details: resolved.details }
          : { code: resolved.code, message: resolved.message },
    });
  }

  private resolve(exception: unknown): {
    status: number;
    code: string;
    message: string;
    details?: unknown;
  } {
    if (exception instanceof BadRequestException) {
      return this.resolveValidationError(exception);
    }

    if (exception instanceof HttpException) {
      const status = exception.getStatus();
      const responseBody = exception.getResponse();
      const message =
        typeof responseBody === 'object' && responseBody !== null && 'message' in responseBody
          ? this.firstMessage((responseBody as { message: unknown }).message)
          : exception.message;
      return { status, code: this.codeForStatus(status), message };
    }

    return {
      status: HttpStatus.INTERNAL_SERVER_ERROR,
      code: 'INTERNAL_ERROR',
      message: 'เกิดข้อผิดพลาดที่ไม่คาดคิด กรุณาลองใหม่อีกครั้ง',
    };
  }

  /**
   * ValidationPipe's default thrown shape is
   * { statusCode: 400, message: string[] | string, error: 'Bad Request' }
   * (message is an array — one entry per failed class-validator rule —
   * whenever more than one field fails at once). details.errors keeps
   * the full list so a client/dev can see every failing field, while
   * message surfaces just the first one for a short human-readable line.
   *
   * status stays 400 (Nest's own default) — see this file's header
   * comment for why this no longer re-statuses to 422.
   */
  private resolveValidationError(exception: BadRequestException): {
    status: number;
    code: string;
    message: string;
    details: unknown;
  } {
    const body = exception.getResponse();
    const rawMessage =
      typeof body === 'object' && body !== null && 'message' in body
        ? (body as { message: unknown }).message
        : exception.message;
    const messages = Array.isArray(rawMessage) ? rawMessage.map(String) : [String(rawMessage)];

    return {
      status: HttpStatus.BAD_REQUEST,
      code: 'VALIDATION_ERROR',
      message: messages[0] ?? 'ข้อมูล request ไม่ถูกต้อง',
      details: { errors: messages },
    };
  }

  private firstMessage(message: unknown): string {
    if (Array.isArray(message)) {
      return String(message[0]);
    }
    return String(message);
  }

  private codeForStatus(status: number): string {
    switch (status) {
      case HttpStatus.UNAUTHORIZED:
        return 'UNAUTHORIZED';
      case HttpStatus.FORBIDDEN:
        return 'FORBIDDEN';
      case HttpStatus.NOT_FOUND:
        return 'NOT_FOUND';
      case HttpStatus.CONFLICT:
        return 'CONFLICT';
      case HttpStatus.BAD_REQUEST:
        // Reachable only if some future HttpException is thrown directly
        // with a 400 status outside ValidationPipe (resolveValidationError
        // above handles the actual BadRequestException case already, before
        // this switch is ever reached for it).
        return 'VALIDATION_ERROR';
      default:
        // No other HttpException status is thrown anywhere in this
        // codebase today (grep-verified alongside this change). A
        // future exception type landing here is a real gap, not a
        // guessed 7th code — api-conventions.md Section 4 is explicit
        // that adding a new code requires proposing it to PM3 first,
        // so this logs loudly instead of inventing one.
        this.logger.warn(`Unmapped HTTP status ${status} reached HttpExceptionFilter — falling back to INTERNAL_ERROR. Consider proposing a new standard code to PM3 if this is expected.`);
        return 'INTERNAL_ERROR';
    }
  }
}
