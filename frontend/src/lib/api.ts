// ============================================================================
// DEV-ONLY AUTH NOTE: every request here attaches an `x-external-user-id`
// header, matching the backend's DevHeaderAuthStrategy (see backend's
// src/auth/strategies/dev-header-auth.strategy.ts). This is NOT how real
// auth will work — the real CSMJU SSO handoff is still unresolved
// (Requirements doc Section 35 #1/#2). When that's decided, only this
// file's header-attaching logic should need to change; components below
// call `apiFetch` without knowing how identity gets attached.
// ============================================================================

const API_BASE_URL = process.env.NEXT_PUBLIC_API_BASE_URL ?? "http://localhost:3000/api/v1";

export class ApiError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message);
    this.name = "ApiError";
  }
}

export async function apiFetch<T>(
  path: string,
  externalUserId: string | null,
  init?: RequestInit,
): Promise<T> {
  const isFormData = init?.body instanceof FormData;
  const headers: HeadersInit = {
    // FormData sets its own multipart Content-Type (with boundary) —
    // setting it ourselves here would break the upload, since the
    // boundary parameter would be missing.
    ...(isFormData ? {} : { "Content-Type": "application/json" }),
    ...(externalUserId ? { "x-external-user-id": externalUserId } : {}),
    ...init?.headers,
  };

  const response = await fetch(`${API_BASE_URL}${path}`, { ...init, headers });

  if (!response.ok) {
    let message = `Request failed with status ${response.status}`;
    try {
      const body = await response.json();
      // FIX (found while adding base standards item #5 below): since the
      // backend's HttpExceptionFilter (base standards item #4) shipped,
      // every error body is { success: false, error: { code, message,
      // details? } } — the message moved off the top level into
      // `error.message`. This line still read `body?.message`, which is
      // now always undefined, so every error surfaced here fell back to
      // the generic "Request failed with status NNN" instead of the
      // backend's actual (Thai, specific) message. `body?.message` is
      // kept as a fallback only in case some response is ever missed by
      // the global filter.
      message = body?.error?.message ?? body?.message ?? message;
    } catch {
      // response body wasn't JSON — keep the generic message
    }
    throw new ApiError(response.status, message);
  }

  // 204 No Content or empty body
  const text = await response.text();
  if (!text) return undefined as T;

  const parsed: unknown = JSON.parse(text);
  return unwrapEnvelope(parsed) as T;
}

/**
 * BUGFIX: every endpoint response is wrapped by the backend's
 * ResponseEnvelopeInterceptor (base standards item #3) as
 * { success, data } or, for paginated list endpoints, as
 * { success, data, meta: { page, per_page, total } } — see
 * backend's src/common/interceptors/response-envelope.interceptor.ts.
 * apiFetch previously returned that raw envelope as-is instead of the
 * unwrapped payload the rest of this file's types (YearAccountListItem[],
 * MeResponse, TransactionListResponse, ...) actually describe, so every
 * caller — including the original dashboard/expenses pages, not just the
 * newer Approvals/Year Account Detail/Audit Log pages — got the envelope
 * object where it expected the real value (e.g. `yearAccounts.map` failing
 * because `yearAccounts` was `{success, data}`, not the array itself).
 * This reconstructs the pagination shape ({items, page, pageSize, total})
 * this file's list responses are typed as, from the wire's {data, meta}
 * shape, and otherwise just returns `data`.
 */
/**
 * Base standards item #5 (backend's response-envelope.interceptor.ts):
 * the backend now sends every field as snake_case, with the user-identity
 * field specifically renamed to `username` (data-dictionary.md Section 1
 * requires that exact name; mechanical snake_casing alone would have
 * produced `external_user_id`). This is the frontend's mirror-image
 * reverse transform, applied at the same one point unwrapEnvelope()
 * already occupies, so every existing component/page here keeps reading
 * `.yearAccountId`, `.createdAt`, `.externalUserId`, etc. exactly as
 * before — nothing below this file needed to change for the wire format
 * to become spec-compliant.
 */
const WIRE_KEY_OVERRIDES: Record<string, string> = {
  username: "externalUserId",
};

function fromWireKey(key: string): string {
  if (WIRE_KEY_OVERRIDES[key]) {
    return WIRE_KEY_OVERRIDES[key];
  }
  return key.replace(/_([a-z0-9])/g, (_match, ch: string) => ch.toUpperCase());
}

function fromWireFormat(value: unknown): unknown {
  if (value === null || value === undefined) {
    return value;
  }
  if (Array.isArray(value)) {
    return value.map((item) => fromWireFormat(item));
  }
  if (typeof value === "object") {
    const result: Record<string, unknown> = {};
    for (const [key, val] of Object.entries(value as Record<string, unknown>)) {
      result[fromWireKey(key)] = fromWireFormat(val);
    }
    return result;
  }
  return value;
}

function unwrapEnvelope(parsed: unknown): unknown {
  if (
    typeof parsed !== "object" ||
    parsed === null ||
    !("success" in parsed) ||
    !("data" in parsed)
  ) {
    // Not an envelope-shaped body (shouldn't happen for any endpoint this
    // file calls) — return as-is rather than guessing further.
    return parsed;
  }

  const envelope = parsed as { success: boolean; data: unknown; meta?: { page: number; per_page: number; total: number } };

  if (envelope.meta) {
    return {
      items: fromWireFormat(envelope.data),
      page: envelope.meta.page,
      pageSize: envelope.meta.per_page,
      total: envelope.meta.total,
    };
  }

  return fromWireFormat(envelope.data);
}

// ----------------------------------------------------------------------
// Types mirroring the backend's actual response shapes (see backend's
// src/year-accounts/year-accounts.service.ts and
// src/approvals/approvals.service.ts). Kept here rather than sharing a
// package with the backend for now — the two projects are deployed
// separately (see the Requirements doc's "Recommended Project
// Architecture" diagram) and don't share a monorepo/build pipeline yet.
// ----------------------------------------------------------------------

export interface YearAccountListItem {
  id: string;
  yearLevel: number;
  name: string;
  entryAcademicYearLabel: string | null;
  currency: string;
}

export interface YearAccountSummary {
  yearAccountId: string;
  yearLevel: number;
  name: string;
  currency: string;
  openingBalance: number;
  approvedIncome: number;
  approvedExpense: number;
  balance: number;
  pendingExpenseTotal: number;
}

export interface PendingApprovalItem {
  id: string;
  yearAccountId: string;
  type: "INCOME" | "EXPENSE" | "ADJUSTMENT";
  status: "PENDING" | "NEEDS_REVIEW";
  amount: string; // Prisma Decimal serializes as a numeric string over JSON
  description: string;
  transactionDate: string;
}

export type TransactionType = "INCOME" | "EXPENSE" | "ADJUSTMENT";
export type TransactionStatus = "PENDING" | "APPROVED" | "REJECTED" | "VOIDED" | "NEEDS_REVIEW" | "CANCELLED";

export interface Transaction {
  id: string;
  yearAccountId: string;
  type: TransactionType;
  status: TransactionStatus;
  amount: string; // Decimal -> numeric string over JSON, same as above
  transactionDate: string;
  description: string;
  category: string | null;
  sourceType: "MANUAL" | "BANK_IMPORT" | "ADJUSTMENT" | "LINE_REPORT";
  externalReference: string | null;
  createdBy: string;
  approvedBy: string | null;
  approvedAt: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface TransactionListResponse {
  items: Transaction[];
  page: number;
  pageSize: number;
  total: number;
}

export interface EvidenceMeta {
  id: string;
  originalFilename: string;
  mimeType: string;
  sizeBytes: number;
  version: number;
  isCurrent: boolean;
  uploadedAt: string;
}

export interface MeResponse {
  id: string;
  externalUserId: string;
  displayName: string;
  role: "STUDENT" | "TREASURER" | "BRANCH_HEAD";
  activeYearAssignments: {
    id: string;
    yearAccountId: string;
    yearAccount: { id: string; yearLevel: number; name: string };
  }[];
}

export function getMe(externalUserId: string | null) {
  return apiFetch<MeResponse>("/me", externalUserId);
}

export interface ListTransactionsParams {
  yearAccountId?: string;
  type?: TransactionType;
  status?: TransactionStatus;
  page?: number;
  pageSize?: number;
}

export function listTransactions(externalUserId: string | null, params: ListTransactionsParams = {}) {
  const search = new URLSearchParams();
  if (params.yearAccountId) search.set("yearAccountId", params.yearAccountId);
  if (params.type) search.set("type", params.type);
  if (params.status) search.set("status", params.status);
  if (params.page) search.set("page", String(params.page));
  if (params.pageSize) search.set("pageSize", String(params.pageSize));
  const qs = search.toString();
  return apiFetch<TransactionListResponse>(`/transactions${qs ? `?${qs}` : ""}`, externalUserId);
}

export interface CreateExpenseInput {
  yearAccountId: string;
  amount: number;
  transactionDate: string; // ISO date string, e.g. "2026-09-10"
  description: string;
  category?: string;
}

export function createExpense(externalUserId: string | null, input: CreateExpenseInput) {
  return apiFetch<Transaction>("/expenses", externalUserId, {
    method: "POST",
    body: JSON.stringify(input),
  });
}

export interface UpdateExpenseInput {
  amount?: number;
  transactionDate?: string;
  description?: string;
  category?: string;
}

export function updateExpense(externalUserId: string | null, transactionId: string, input: UpdateExpenseInput) {
  return apiFetch<Transaction>(`/expenses/${transactionId}`, externalUserId, {
    method: "PATCH",
    body: JSON.stringify(input),
  });
}

/**
 * Lets the Treasurer (or Branch Head) who created a still-PENDING expense
 * withdraw it before review — added on explicit request, since there was
 * no way to do this before (only edit existed). Transitions to the new
 * CANCELLED status; the transaction and its evidence are never deleted
 * (backend's transactions.service.ts#cancelExpense — no hard delete of
 * financial records, per 01_BUSINESS_RULES_SPECIFICATION.md Section 11).
 * Requires a reason, same as reject/void.
 */
export function cancelExpense(externalUserId: string | null, transactionId: string, reason: string) {
  return apiFetch<Transaction>(`/expenses/${transactionId}/cancel`, externalUserId, {
    method: "POST",
    body: JSON.stringify({ reason }),
  });
}

export function listEvidenceForTransaction(externalUserId: string | null, transactionId: string) {
  return apiFetch<EvidenceMeta[]>(`/expenses/${transactionId}/evidence`, externalUserId);
}

export function uploadEvidence(externalUserId: string | null, transactionId: string, file: File) {
  const formData = new FormData();
  formData.append("file", file);
  return apiFetch<EvidenceMeta>(`/expenses/${transactionId}/evidence`, externalUserId, {
    method: "POST",
    body: formData,
  });
}

/**
 * Evidence files are served through an authenticated endpoint (needs
 * the x-external-user-id header), so a plain <a href="..."> or <img
 * src="..."> can't be used directly — the browser wouldn't attach the
 * header. Fetches the file as a blob and returns an object URL the
 * caller can use in an <a>/<img>/<iframe>, then MUST revoke with
 * URL.revokeObjectURL when done (e.g. on unmount) to avoid leaking
 * memory.
 */
export async function fetchEvidenceObjectUrl(externalUserId: string | null, evidenceId: string): Promise<string> {
  const headers: HeadersInit = externalUserId ? { "x-external-user-id": externalUserId } : {};
  const response = await fetch(`${API_BASE_URL}/evidence/${evidenceId}`, { headers });
  if (!response.ok) {
    throw new ApiError(response.status, `Failed to fetch evidence file (status ${response.status}).`);
  }
  const blob = await response.blob();
  return URL.createObjectURL(blob);
}

export function listYearAccounts(externalUserId: string | null) {
  return apiFetch<YearAccountListItem[]>("/year-accounts", externalUserId);
}

export function getYearAccountSummary(externalUserId: string | null, yearAccountId: string) {
  return apiFetch<YearAccountSummary>(`/year-accounts/${yearAccountId}/summary`, externalUserId);
}

export function listPendingApprovals(externalUserId: string | null) {
  return apiFetch<PendingApprovalItem[]>("/approvals/pending", externalUserId);
}

export function approveTransaction(externalUserId: string | null, transactionId: string) {
  return apiFetch<Transaction>(`/transactions/${transactionId}/approve`, externalUserId, {
    method: "POST",
  });
}

export function rejectTransaction(externalUserId: string | null, transactionId: string, reason: string) {
  return apiFetch<Transaction>(`/transactions/${transactionId}/reject`, externalUserId, {
    method: "POST",
    body: JSON.stringify({ reason }),
  });
}

export function voidTransaction(externalUserId: string | null, transactionId: string, reason: string) {
  return apiFetch<Transaction>(`/transactions/${transactionId}/void`, externalUserId, {
    method: "POST",
    body: JSON.stringify({ reason }),
  });
}

export function confirmIncome(externalUserId: string | null, transactionId: string) {
  return apiFetch<Transaction>(`/transactions/${transactionId}/confirm-income`, externalUserId, {
    method: "POST",
  });
}

// ----------------------------------------------------------------------
// Audit log (Branch Head only — see backend's permission-matrix.ts's
// viewFullAuditLog: Student ✗, Treasurer left denied ["limited scoped" is
// an unresolved ASSUMPTION there, not implemented), Branch Head ✓. Both
// endpoints 403 for any other role, matching backend's audit.controller.ts.
// ----------------------------------------------------------------------

export interface AuditActor {
  id: string;
  externalUserId: string;
  displayName: string;
  role: "STUDENT" | "TREASURER" | "BRANCH_HEAD";
}

export interface AuditLogEntry {
  id: string;
  actorId: string | null;
  actor: AuditActor | null;
  action: string;
  targetType: string;
  targetId: string;
  yearAccountId: string | null;
  yearAccount: { id: string; name: string; yearLevel: number } | null;
  beforeJson: unknown;
  afterJson: unknown;
  metadataJson: unknown;
  ipAddress: string | null;
  userAgent: string | null;
  createdAt: string;
}

export interface AuditLogListResponse {
  items: AuditLogEntry[];
  page: number;
  pageSize: number;
  total: number;
}

export interface ListAuditLogsParams {
  yearAccountId?: string;
  action?: string;
  targetType?: string;
  page?: number;
  pageSize?: number;
}

export function listAuditLogs(externalUserId: string | null, params: ListAuditLogsParams = {}) {
  const search = new URLSearchParams();
  if (params.yearAccountId) search.set("yearAccountId", params.yearAccountId);
  if (params.action) search.set("action", params.action);
  if (params.targetType) search.set("targetType", params.targetType);
  if (params.page) search.set("page", String(params.page));
  if (params.pageSize) search.set("pageSize", String(params.pageSize));
  const qs = search.toString();
  return apiFetch<AuditLogListResponse>(`/audit-logs${qs ? `?${qs}` : ""}`, externalUserId);
}

export function getTransactionAuditTrail(externalUserId: string | null, transactionId: string) {
  return apiFetch<AuditLogEntry[]>(`/transactions/${transactionId}/audit`, externalUserId);
}

// ----------------------------------------------------------------------
// LINE OA quick-entry — account linking (TREASURER only, backend's
// line/line-account.controller.ts). The webhook itself (LINE's platform
// calling us) has no frontend counterpart — nothing here calls it.
// ----------------------------------------------------------------------

export interface LineLinkCodeResponse {
  code: string;
  expiresAt: string;
}

export interface LineLinkStatusResponse {
  linked: boolean;
  linkedAt: string | null;
}

export function generateLineLinkCode(externalUserId: string | null) {
  return apiFetch<LineLinkCodeResponse>("/line/link-codes", externalUserId, { method: "POST" });
}

export function getLineLinkStatus(externalUserId: string | null) {
  return apiFetch<LineLinkStatusResponse>("/line/link-status", externalUserId);
}

export function unlinkLine(externalUserId: string | null) {
  return apiFetch<{ unlinked: true }>("/line/link", externalUserId, { method: "DELETE" });
}
