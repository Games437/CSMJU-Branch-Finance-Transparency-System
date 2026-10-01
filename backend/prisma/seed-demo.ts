/**
 * DEMO data seed — separate from seed.ts on purpose.
 *
 * seed.ts is a smoke-test script (its own header comment says so): it
 * reproduces exact validated scenarios and asserts on exact numbers
 * (e.g. "balance summary must equal 6000"). Adding more year accounts /
 * users / transactions into that file would risk changing those numbers
 * and silently breaking a regression test. This script is purely additive
 * demo data for *looking at the UI with more than one cohort on screen*
 * (dashboard, /year-accounts, /expenses, /approvals, /audit-logs) — it
 * asserts nothing and is safe to re-run only once against a fresh DB.
 *
 * Run AFTER `npx prisma db seed` (which creates the Year 2 cohort +
 * treasurers t1/t2 + branchHead bh1 + student s1 that this script builds
 * on top of):
 *   npx ts-node prisma/seed-demo.ts
 * or: npm run db:seed:demo
 *
 * What this adds:
 *   - 3 more YearAccount cohorts: Year 1, Year 3, Year 4 (Year 2 already
 *     exists from seed.ts) — so the "list of year accounts" screens have
 *     more than one row.
 *   - 1 TREASURER per new cohort (t3/Year 1, t4/Year 3, t5/Year 4) — see
 *     the note at the bottom of this file for why a treasurer is scoped to
 *     a *cohort*, not a "current year level" or an academic-year label.
 *   - 2 more STUDENT users (s2, s3) purely for headcount — see the note
 *     at the bottom for why this does NOT change what any of them can see
 *     (STUDENT has branch-wide read scope; it is not per-cohort).
 *   - A handful of transactions per new cohort, in different statuses
 *     (PENDING/APPROVED/REJECTED/NEEDS_REVIEW/VOIDED/CANCELLED), so every
 *     status color/label in status-styles.ts actually shows up somewhere.
 *
 * After running this + seed.ts, DEV_USERS in
 * frontend/src/lib/dev-auth.tsx has been extended to match: t3/t4/t5 are
 * selectable in the dev role switcher alongside the existing s1/t2/bh1.
 */
import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";

const prisma = new PrismaClient({
  adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL }),
});

async function main() {
  const branchHead = await prisma.user.findUniqueOrThrow({
    where: { externalUserId: "bh1" },
  });

  // --- Year 1 cohort: just started, small balance, still filling up ---
  const year1 = await prisma.yearAccount.create({
    data: {
      yearLevel: 1,
      name: "Year 1",
      openingBalance: 2000,
      entryAcademicYearLabel: "2569", // entered as Year 1 this academic year
    },
  });
  await prisma.yearLevelPeriod.create({
    data: { yearAccountId: year1.id, academicYear: "2569", yearLevel: 1 },
  });
  const treasurerC = await prisma.user.create({
    data: { externalUserId: "t3", displayName: "Treasurer C", role: "TREASURER" },
  });
  await prisma.userYearAssignment.create({
    data: { assigneeId: treasurerC.id, username: treasurerC.externalUserId, yearAccountId: year1.id, role: "TREASURER" },
  });

  await prisma.transaction.create({
    data: {
      yearAccountId: year1.id,
      type: "INCOME",
      amount: 1500,
      transactionDate: new Date("2026-09-05"),
      description: "ค่าบำรุงชมรม (เก็บสด)",
      sourceType: "MANUAL",
      createdBy: treasurerC.id,
      createdByUsername: treasurerC.externalUserId,
      status: "APPROVED",
      approvedBy: branchHead.id,
      approvedByUsername: branchHead.externalUserId,
      approvedAt: new Date("2026-09-06"),
    },
  });
  const year1PendingExpense = await prisma.transaction.create({
    data: {
      yearAccountId: year1.id,
      type: "EXPENSE",
      amount: 450,
      transactionDate: new Date("2026-09-10"),
      description: "ซื้อของใช้ต้อนรับน้องปี 1",
      sourceType: "MANUAL",
      createdBy: treasurerC.id,
      createdByUsername: treasurerC.externalUserId,
      status: "PENDING",
    },
  });
  void year1PendingExpense; // still PENDING — shows up in Branch Head's /approvals queue
  await prisma.transaction.create({
    data: {
      yearAccountId: year1.id,
      type: "INCOME",
      amount: 800,
      transactionDate: new Date("2026-09-12"),
      description: "เงินโอนเข้าบัญชี (รอยืนยัน)",
      sourceType: "BANK_IMPORT",
      createdBy: treasurerC.id,
      createdByUsername: treasurerC.externalUserId,
      status: "NEEDS_REVIEW",
      idempotencyKey: "demo-year1-bank-1",
    },
  });

  // --- Year 3 cohort: mid-lifecycle, has both an approval and a rejection ---
  const year3 = await prisma.yearAccount.create({
    data: {
      yearLevel: 3,
      name: "Year 3",
      openingBalance: 8000,
      entryAcademicYearLabel: "2567",
    },
  });
  await prisma.yearLevelPeriod.create({
    data: { yearAccountId: year3.id, academicYear: "2569", yearLevel: 3 },
  });
  const treasurerD = await prisma.user.create({
    data: { externalUserId: "t4", displayName: "Treasurer D", role: "TREASURER" },
  });
  await prisma.userYearAssignment.create({
    data: { assigneeId: treasurerD.id, username: treasurerD.externalUserId, yearAccountId: year3.id, role: "TREASURER" },
  });

  await prisma.transaction.create({
    data: {
      yearAccountId: year3.id,
      type: "INCOME",
      amount: 3000,
      transactionDate: new Date("2026-08-15"),
      description: "ค่าบำรุงชมรมภาคเรียนที่ 1",
      sourceType: "MANUAL",
      createdBy: treasurerD.id,
      createdByUsername: treasurerD.externalUserId,
      status: "APPROVED",
      approvedBy: branchHead.id,
      approvedByUsername: branchHead.externalUserId,
      approvedAt: new Date("2026-08-16"),
    },
  });
  const year3RejectedExpense = await prisma.transaction.create({
    data: {
      yearAccountId: year3.id,
      type: "EXPENSE",
      amount: 2500,
      transactionDate: new Date("2026-09-01"),
      description: "จัดกิจกรรมนอกสถานที่ (เอกสารไม่ครบ)",
      sourceType: "MANUAL",
      createdBy: treasurerD.id,
      createdByUsername: treasurerD.externalUserId,
      status: "REJECTED",
    },
  });
  await prisma.approvalAction.create({
    data: {
      transactionId: year3RejectedExpense.id,
      actorId: branchHead.id,
      actorUsername: branchHead.externalUserId,
      decision: "REJECT",
      reason: "แนบใบเสร็จไม่ครบตามจำนวนที่แจ้ง",
    },
  });

  // --- Year 4 cohort: near graduation, has a void and a self-cancel ---
  const year4 = await prisma.yearAccount.create({
    data: {
      yearLevel: 4,
      name: "Year 4",
      openingBalance: 3000,
      entryAcademicYearLabel: "2566",
    },
  });
  await prisma.yearLevelPeriod.create({
    data: { yearAccountId: year4.id, academicYear: "2569", yearLevel: 4 },
  });
  const treasurerE = await prisma.user.create({
    data: { externalUserId: "t5", displayName: "Treasurer E", role: "TREASURER" },
  });
  await prisma.userYearAssignment.create({
    data: { assigneeId: treasurerE.id, username: treasurerE.externalUserId, yearAccountId: year4.id, role: "TREASURER" },
  });

  const year4VoidedExpense = await prisma.transaction.create({
    data: {
      yearAccountId: year4.id,
      type: "EXPENSE",
      amount: 1200,
      transactionDate: new Date("2026-07-20"),
      description: "ค่าเช่าเต็นท์งานรับปริญญา (บันทึกผิดปี)",
      sourceType: "MANUAL",
      createdBy: treasurerE.id,
      createdByUsername: treasurerE.externalUserId,
      status: "APPROVED",
      approvedBy: branchHead.id,
      approvedByUsername: branchHead.externalUserId,
      approvedAt: new Date("2026-07-21"),
    },
  });
  await prisma.approvalAction.create({
    data: {
      transactionId: year4VoidedExpense.id,
      actorId: branchHead.id,
      actorUsername: branchHead.externalUserId,
      decision: "VOID",
      reason: "บันทึกผิดปีบัญชี ย้ายไปปี 3 แทน",
    },
  });
  await prisma.transaction.updateMany({
    where: { id: year4VoidedExpense.id },
    data: { status: "VOIDED" },
  });

  await prisma.transaction.create({
    data: {
      yearAccountId: year4.id,
      type: "EXPENSE",
      amount: 600,
      transactionDate: new Date("2026-09-08"),
      description: "ของที่ระลึกรุ่นพี่ปี 4 (ถอนคำขอเอง)",
      sourceType: "MANUAL",
      createdBy: treasurerE.id,
      createdByUsername: treasurerE.externalUserId,
      status: "CANCELLED",
    },
  });

  // --- A couple more Students, for headcount only ---
  // NOT year-scoped: per schema.prisma's UserYearAssignment comment,
  // STUDENT has *implicit branch-wide read scope* — there is no per-cohort
  // student assignment in this data model, so these two see exactly what
  // s1 already sees (every year account, read-only). They exist here only
  // because "more people" was asked for; they change no visibility rule.
  await prisma.user.create({
    data: { externalUserId: "s2", displayName: "Student Two", role: "STUDENT" },
  });
  await prisma.user.create({
    data: { externalUserId: "s3", displayName: "Student Three", role: "STUDENT" },
  });

  console.log("✅ Demo data seeded: Year 1 / Year 3 / Year 4 cohorts, 3 more treasurers (t3/t4/t5), 2 more students (s2/s3)");
  console.log("   Year 1 id:", year1.id, "-> treasurer t3");
  console.log("   Year 3 id:", year3.id, "-> treasurer t4");
  console.log("   Year 4 id:", year4.id, "-> treasurer t5");
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });

// ============================================================================
// Answering "ถ้าเชื่อมฐานข้อมูลเราจะจำแนกเหรัญญิกตามปีการศึกษาใช่มั้ย":
//
// Close, but the scoping key is the COHORT (YearAccount.id), not a raw
// "ปีการศึกษา" (academic-year) label by itself. See schema.prisma's own
// RESOLVED comment on the YearAccount model: a cohort is fixed at
// creation and keeps the SAME treasurer as it advances yearLevel 1->2->3->4
// across multiple academic years — "Year 2" is not a slot that a new
// treasurer rotates into every year, it's *this specific cohort*, currently
// sitting at level 2, that only gets a new treasurer when someone
// deliberately hands it over (UserYearAssignment: close the old row's
// activeTo, open a new one — see seed.ts's own "treasurer handover" test).
//
// YearAccount.entryAcademicYearLabel is a fixed, cosmetic label ("entered
// as Year 1 in 2567") — it is not what UserYearAssignment or the API's
// TREASURER scoping keys off of. The actual foreign key on
// UserYearAssignment is yearAccountId. So: yes, a treasurer is tied to a
// specific year/cohort — but concretely that means "this YearAccount row",
// not "this calendar/ปีการศึกษา label".
// ============================================================================
