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

  await prisma.userYearAssignment.create({
    data: { userId: treasurerA.id, yearAccountId: year2.id, role: "TREASURER" },
  });

  console.log("✅ Seeded base year account + 3 users + 1 active treasurer assignment");

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
  console.log("✅ PASS: VOID recorded in approval_actions with actor + reason");

  console.log("\nSeed + smoke test complete.");
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
