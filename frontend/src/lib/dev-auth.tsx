"use client";

import { createContext, useContext, useEffect, useState, type ReactNode } from "react";

// ============================================================================
// DEV-ONLY. Real identity will come from the CSMJU Main Website SSO
// handoff (Requirements doc Section 35 #1/#2, still unresolved). Until
// then, this stands in for "who is logged in" by letting the person
// testing the frontend pick one of the externalUserIds already seeded
// on the backend (prisma/seed.ts: s1=STUDENT, t2=TREASURER, bh1=BRANCH_HEAD).
//
// This should be deleted (not adapted) once real auth exists — it is
// not a foundation to build real auth on top of, it's a placeholder
// that happens to share the same "externalUserId" concept the real
// auth strategy will also produce.
// ============================================================================

export type DevRole = "STUDENT" | "TREASURER" | "BRANCH_HEAD";

export const DEV_USERS: { externalUserId: string; label: string; role: DevRole }[] = [
  { externalUserId: "s1", label: "s1 — Student", role: "STUDENT" },
  { externalUserId: "t2", label: "t2 — Treasurer (Year 2)", role: "TREASURER" },
  { externalUserId: "bh1", label: "bh1 — Branch Head", role: "BRANCH_HEAD" },
];

const STORAGE_KEY = "csmju-bfts-dev-acting-as";

interface DevAuthContextValue {
  externalUserId: string | null;
  role: DevRole | null;
  setActingAs: (externalUserId: string) => void;
}

const DevAuthContext = createContext<DevAuthContextValue | undefined>(undefined);

export function DevAuthProvider({ children }: { children: ReactNode }) {
  const [externalUserId, setExternalUserId] = useState<string | null>(null);

  useEffect(() => {
    const stored = window.localStorage.getItem(STORAGE_KEY);
    if (stored) {
      setExternalUserId(stored);
    }
  }, []);

  const setActingAs = (id: string) => {
    window.localStorage.setItem(STORAGE_KEY, id);
    setExternalUserId(id);
  };

  const role = DEV_USERS.find((u) => u.externalUserId === externalUserId)?.role ?? null;

  return (
    <DevAuthContext.Provider value={{ externalUserId, role, setActingAs }}>
      {children}
    </DevAuthContext.Provider>
  );
}

export function useDevAuth(): DevAuthContextValue {
  const ctx = useContext(DevAuthContext);
  if (!ctx) {
    throw new Error("useDevAuth must be used within a DevAuthProvider");
  }
  return ctx;
}
