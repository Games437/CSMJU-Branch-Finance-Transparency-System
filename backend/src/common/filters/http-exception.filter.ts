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
 *   401 UnauthorizedException -> UNAUTHORIZED
 *   403 ForbiddenException    -> FORBIDDEN
 *   404 NotFoundException     -> NOT_FOUND
 *   409 ConflictException     -> CONFLICT
 *   422 (validation failure)  -> VALIDATION_ERROR
 *   anything unhandled        -> INTERNAL_ERROR (500)
 *
 * BadRequestException is special-cased instead of mapped by its
 * default 400 status: grep confirms the ONLY source of
 * BadRequestException anywhere in this codebase is Nest's
 * ValidationPipe (app.useGlobalPipes in main.ts) — no controller or
 * service throws it directly. api-conventions.md's standard code list
 * has no 400 entry at all; 422 VALIDATION_ERROR is the spec's slot for
 * "request data is invalid" (Section 4 table, row 4). So this filter
 * both recodes AND re-statuses a caught BadRequestException to 422,
 * rather than leaving Nest's default 400 on the wire.
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
      status: HttpStatus.UNPROCESSABLE_ENTITY,
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
      case HttpStatus.UNPROCESSABLE_ENTITY:
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
