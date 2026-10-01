// ============================================================================
// Error-code -> UI message/treatment mapping.
//
// This is the VERIFIED-CORRECT table for this backend, not the org's stale
// ui-design-system.md doc (that doc was written for a 37-subsystem platform
// with an API Gateway/different auth model). Two deliberate corrections
// vs. that doc:
//   - VALIDATION_ERROR is HTTP 400 here, not 422.
//   - There is no `X-RateLimit-Reset` header on this backend; rate-limit/
//     unavailable responses carry a standard `Retry-After` header in
//     seconds instead.
//
// This module only maps a code -> { uiTreatment, message }. It does not
// change how requests are made, how errors are thrown, or how
// externalUserId is attached — see lib/api.ts (untouched) for that.
// ============================================================================

import { ApiError } from "./api";

export type ErrorUiTreatment =
  | "silent"
  | "forbidden-card"
  | "empty-state"
  | "field-error"
  | "inline-alert"
  | "full-error-state";

export interface MappedError {
  treatment: ErrorUiTreatment;
  message: string | null;
}

const STATIC_MESSAGES: Record<string, string> = {
  UNAUTHORIZED: "",
  FORBIDDEN: "คุณไม่มีสิทธิ์เข้าถึงส่วนนี้ หากคิดว่าเป็นข้อผิดพลาด กรุณาติดต่อผู้ดูแลระบบย่อยนี้",
  NOT_FOUND: "ไม่พบข้อมูลที่คุณกำลังค้นหา อาจถูกลบไปแล้วหรือลิงก์ไม่ถูกต้อง",
  CONFLICT: "ข้อมูลถูกแก้ไขโดยผู้ใช้อื่นแล้ว กรุณารีเฟรชและลองใหม่",
  TOO_MANY_REQUESTS: "มีการใช้งานถี่เกินไป กรุณารอสักครู่แล้วลองใหม่",
  SERVICE_UNAVAILABLE: "ระบบขัดข้องชั่วคราว กรุณาลองอีกครั้ง",
  INTERNAL_ERROR: "ระบบขัดข้องชั่วคราว กรุณาลองอีกครั้ง หากยังพบปัญหา กรุณาแจ้งผู้ดูแลระบบ",
};

export const NETWORK_ERROR_MESSAGE =
  "เชื่อมต่อเซิร์ฟเวอร์ไม่ได้ กรุณาตรวจสอบอินเทอร์เน็ตแล้วลองอีกครั้ง";

const TREATMENT_BY_CODE: Record<string, ErrorUiTreatment> = {
  UNAUTHORIZED: "silent",
  FORBIDDEN: "forbidden-card",
  NOT_FOUND: "empty-state",
  VALIDATION_ERROR: "field-error",
  CONFLICT: "inline-alert",
  BAD_REQUEST: "inline-alert",
  TOO_MANY_REQUESTS: "inline-alert",
  SERVICE_UNAVAILABLE: "inline-alert",
  INTERNAL_ERROR: "full-error-state",
};

/**
 * Maps an ApiError's `.code` (when the backend's envelope included one) or
 * HTTP status (fallback) to a Thai message + UI treatment. `error.message`
 * is used verbatim for VALIDATION_ERROR/BAD_REQUEST (the backend already
 * sends a Thai, user-safe message for those two) — never a raw stack
 * trace or English exception text.
 */
export function mapApiError(err: unknown): MappedError {
  if (!(err instanceof ApiError)) {
    return { treatment: "inline-alert", message: NETWORK_ERROR_MESSAGE };
  }

  const code = err.code ?? codeFromStatus(err.status);

  if (code === "VALIDATION_ERROR" || code === "BAD_REQUEST") {
    return { treatment: TREATMENT_BY_CODE[code], message: err.message };
  }

  if (code && code in STATIC_MESSAGES) {
    return { treatment: TREATMENT_BY_CODE[code] ?? "inline-alert", message: STATIC_MESSAGES[code] || null };
  }

  // Unknown code: fall back to the generic full error state rather than
  // ever surfacing the raw message.
  return { treatment: "full-error-state", message: STATIC_MESSAGES.INTERNAL_ERROR };
}

function codeFromStatus(status: number): string | undefined {
  switch (status) {
    case 401:
      return "UNAUTHORIZED";
    case 403:
      return "FORBIDDEN";
    case 404:
      return "NOT_FOUND";
    case 400:
      return "BAD_REQUEST";
    case 409:
      return "CONFLICT";
    case 429:
      return "TOO_MANY_REQUESTS";
    case 503:
      return "SERVICE_UNAVAILABLE";
    case 500:
      return "INTERNAL_ERROR";
    default:
      return undefined;
  }
}

/** Reads `Retry-After` (seconds) off a Response, when present. */
export function retryAfterSeconds(response: Response): number | null {
  const header = response.headers.get("Retry-After");
  if (!header) return null;
  const parsed = Number(header);
  return Number.isFinite(parsed) ? parsed : null;
}
