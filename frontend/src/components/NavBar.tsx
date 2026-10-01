import type { DevRole } from "@/lib/dev-auth";

// Navigation link data, consumed by CsmjuAppShell (src/components/csmju/
// CsmjuAppShell.tsx), which renders the actual sidebar nav. Kept as plain
// data (not a rendering component) since the design-system rebuild folded
// the nav's visual rendering into the AppShell — see that file's header
// comment.
//
// `roles` scopes which signed-in role sees the link in the sidebar at all
// (undefined = every role, including before a dev role is picked). It is
// derived directly from — and must stay in sync with — the role check each
// destination page already enforces on its own:
//   /expenses      -> TREASURER only    (frontend/src/app/expenses/page.tsx)
//   /line-link     -> TREASURER only    (backend: LineAccountController is @Roles(TREASURER))
//   /approvals     -> BRANCH_HEAD only  (frontend/src/app/approvals/page.tsx)
//   /audit-logs    -> BRANCH_HEAD only  (frontend/src/app/audit-logs/page.tsx; GET /audit-logs 403s otherwise)
//   /year-accounts -> all three roles, scoped server-side per role (frontend/src/app/year-accounts/page.tsx)
//   /              -> all roles (dashboard content adapts per role, but the page itself never gates)
// This is a UI convenience only (don't show a link you'll immediately get
// bounced from) — it is NOT the access control. The real enforcement is the
// backend's own @Roles guards; each page's own role check above is what
// actually protects a direct URL visit, and stays exactly as-is.
export interface NavLink {
  href: string;
  label: string;
  labelEn: string;
  roles?: DevRole[];
}

export const LINKS: NavLink[] = [
  { href: "/", label: "ภาพรวม", labelEn: "Overview" },
  {
    href: "/expenses",
    label: "รายการเบิกจ่าย (เหรัญญิก)",
    labelEn: "Expenses",
    roles: ["TREASURER"],
  },
  {
    href: "/line-link",
    label: "เชื่อมต่อ LINE (เหรัญญิก)",
    labelEn: "LINE Link",
    roles: ["TREASURER"],
  },
  {
    href: "/approvals",
    label: "รายการรออนุมัติ (หัวหน้าสาขา)",
    labelEn: "Approvals",
    roles: ["BRANCH_HEAD"],
  },
  {
    href: "/year-accounts",
    label: "รายละเอียดบัญชีชั้นปี",
    labelEn: "Year Accounts",
    roles: ["STUDENT", "TREASURER", "BRANCH_HEAD"],
  },
  {
    href: "/audit-logs",
    label: "ประวัติการตรวจสอบ (หัวหน้าสาขา)",
    labelEn: "Audit Log",
    roles: ["BRANCH_HEAD"],
  },
];

// Links visible in the sidebar for a given signed-in role. `role` is null
// before a dev role is picked (see useDevAuth/DevAuthProvider), in which
// case only unrestricted links (e.g. "/") show.
export function linksForRole(role: DevRole | null): NavLink[] {
  return LINKS.filter((link) => !link.roles || (role !== null && link.roles.includes(role)));
}
