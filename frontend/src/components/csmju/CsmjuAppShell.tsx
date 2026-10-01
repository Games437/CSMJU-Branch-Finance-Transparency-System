"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import { linksForRole, type NavLink } from "@/components/NavBar";
import { DevRoleSwitcher } from "@/components/DevRoleSwitcher";
import { useDevAuth } from "@/lib/dev-auth";

// ============================================================================
// Replaces the old DevAuthProvider > DevRoleSwitcher > NavBar layout
// structure with the CSMJU brand AppShell: a persistent/drawer sidebar +
// sticky top bar + centered content area + footer. Purely presentational —
// it renders `children` untouched and reads only `usePathname()` for the
// active-link state, plus `useDevAuth()`'s `role` to decide which nav links
// to show (see NavBar.tsx#linksForRole — each destination page still gates
// itself by role on its own for actual access control; this only hides the
// links a role can't use so people aren't shown menu items that immediately
// bounce them).
// ============================================================================

const ICONS: Record<string, JSX.Element> = {
  "/": (
    <path d="M4 10.5L12 4l8 6.5V20a1 1 0 01-1 1h-4.5v-6h-5v6H5a1 1 0 01-1-1v-9.5z" />
  ),
  "/expenses": (
    <path d="M7 3h10a1 1 0 011 1v16l-2.5-1.5L13 20l-1.5-1.5L10 20l-1.5-1.5L6 20V4a1 1 0 011-1zm2 5h6M9 11h6M9 14h4" />
  ),
  "/line-link": (
    <path d="M17 8a5 5 0 10-10 0M12 3v2m-7 6a7 7 0 1014 0c0-3-2-5-3-7M8 21h8" />
  ),
  "/approvals": (
    <path d="M9 12l2 2 4-4M12 3l2.5 1.5L18 4l.5 3.5L21 10l-1.5 3L21 16l-2.5 2.5L18 22l-3.5-.5L12 23l-2.5-1.5L6 22l-.5-3.5L3 16l1.5-3L3 10l2.5-2.5L6 4l3.5.5z" />
  ),
  "/year-accounts": (
    <path d="M3 7a1 1 0 011-1h5l2 2h9a1 1 0 011 1v9a1 1 0 01-1 1H4a1 1 0 01-1-1V7z" />
  ),
  "/audit-logs": (
    <path d="M9 3h6a1 1 0 011 1v1h1a1 1 0 011 1v13a1 1 0 01-1 1H7a1 1 0 01-1-1V6a1 1 0 011-1h1V4a1 1 0 011-1zM9 11h6M9 15h6" />
  ),
};

function NavIcon({ href }: { href: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" className="h-5 w-5 shrink-0" aria-hidden="true">
      <g stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
        {ICONS[href] ?? <circle cx="12" cy="12" r="8" />}
      </g>
    </svg>
  );
}

function SidebarContent({ pathname, links }: { pathname: string; links: NavLink[] }) {
  return (
    <div className="flex h-full flex-col gap-6 p-4">
      <div className="flex items-center gap-3 rounded-xl bg-white px-3 py-3 shadow-sm">
        <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-primary-container text-on-primary font-display text-sm font-bold">
          CS
        </div>
        <div className="leading-tight">
          <p className="font-display text-label-md font-bold text-brand-navy">CSMJU BFTS</p>
          <p className="text-caption text-on-surface-variant">Branch Finance</p>
        </div>
      </div>

      <nav className="flex-1 space-y-1" aria-label="เมนูหลัก">
        {links.map((link) => {
          const active = pathname === link.href;
          return (
            <Link
              key={link.href}
              href={link.href}
              aria-current={active ? "page" : undefined}
              className={`flex items-center gap-3 rounded-lg border-l-4 px-3 py-2.5 text-label-md transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent ${
                active
                  ? "border-accent bg-white/10 text-white"
                  : "border-transparent text-white/70 hover:bg-white/5 hover:text-white"
              }`}
            >
              <NavIcon href={link.href} />
              <span className="flex min-w-0 flex-col">
                <span className="truncate">{link.label}</span>
                <span className="truncate text-caption text-white/50">{link.labelEn}</span>
              </span>
            </Link>
          );
        })}
      </nav>

      <DevRoleSwitcher />
    </div>
  );
}

export function CsmjuAppShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const { role } = useDevAuth();
  const [drawerOpen, setDrawerOpen] = useState(false);

  // Close the mobile drawer whenever the route changes.
  useEffect(() => {
    setDrawerOpen(false);
  }, [pathname]);

  const links = linksForRole(role);
  const year = new Date().getFullYear();

  return (
    <div className="flex min-h-screen bg-surface">
      {/* Desktop sidebar — persistent */}
      <aside className="brand-gradient hidden w-64 shrink-0 shadow-xl md:block">
        <SidebarContent pathname={pathname} links={links} />
      </aside>

      {/* Mobile drawer */}
      {drawerOpen && (
        <div className="fixed inset-0 z-40 md:hidden">
          <div
            className="absolute inset-0 bg-black/40 transition-opacity duration-300"
            onClick={() => setDrawerOpen(false)}
            aria-hidden="true"
          />
          <div className="brand-gradient absolute inset-y-0 left-0 w-64 shadow-xl transition-transform duration-300">
            <SidebarContent pathname={pathname} links={links} />
          </div>
        </div>
      )}

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="sticky top-0 z-30 flex h-16 items-center gap-3 border-b border-surface-variant bg-white px-4 shadow-sm md:px-8">
          <button
            type="button"
            aria-label="เปิดเมนู"
            onClick={() => setDrawerOpen(true)}
            className="flex h-10 w-10 items-center justify-center rounded-lg text-on-surface-variant hover:bg-surface-variant/50 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary-container md:hidden"
          >
            <svg viewBox="0 0 24 24" fill="none" className="h-6 w-6" aria-hidden="true">
              <path
                d="M4 6h16M4 12h16M4 18h16"
                stroke="currentColor"
                strokeWidth="1.5"
                strokeLinecap="round"
              />
            </svg>
          </button>
          <p className="font-display text-label-md font-semibold text-on-surface">CSMJU Branch Finance</p>
        </header>

        <main className="mx-auto w-full max-w-[1280px] flex-1 space-y-8 px-4 py-6 md:px-12 md:py-8">
          {children}
        </main>

        <footer className="border-t border-surface-variant px-4 py-6 md:px-12">
          <div className="mx-auto flex max-w-[1280px] flex-col gap-1 text-caption text-on-surface-variant sm:flex-row sm:items-center sm:justify-between">
            <span>สาขาวิชาวิทยาการคอมพิวเตอร์ คณะวิทยาศาสตร์ มหาวิทยาลัยแม่โจ้</span>
            <span>© {year}</span>
          </div>
        </footer>
      </div>
    </div>
  );
}
