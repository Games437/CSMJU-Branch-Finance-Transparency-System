"use client";

import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from "react";
import { ApiError, getLoginUrl, getMe, type MeResponse } from "./api";

/**
 * ============================================================================
 * REPLACES lib/dev-auth.tsx (deleted 2026-09-28, SSO cutover) — that
 * file's own header comment said it should be deleted, not adapted, once
 * real auth exists, so this is a fresh implementation, not a port of it.
 *
 * Real identity now comes from the `csmju_bfts_access_token` session
 * cookie the backend's /auth/callback sets after a real Core Hub SSO
 * round trip (backend's auth.controller.ts) — this context's only job is
 * to call `GET /api/v1/me` (which resolves that cookie server-side, see
 * CoreHubJwtAuthStrategy) once on mount and expose the result.
 *
 * SCOPE NOTE (flagged, not guessed): the user's explicit approval for
 * this delivery was auth-contract.md §5 (the backend SSO flow). §5's
 * follow-on, §7 "Silent re-SSO", additionally asks the frontend to
 * auto-navigate to /auth/login?next=<path> the moment ANY request comes
 * back 401, so Core Hub can transparently re-issue a token from its own
 * still-alive session and land the user back on the same page in about a
 * second — but §7 also requires that a page with an unsaved form must
 * NOT be redirected out from under the person without asking first,
 * which means auditing every form in this app (CreateExpenseForm,
 * ExpenseRow's EditForm/CancelSection, ApprovalRow's RejectForm,
 * line-link's code request) for "has the user typed something?" state.
 * That is real, separate work outside the §5 scope the user approved,
 * and not something to guess an implementation of. Deliberately NOT done
 * here — this context instead does the strictly safer subset of §7:
 *   - the initial /api/v1/me check (on page load) treats a 401 as
 *     "not signed in" (`signedOut`) and every page shows a plain
 *     sign-in link for it — no auto-redirect, so there is nothing to
 *     lose;
 *   - a 401 from any OTHER call (e.g. clicking "approve" after the
 *     session quietly expired) is left as a normal ApiError for that
 *     component's existing `catch (err) { ... instanceof ApiError }`
 *     block to show as its usual error banner — never a forced
 *     navigation, so a page mid-form is never at risk.
 * This never silently loses a person's unsaved input, at the cost of
 * not auto-recovering an expired session the way full §7 would — flagged
 * to PL alongside the rest of this delivery, same as the FRONTEND_URL
 * deviation documented in the backend's auth.controller.ts.
 * ============================================================================
 */

interface SessionContextValue {
  me: MeResponse | null;
  role: MeResponse["role"] | null;
  loading: boolean;
  // Set only for a genuine failure worth showing as an error banner:
  // a network/5xx failure, or a validly-signed token with no active
  // local account (auth-contract.md §8 — 403, "verified identity, not
  // enrolled here"). A 401 (no session at all) is NOT an error — see
  // `signedOut` below, which drives the plain "please sign in" UI.
  error: string | null;
  signedOut: boolean;
  refresh: () => Promise<void>;
}

const SessionContext = createContext<SessionContextValue | undefined>(undefined);

function currentPath(): string {
  if (typeof window === "undefined") return "/";
  return window.location.pathname + window.location.search;
}

/** Href for a real top-level navigation to sign in, next-ing back to the current page. */
export function signInHref(): string {
  return getLoginUrl(currentPath());
}

export function SessionProvider({ children }: { children: ReactNode }) {
  const [me, setMe] = useState<MeResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [signedOut, setSignedOut] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    setSignedOut(false);
    try {
      const result = await getMe();
      setMe(result);
    } catch (err) {
      setMe(null);
      if (err instanceof ApiError && err.status === 401) {
        setSignedOut(true);
      } else if (err instanceof ApiError && err.status === 403) {
        setError("บัญชีนี้ยังไม่ได้รับสิทธิ์ใช้งานระบบนี้ — ติดต่อหัวหน้าสาขาเพื่อขอเพิ่มสิทธิ์");
      } else {
        setError(err instanceof ApiError ? err.message : "ตรวจสอบสถานะการเข้าสู่ระบบไม่สำเร็จ");
      }
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  return (
    <SessionContext.Provider
      value={{ me, role: me?.role ?? null, loading, error, signedOut, refresh: load }}
    >
      {children}
    </SessionContext.Provider>
  );
}

export function useSession(): SessionContextValue {
  const ctx = useContext(SessionContext);
  if (!ctx) {
    throw new Error("useSession must be used within a SessionProvider");
  }
  return ctx;
}

/**
 * Shared "checking session / please sign in / session error" screen so
 * every page under app/ doesn't hand-roll the same three states with a
 * risk of drifting copy or a missed case — renders `children` only once
 * `useSession()` has resolved to an actual signed-in identity. Each
 * page's own role-specific gating (e.g. "หน้านี้สำหรับหัวหน้าสาขาเท่านั้น")
 * still happens inside `children`, after this has already ruled out
 * "not signed in at all" and "session check failed".
 */
export function SessionGate({
  children,
  maxWidthClassName = "max-w-3xl",
}: {
  children: ReactNode;
  maxWidthClassName?: string;
}) {
  const { loading, signedOut, error } = useSession();

  if (loading) {
    return (
      <main className={`mx-auto ${maxWidthClassName} p-6`}>
        <p className="text-inkFaint">กำลังตรวจสอบสถานะการเข้าสู่ระบบ...</p>
      </main>
    );
  }

  if (signedOut) {
    return (
      <main className={`mx-auto ${maxWidthClassName} p-6`}>
        <p className="mb-3 text-inkFaint">กรุณาเข้าสู่ระบบเพื่อใช้งาน</p>
        <a href={signInHref()} className="rounded-full bg-jade px-4 py-2 text-white hover:opacity-90">
          เข้าสู่ระบบ
        </a>
      </main>
    );
  }

  if (error) {
    return (
      <main className={`mx-auto ${maxWidthClassName} p-6`}>
        <div className="rounded-passbook border-2 border-rust bg-rustSoft p-4 text-rust">{error}</div>
      </main>
    );
  }

  return <>{children}</>;
}
