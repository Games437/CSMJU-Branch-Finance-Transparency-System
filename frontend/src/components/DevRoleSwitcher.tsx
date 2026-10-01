"use client";

import { DEV_USERS, useDevAuth } from "@/lib/dev-auth";

/**
 * DEV-ONLY. Restyled to sit in the "user menu" slot at the bottom of
 * CsmjuAppShell's sidebar (in place of a real sign-out control, which
 * doesn't exist yet — see this file's original header comment, still
 * true). Calls the exact same `useDevAuth()`/`setActingAs()` mechanism as
 * before; only the JSX/classNames changed.
 */
export function DevRoleSwitcher() {
  const { externalUserId, role, setActingAs } = useDevAuth();

  return (
    <div className="rounded-xl border border-white/25 bg-white/10 p-3 text-white backdrop-blur-sm">
      <p className="mb-2 text-caption text-white/60">Dev: acting as</p>
      <div className="flex flex-col gap-1.5">
        {DEV_USERS.map((u) => (
          <button
            key={u.externalUserId}
            type="button"
            onClick={() => setActingAs(u.externalUserId)}
            aria-current={externalUserId === u.externalUserId ? "true" : undefined}
            className={`rounded-lg px-3 py-2 text-left text-label-md transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent ${
              externalUserId === u.externalUserId
                ? "bg-white/20 text-white"
                : "text-white/70 hover:bg-white/20 hover:text-white"
            }`}
          >
            {u.label}
          </button>
        ))}
      </div>
      {role && <p className="mt-2 text-caption text-white/50">role: {role}</p>}
    </div>
  );
}
