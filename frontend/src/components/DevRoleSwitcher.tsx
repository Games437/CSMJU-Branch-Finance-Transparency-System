"use client";

import { DEV_USERS, useDevAuth } from "@/lib/dev-auth";

/**
 * DEV-ONLY. Fixed banner for switching which seeded user the frontend
 * acts as. This entire component should be deleted once real SSO auth
 * replaces the dev header stub — it exists only because there is
 * currently no other way to test role-specific views.
 */
export function DevRoleSwitcher() {
  const { externalUserId, role, setActingAs } = useDevAuth();

  return (
    <div className="border-b-2 border-brass bg-brassSoft px-4 py-2 text-sm text-ink">
      <div className="mx-auto flex max-w-5xl flex-wrap items-center gap-3">
        <span className="font-semibold uppercase tracking-wide text-inkFaint">
          Dev: acting as
        </span>
        {DEV_USERS.map((u) => (
          <button
            key={u.externalUserId}
            onClick={() => setActingAs(u.externalUserId)}
            className={`rounded-full border px-3 py-1 transition-colors ${
              externalUserId === u.externalUserId
                ? "border-jade bg-jade text-white"
                : "border-paperLine bg-white text-ink hover:border-jade"
            }`}
          >
            {u.label}
          </button>
        ))}
        {role && <span className="ml-auto text-inkFaint">role: {role}</span>}
      </div>
    </div>
  );
}
