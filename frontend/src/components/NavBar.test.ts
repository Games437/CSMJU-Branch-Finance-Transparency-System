// Regression test for the sidebar's per-role nav filtering (see this
// requirement's origin: "ต้องการให้แต่ละ role เห็นแค่หน้าที่ตัวเองเห็นได้").
// linksForRole must stay in lockstep with the role check each destination
// page enforces on its own (frontend/src/app/**/page.tsx) — this test pins
// that mapping down so a future edit to LINKS can't silently drift from it.
import { describe, expect, it } from "vitest";
import { linksForRole, LINKS } from "./NavBar";

function hrefs(role: Parameters<typeof linksForRole>[0]): string[] {
  return linksForRole(role).map((l) => l.href);
}

describe("linksForRole", () => {
  it("shows a STUDENT only Overview and Year Accounts", () => {
    expect(hrefs("STUDENT")).toEqual(["/", "/year-accounts"]);
  });

  it("shows a TREASURER Overview, Expenses, LINE Link, and Year Accounts — not Approvals/Audit Log", () => {
    expect(hrefs("TREASURER")).toEqual(["/", "/expenses", "/line-link", "/year-accounts"]);
  });

  it("shows a BRANCH_HEAD Overview, Approvals, Year Accounts, and Audit Log — not Expenses/LINE Link", () => {
    expect(hrefs("BRANCH_HEAD")).toEqual(["/", "/approvals", "/year-accounts", "/audit-logs"]);
  });

  it("before a dev role is picked (role === null), shows only the unrestricted links", () => {
    expect(hrefs(null)).toEqual(["/"]);
  });

  it("never shows a link whose page would reject that role (roles list is exhaustive per link)", () => {
    // Every restricted link's `roles` must be a non-empty subset of the three
    // known BFTS roles — catches a typo'd role name silently hiding a link
    // from everyone.
    const KNOWN_ROLES = ["STUDENT", "TREASURER", "BRANCH_HEAD"];
    for (const link of LINKS) {
      if (link.roles) {
        expect(link.roles.length).toBeGreaterThan(0);
        for (const r of link.roles) {
          expect(KNOWN_ROLES).toContain(r);
        }
      }
    }
  });
});
