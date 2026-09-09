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
  const headers: HeadersInit = {
    "Content-Type": "application/json",
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

export function listYearAccounts(externalUserId: string | null) {
  return apiFetch<YearAccountListItem[]>("/year-accounts", externalUserId);
}

export function getYearAccountSummary(externalUserId: string | null, yearAccountId: string) {
  return apiFetch<YearAccountSummary>(`/year-accounts/${yearAccountId}/summary`, externalUserId);
}

export function listPendingApprovals(externalUserId: string | null) {
  return apiFetch<PendingApprovalItem[]>("/approvals/pending", externalUserId);
}
