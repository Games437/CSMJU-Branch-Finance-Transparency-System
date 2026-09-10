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
      message = body?.message ?? message;
    } catch {
      // response body wasn't JSON — keep the generic message
    }
    throw new ApiError(response.status, message);
  }

  // 204 No Content or empty body
  const text = await response.text();
  return (text ? JSON.parse(text) : undefined) as T;
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
export type TransactionStatus = "PENDING" | "APPROVED" | "REJECTED" | "VOIDED" | "NEEDS_REVIEW";

export interface Transaction {
  id: string;
  yearAccountId: string;
  type: TransactionType;
  status: TransactionStatus;
  amount: string; // Decimal -> numeric string over JSON, same as above
  transactionDate: string;
  description: string;
  category: string | null;
  sourceType: "MANUAL" | "BANK_IMPORT" | "ADJUSTMENT";
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
