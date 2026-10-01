// AMENDED 2026-09-27 (tech-stack.md v1.1, QA-01 test script): frontend had no
// tests at all before this. status-styles.ts is the single source of truth
// for status colors/labels shown across every page (expenses, approvals,
// audit log) — a wrong mapping here is a real user-facing bug (e.g. a
// rejected transaction shown in "approved" green), not a cosmetic one.
import { describe, expect, it } from "vitest";
import { statusBadgeClasses, statusLabelTh } from "./status-styles";

describe("statusBadgeClasses", () => {
  it("uses the success (settled) color only for APPROVED", () => {
    expect(statusBadgeClasses("APPROVED")).toContain("success");
  });

  it("uses the warning (pending) color for PENDING and NEEDS_REVIEW", () => {
    expect(statusBadgeClasses("PENDING")).toContain("amber");
    expect(statusBadgeClasses("NEEDS_REVIEW")).toContain("amber");
  });

  it("uses the error (rejected/voided) color for REJECTED, VOIDED, and CANCELLED", () => {
    expect(statusBadgeClasses("REJECTED")).toContain("error");
    expect(statusBadgeClasses("VOIDED")).toContain("error");
    expect(statusBadgeClasses("CANCELLED")).toContain("error");
  });

  it("never mixes success into a rejected/voided/cancelled status", () => {
    for (const status of ["REJECTED", "VOIDED", "CANCELLED"] as const) {
      expect(statusBadgeClasses(status)).not.toContain("success");
    }
  });
});

describe("statusLabelTh", () => {
  it("distinguishes VOIDED (Branch Head reversal) from CANCELLED (creator withdrawal)", () => {
    // These two are easy to conflate but mean different things to a
    // Treasurer reading their own history — see the function's own comment.
    expect(statusLabelTh("VOIDED")).not.toEqual(statusLabelTh("CANCELLED"));
    expect(statusLabelTh("VOIDED")).toContain("หัวหน้าสาขา");
    expect(statusLabelTh("CANCELLED")).toContain("ผู้สร้างรายการ");
  });

  it("returns a non-empty label for every known status", () => {
    const statuses = ["PENDING", "APPROVED", "REJECTED", "VOIDED", "NEEDS_REVIEW", "CANCELLED"] as const;
    for (const status of statuses) {
      expect(statusLabelTh(status).length).toBeGreaterThan(0);
    }
  });
});
