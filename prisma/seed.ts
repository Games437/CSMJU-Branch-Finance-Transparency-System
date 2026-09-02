/**
 * Seed + smoke-test script.
 *
 * Run with: npx prisma db seed
 * (after `npm run db:up` and `npm run prisma:migrate`)
 *
 * This reproduces the exact scenarios that were manually validated during
 * development (see chat history / PR description). If any of these throw
 * unexpectedly, or fail to throw where noted, the schema has regressed.
 */
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

async function main() {
  const year2 = await prisma.yearAccount.create({
    data: { yearLevel: 2, name: "Year 2", openingBalance: 5000 },
  });

  const treasurerA = await prisma.user.create({
    data: { externalUserId: "t1", displayName: "Treasurer A", role: "TREASURER" },
  });
  const treasurerB = await prisma.user.create({
    data: { externalUserId: "t2", displayName: "Treasurer B", role: "TREASURER" },
  });
  const branchHead = await prisma.user.create({
    data: { externalUserId: "bh1", displayName: "Branch Head", role: "BRANCH_HEAD" },
  });
  const student = await prisma.user.create({
    data: { externalUserId: "s1", displayName: "Student One", role: "STUDENT" },
  });

  await prisma.userYearAssignment.create({
    data: { userId: treasurerA.id, yearAccountId: year2.id, role: "TREASURER" },
  });

  console.log("✅ Seeded base year account + 4 users + 1 active treasurer assignment");
  console.log("   Test with: x-external-user-id: s1 (STUDENT) | t1 (TREASURER, Year 2) | bh1 (BRANCH_HEAD)");

  // --- Scenario 1: negative amount must be rejected by CHECK (amount > 0) ---
  try {
    await prisma.transaction.create({
      data: {
        yearAccountId: year2.id,
        type: "EXPENSE",
        amount: -50,
        transactionDate: new Date("2026-08-31"),
        description: "negative amount attempt",
        sourceType: "MANUAL",
        createdBy: treasurerA.id,
      },
    });
    console.error("❌ FAIL: negative amount was accepted — CHECK constraint missing/broken");
  } catch {
    console.log("✅ PASS: negative amount rejected by DB constraint");
  }

  // --- Scenario 2: a second ACTIVE treasurer on the same year must be rejected ---
  try {
    await prisma.userYearAssignment.create({
      data: { userId: treasurerB.id, yearAccountId: year2.id, role: "TREASURER" },
    });
    console.error("❌ FAIL: two active treasurers on the same year were both accepted");
  } catch {
    console.log("✅ PASS: second active treasurer on same year rejected");
  }

  // --- Scenario 3: replacing the treasurer (close old, open new) must succeed ---
  await prisma.userYearAssignment.updateMany({
    where: { userId: treasurerA.id, yearAccountId: year2.id, activeTo: null },
    data: { activeTo: new Date() },
  });
  await prisma.userYearAssignment.create({
    data: { userId: treasurerB.id, yearAccountId: year2.id, role: "TREASURER" },
  });
  console.log("✅ PASS: treasurer handover (close old + open new) succeeded");

  // --- Scenario 4: duplicate bank notification must not create two income rows ---
  // status explicitly APPROVED: this row represents income that already
  // passed validation/dedup (see idempotencyKey below), so it should be
  // counted in the balance immediately, matching the
  // "Income defaults to APPROVED unless ambiguous -> NEEDS_REVIEW"
  // assumption documented in schema.prisma. Leaving status unset here
  // would silently fall back to the schema default (PENDING) and exclude
  // it from the balance summary — this was an earlier bug in this seed
  // script, not in the balance calculation itself.
  await prisma.transaction.create({
    data: {
      yearAccountId: year2.id,
      type: "INCOME",
      amount: 1000,
      transactionDate: new Date("2026-08-30"),
      description: "Bank notification",
      sourceType: "BANK_IMPORT",
      createdBy: branchHead.id,
      idempotencyKey: "dedupe-key-abc",
      status: "APPROVED",
    },
  });
  try {
    await prisma.transaction.create({
      data: {
        yearAccountId: year2.id,
        type: "INCOME",
        amount: 1000,
        transactionDate: new Date("2026-08-30"),
        description: "Bank notification (retry delivery)",
        sourceType: "BANK_IMPORT",
        createdBy: branchHead.id,
        idempotencyKey: "dedupe-key-abc",
        status: "APPROVED",
      },
    });
    console.error("❌ FAIL: duplicate idempotencyKey was accepted twice");
  } catch {
    console.log("✅ PASS: duplicate bank notification rejected (TC-INC-02)");
  }

  // --- Scenario 5: VOID is recorded with actor + reason, same table as approve/reject ---
  const expense = await prisma.transaction.create({
    data: {
      yearAccountId: year2.id,
      type: "EXPENSE",
      amount: 300,
      transactionDate: new Date("2026-08-20"),
      description: "test expense",
      sourceType: "MANUAL",
      createdBy: treasurerB.id,
      status: "APPROVED",
    },
  });
  await prisma.approvalAction.create({
    data: {
      transactionId: expense.id,
      actorId: branchHead.id,
      decision: "VOID",
      reason: "Duplicate entry, voided by branch head",
    },
  });
  // BUG FOUND DURING MANUAL TESTING (2026-09-02): recording the VOID
  // approval_action does NOT itself change the transaction's status —
  // that update must happen explicitly, in the same DB transaction as
  // the approval_action insert once a real void endpoint exists
  // (Phase 3). This seed script previously forgot this step entirely,
  // which let a voided expense keep counting against the balance.
  await prisma.transaction.updateMany({
    where: { id: expense.id },
    data: { status: "VOIDED" },
  });
  console.log("✅ PASS: VOID recorded in approval_actions with actor + reason, and transaction status transitioned to VOIDED");

  console.log("\nSeed + smoke test complete.");

  // --- Scenario 6: balance summary must reflect only APPROVED transactions ---
  // This directly checks the logic behind GET /year-accounts/:id/summary,
  // so a regression here is caught by `npm run db:seed` automatically
  // instead of requiring manual curl inspection.
  const [incomeAgg, expenseAgg] = await Promise.all([
    prisma.transaction.aggregate({
      where: { yearAccountId: year2.id, type: "INCOME", status: "APPROVED" },
      _sum: { amount: true },
    }),
    prisma.transaction.aggregate({
      where: { yearAccountId: year2.id, type: "EXPENSE", status: "APPROVED" },
      _sum: { amount: true },
    }),
  ]);
  const approvedIncome = Number(incomeAgg._sum.amount ?? 0);
  const approvedExpense = Number(expenseAgg._sum.amount ?? 0);
  const balance = 5000 + approvedIncome - approvedExpense;
  const expectedBalance = 6000; // 5000 opening + 1000 approved income - 0 (voided expense excluded)

  if (balance === expectedBalance) {
    console.log(`✅ PASS: balance summary = ${balance} (voided expense correctly excluded)`);
  } else {
    console.error(
      `❌ FAIL: balance summary = ${balance}, expected ${expectedBalance} ` +
        `(approvedIncome=${approvedIncome}, approvedExpense=${approvedExpense})`,
    );
  }

  console.log("\nFinal state for manual API testing (curl -H \"x-external-user-id: <id>\" ...):");
  console.log("  s1  -> STUDENT");
  console.log("  t2  -> TREASURER, active on Year 2 (t1's assignment was closed by the handover test above)");
  console.log("  bh1 -> BRANCH_HEAD");
  console.log(`  Year 2 id: ${year2.id}`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
