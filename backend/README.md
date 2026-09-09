# CSMJU-BFTS — Phase 1 Prisma Schema (local test setup)

This is **schema/migration only** — no NestJS app yet. It exists so you can
verify the data model on your own machine before we build the backend on
top of it.

## If you already ran `npm run prisma:migrate` before this update
Your local database is very likely missing the `CHECK (amount > 0)`
constraint and the partial unique index on treasurer assignments — see
"Why migrate dev/migrate reset are not used here" below for exactly why.
Fix it:

```bash
npm run db:reset
```

This wipes the local Postgres volume completely and rebuilds it the safe
way. You will lose any local test data, which is fine at this stage.

## Prerequisites
- Node.js 18+ and npm
- Docker + Docker Compose (for local Postgres)

## Steps (fresh setup)

```bash
# 1. Install dependencies
npm install

# 2. Copy env file
cp .env.example .env

# 3. Start local Postgres (persists in a Docker volume)
npm run db:up

# 4. Apply the migration (verbatim — does NOT touch schema.prisma)
npm run prisma:migrate

# 5. Generate Prisma Client
npm run prisma:generate

# 6. Run the seed / smoke-test script
npm run db:seed
```

## Why migrate dev / migrate reset are NOT used here
`prisma migrate dev` and `prisma migrate reset` both do more than apply
`migration.sql` verbatim: after applying it, they compare the resulting
database against what **schema.prisma alone** would produce, and if there's
a difference, they silently generate and apply a *new* migration to make
the database match schema.prisma exactly.

Two protections in `migration.sql` — the `CHECK (amount > 0)` constraint
and the partial unique index (`uq_active_treasurer_per_year`) — have no
equivalent syntax in Prisma's schema language, so they always show up as
"drift" from Prisma's point of view. Running `migrate dev`/`migrate reset`
on this project auto-generates a follow-up migration that drops both,
without any prompt calling out that a safety constraint is being removed.
This is exactly what happened the first time this project was tested.

`prisma migrate deploy` does not do this comparison — it only applies
migration files that haven't been applied yet, in order. That's why every
script in `package.json` uses `deploy`, and `db:reset` is a plain shell
script (wipe volume -> deploy -> seed) instead of `prisma migrate reset`.

**If you ever need to add a genuinely new schema change:** edit
`schema.prisma`, then run `npx prisma migrate dev --create-only --name
your_change` (the `--create-only` flag stops it from auto-applying), open
the generated SQL file, delete/adjust anything that touches the CHECK
constraint or the partial index if it appears there, then apply it with
`npm run prisma:migrate`.

## What the seed script proves
`prisma/seed.ts` recreates the scenarios already validated during
development. Expected output — every line should say PASS:

- Negative transaction amount -> rejected by DB `CHECK (amount > 0)`
- Two *active* treasurers assigned to the same year at once -> rejected by
  a partial unique index
- Closing one treasurer's assignment and opening a new one (handover) ->
  succeeds
- Same bank notification delivered twice (`idempotencyKey`) -> only the
  first is accepted (this is what makes TC-INC-02 in
  `09_TEST_CASES_ACCEPTANCE_CRITERIA.md` pass)
- A `VOID` decision is recorded with actor + reason in `approval_actions`,
  the same table approve/reject use

If any line prints FAIL, the schema has regressed from what was validated
— stop and investigate before building on top of it.

## Inspecting the data
```bash
npm run prisma:studio
```
Opens a browser GUI against your local database.

## Resetting
```bash
npm run db:reset
```
Wipes the Docker volume, restarts Postgres, reapplies migrations via
`deploy`, and reseeds — safely, without the drift-correction issue above.

## Not yet resolved (see original requirements doc, Section 31 & 35)
This schema does not attempt to answer the 18 unlocked business rules or
10 open technical questions from the requirements baseline (opening
balance ownership, fiscal-year rollover, real bank payload shape, auth
handoff mechanism, etc.). Fields that stand in for these are marked
`// ASSUMPTION:` in `schema.prisma`.

---

# Phase 2 — NestJS API: auth stub, RBAC guard, Users/YearAccounts

## What's in this phase
- `src/auth/` — `AuthGuard` + a swappable `AuthStrategy`. The only
  implementation right now (`DevHeaderAuthStrategy`) reads an
  `x-external-user-id` header and looks up the user's *role* from the
  database — it never trusts a client-supplied role, so the trust
  boundary from Security Model Section 2 holds even though the real
  CSMJU SSO handoff (Open Question #1) isn't wired up yet. Swapping in
  the real mechanism later should only mean replacing this one file.
- `src/rbac/` — `RbacGuard` enforcing `role + assigned_year` per Security
  Model Section 3, via two decorators: `@Roles(...)` and
  `@YearScopeParam('paramName')`. The latter is implemented and will be
  used starting Phase 3 (transactions/approvals) — no currently-built
  route needs it yet, since `GET /year-accounts*` is branch-wide read for
  all three roles per the permission matrix.
- `src/users/` — `GET /api/v1/me`, `GET /api/v1/me/permissions`
  (`permission-matrix.ts` is a code translation of
  `02_ROLE_PERMISSION_MATRIX.md` — ambiguous cells like "policy-based"
  are defaulted to `false`/deny, not guessed at; see comments in that
  file).
- `src/year-accounts/` — `GET /api/v1/year-accounts`,
  `GET /api/v1/year-accounts/:id/summary` (real balance calculation:
  opening balance + approved income − approved expense, computed via
  Prisma `aggregate`, not stored/cached).

## ⚠️ Sandbox limitation — could not run this end-to-end here
Same root cause as Phase 1: this sandbox cannot reach
`binaries.prisma.sh`, so `prisma generate` cannot produce a working
Prisma Client here, which means the app cannot actually be booted or hit
with real requests in this environment.

What I *could* and did verify here instead:
- `npx tsc --noEmit` passes with **zero errors** against a hand-written
  type shim matching the real schema shapes — this catches wiring bugs
  (wrong field names, bad imports, decorator misuse) but is not proof the
  app runs.
- All Prisma field/model names referenced in this phase were
  cross-checked against `schema.prisma` from Phase 1, which *was*
  validated against a real Postgres instance.

**You should run the smoke test below on your machine**, where
`prisma generate` will work normally:

```bash
npm install
npm run db:up
npm run prisma:migrate
npm run prisma:generate
npm run db:seed        # now also seeds a STUDENT user (s1) alongside t1/t2/bh1
npm run start:dev
```

Then in another terminal:

```bash
# No header -> 401
curl -i http://localhost:3000/api/v1/me

# Each role sees different permissions
curl -s -H "x-external-user-id: s1"  http://localhost:3000/api/v1/me/permissions | jq
curl -s -H "x-external-user-id: t2"  http://localhost:3000/api/v1/me/permissions | jq
curl -s -H "x-external-user-id: bh1" http://localhost:3000/api/v1/me/permissions | jq

# All three roles can read year accounts (branch-wide read)
curl -s -H "x-external-user-id: s1" http://localhost:3000/api/v1/year-accounts | jq

# Balance summary (replace <yearAccountId> with the id printed by db:seed)
curl -s -H "x-external-user-id: bh1" \
  http://localhost:3000/api/v1/year-accounts/<yearAccountId>/summary | jq
```

If any of these don't behave as described, that's a real bug to report
back — unlike the Phase 1 DB-constraint issue, none of this has been
proven against a live server yet, only type-checked.

## Known gaps going into Phase 3
- `RbacGuard` has no "default deny" — a route with no `@Roles()` at all
  is currently let through. Every handler in this codebase has `@Roles()`
  applied, but there's no automated check enforcing that stays true as
  more controllers are added.
- `@YearScopeParam()` is unit-implementable but untested end-to-end
  (no mutating year-scoped route exists yet).

---

# Phase 3 — Transaction CRUD, Evidence upload, and Approval workflow

## What's in this phase
- `src/audit/` — `AuditService`, `@Global()` like Auth/Rbac. Every
  mutating action in this phase writes an audit log row, in the same DB
  transaction as the state change it records.
- `src/rbac/year-scope.service.ts` — shared "which year(s) can this user
  touch" logic, used by reads, writes, and evidence access so it's
  defined once instead of reimplemented per module.
- `src/transactions/` — `POST /api/v1/expenses`,
  `PATCH /api/v1/expenses/:id`, `GET /api/v1/transactions` (paginated,
  filterable), `GET /api/v1/transactions/:id`. TREASURER reads/writes are
  forced to their own scoped year even on plain reads — Role Matrix
  Section 4 requires this, not just on mutations. STUDENT-facing
  responses have `externalReference` stripped (Business Rule 10 privacy
  — bank reference details are role-limited).
- `src/evidence/` — `POST /api/v1/expenses/:id/evidence` (multipart file
  upload; MIME allowlist: PDF/JPEG/PNG/WEBP; 10MB limit; server-generated
  storage key, never the client's filename/path), `GET
  /api/v1/evidence/:id` (authorized download). Files land on local disk
  under `local-storage/evidence/` (gitignored) — see the storage note in
  `evidence.service.ts` for why this needs to change before production
  (no signed URLs, no object storage yet).
- `src/approvals/` — `GET /api/v1/approvals/pending`,
  `POST /api/v1/transactions/:id/approve`, `.../reject`, `.../void`, all
  `BRANCH_HEAD`-only. Approve/reject/void run inside a single Prisma
  interactive transaction covering the status update, the
  `approval_action` insert, AND the audit log write — this directly fixes
  the class of bug found in `prisma/seed.ts` during Phase 2 testing
  (there, the same three things were done as separate, non-atomic
  writes).

## Business rules enforced (not just documented)
- **Evidence required before approval** (Business Rule 4.2): approving a
  PENDING expense with zero evidence rows attached returns 409, not a
  silent pass. Checked at approve-time (not creation-time), since
  creation and evidence-upload are two separate API calls and evidence
  can't exist yet at creation.
- **Segregation of duties**: `createdBy === actorId` is rejected on
  approve/reject/void with a 403. Applies even to Branch Head.
- **Status transitions**: approve/reject only from `PENDING`; void only
  from `APPROVED`; evidence can only be attached while `PENDING`. Any
  other current status → 409 Conflict, not a silent no-op.
- **Void AND reject both require a non-empty reason** — Reject's
  requirement comes from `03_DETAILED_USER_FLOW.md` Section 4 step 7
  ("Require rejection reason when rejecting"), not just the permission
  matrix's "with reason" note on Void.
- **IDOR protection on reads, not just writes**: a Treasurer's
  `GET /transactions?yearAccountId=<other year>` is a 403, not a
  filtered-empty list — silently returning nothing would leak that the
  id exists. Same for evidence download against another year's file.
- **No year-transfer via PATCH**: `UpdateExpenseDto` has no
  `yearAccountId` field at all, by design.
- **Bill versioning, not overwrite** (Business Rule 6): re-uploading
  evidence on the same transaction marks the previous row
  `isCurrent: false` and inserts a new versioned row, inside one DB
  transaction — never deletes or overwrites the old file/record.

## ⚠️ Operational gap surfaced while building this (not a code bug)
If there is only one Branch Head account, and that Branch Head creates
an expense themselves (Role Matrix allows this — "✓/override if
needed"), **no one can approve it** — segregation-of-duties blocks a
Branch Head from approving their own entry, and no other role can
approve at all. This is a real deadlock the original requirements don't
address. Worth raising as a business question before this goes live:
either Branch Head must never self-create expenses needing approval, or
there needs to be a backup-approver mechanism.

## ⚠️ Sandbox limitation (same as Phases 1 & 2)
Could not boot the app or hit these endpoints with real requests here —
`binaries.prisma.sh` is still network-blocked in this sandbox. Verified
via `tsc --noEmit` (zero errors, shim extended to cover
`ExpenseEvidence`/interactive `$transaction`/etc.) plus manual code
review against `01_BUSINESS_RULES_SPECIFICATION.md`,
`02_ROLE_PERMISSION_MATRIX.md`, and `03_DETAILED_USER_FLOW.md`. Three
real bugs were caught this way before delivery (see git log:
`RejectTransactionDto` had an optional reason, evidence-before-approval
wasn't enforced at all, and the VOID audit action name had a typo
producing `TRANSACTION_VOIDD`). **This still must be smoke-tested on
your machine** — code review catches logic bugs, not runtime surprises.

## Suggested smoke test (run after Phase 1 + 2 tests pass)
```bash
# As Treasurer (t2, Year 2): create an expense
curl -s -X POST http://localhost:3000/api/v1/expenses \
  -H "x-external-user-id: t2" -H "Content-Type: application/json" \
  -d '{"yearAccountId":"<year2Id>","amount":500,"transactionDate":"2026-09-01","description":"Test expense","category":"SUPPLIES"}' | jq

# Same treasurer trying another year's id -> 403
curl -s -X POST http://localhost:3000/api/v1/expenses \
  -H "x-external-user-id: t2" -H "Content-Type: application/json" \
  -d '{"yearAccountId":"<someOtherYearId>","amount":500,"transactionDate":"2026-09-01","description":"Should fail","category":"SUPPLIES"}' | jq

# Branch Head tries to approve with NO evidence yet -> 409
curl -s -X POST -H "x-external-user-id: bh1" \
  http://localhost:3000/api/v1/transactions/<transactionId>/approve | jq

# Upload evidence (any small PDF/JPG/PNG on your machine)
curl -s -X POST http://localhost:3000/api/v1/expenses/<transactionId>/evidence \
  -H "x-external-user-id: t2" -F "file=@/path/to/receipt.pdf" | jq

# Now approve succeeds
curl -s -X POST -H "x-external-user-id: bh1" \
  http://localhost:3000/api/v1/transactions/<transactionId>/approve | jq

# Download the evidence (Branch Head can; Student cannot)
curl -s -o receipt-downloaded.pdf -H "x-external-user-id: bh1" \
  http://localhost:3000/api/v1/evidence/<evidenceId>
curl -i -H "x-external-user-id: s1" \
  http://localhost:3000/api/v1/evidence/<evidenceId>   # expect 403

# Branch Head tries to approve their OWN transaction -> 403
# (create one as bh1 first via POST /expenses, upload evidence as bh1,
#  then try approving it as bh1)

# Reject without a reason -> 400 (reason is required)
curl -s -X POST http://localhost:3000/api/v1/transactions/<otherTransactionId>/reject \
  -H "x-external-user-id: bh1" -H "Content-Type: application/json" -d '{}' | jq

# Void requires a reason too -> 400 without one
curl -s -X POST http://localhost:3000/api/v1/transactions/<transactionId>/void \
  -H "x-external-user-id: bh1" -H "Content-Type: application/json" -d '{}' | jq

# Balance reflects the approval
curl -s -H "x-external-user-id: bh1" \
  http://localhost:3000/api/v1/year-accounts/<year2Id>/summary | jq

# Student sees the transaction but externalReference is masked (null)
curl -s -H "x-external-user-id: s1" \
  http://localhost:3000/api/v1/transactions/<transactionId> | jq '.externalReference'
```

## Known gaps going into Phase 4
- Evidence storage is local disk, not object storage — no signed URLs,
  no encryption-at-rest guarantees beyond the host filesystem's own.
  Fine for local testing, not for production (see storage note in
  `evidence.service.ts`).
- Manual income creation and income import (`POST
  /integrations/{sourceId}/income-events`) are not built — those depend
  on the still-unresolved bank integration questions (Section 35).
- No checksum computed/stored for uploaded evidence yet (schema supports
  it as optional — Business Rule 6 says "when appropriate" — but nothing
  populates it, so accidental duplicate uploads aren't detected).

## Resolved — RBAC default-deny
`RbacGuard` previously allowed any route with no `@Roles()` decorator
through unprotected. Audited every controller in the codebase first
(confirmed every existing handler already had `@Roles()` applied), then
flipped the default: a route with neither `@Roles()` nor the new
`@Public()` escape hatch is now rejected with 403, not allowed through.
`src/rbac/public.decorator.ts` is the explicit opt-out for the rare
route that should genuinely skip this check — nothing currently uses
it. `tsc --noEmit` clean; not yet re-run through
`scripts/smoke-test-phase3.sh` on a real server (the change should be
invisible to all 19 existing checks, since no route relied on the old
default-allow behavior, but that's a claim to verify, not assume).

---

# Phase 3.5 — Section 31 business rules resolved with CSMJU (2026-09-06)

CSMJU answered the 18 open business rules from
`BRANCH_FINANCIAL_TRANSPARENCY_SYSTEM_REQUIREMENTS.md` Section 31. Full
answers are in the conversation history; summary of what changed in this
codebase as a result:

## Resolved — no code change needed
| # | Question | Answer |
|---|---|---|
| 2 | Who sets Opening Balance | Branch Head |
| 13 | Bill/audit log retention | Kept until explicit deletion order — already matches the append-only design |
| 17 | Can money move between years | No — not building this |
| 10 | Duplicate income key | Blocked on the integration team's payload spec — unchanged from Phase 1's assumption |

## Resolved — REQUIRED a schema change (this is the big one)
**#1 and #15/#16 together**: "Year 2" is not a fixed slot different
cohorts rotate through — it is a **fixed cohort** (same students, same
treasurer) that advances Year 1 → 2 → 3 → 4 together, carrying its
balance forward. The ORIGINAL Phase 1 schema modeled `year_level` as
globally unique per `YearAccount`, which is wrong for this: it can't
represent "a new Year-1 cohort exists at the same time as the old
Year-1-now-Year-2 cohort".

Fixed via a new migration (`20260906000000_cohort_year_model`, NOT an
edit to the already-applied `20260901000000_init` — see that migration's
own header comment for why editing an applied migration is unsafe):
- `year_accounts.academic_year_label` renamed to
  `entry_academic_year_label` — now explicitly "the year this cohort
  entered as Year 1", fixed forever, not a "current year" label.
- The old global `UNIQUE(year_level)` is replaced with a **partial**
  unique index: only one *active* cohort may hold a given `year_level`
  at a time. Graduated (archived) cohorts don't count — verified with a
  real Postgres instance: a second active Year-2 cohort is rejected, a
  graduated (inactive) cohort at the same year_level is allowed.
- New table `year_level_periods`: one row per cohort per academic year,
  closed out (with a closing-balance snapshot) each time the cohort
  advances. Without this, promoting `year_level` in place would destroy
  the history CSMJU asked for (#16).
- A backfill in the same migration gives every already-existing active
  cohort a "current period" row, so the invariant holds immediately, not
  just for cohorts created after this migration.

**Status: fully built and tested**, not just designed. What was added on
top of the schema change described above:
- `YearAccountsService.advanceAcademicYear()` + `POST
  /api/v1/year-accounts/advance-academic-year` (Branch Head only):
  closes each active cohort's current period (with a closing-balance
  snapshot), promotes year_level for cohorts below 4, archives the
  Year-4 cohort (graduation), creates a new Year-1 cohort, and opens new
  periods for everything that advanced — all in one transaction.
  Idempotency-guarded: re-running for an academic year that's already
  been advanced to is rejected, not silently repeated.
- Verified against a real Postgres instance with all 4 year levels
  active simultaneously at once (the highest-risk case: graduate +
  promote three cohorts + create a new one, without ever colliding with
  the partial unique index) — passed, including confirming the
  idempotency guard's condition and that exactly one active cohort
  remains per level afterward.
- `seed.ts` updated to match the renamed column and to create the
  matching `YearLevelPeriod` row a real cohort would have (previously
  it would have failed to run at all after the rename).

## Resolved — required an approval-workflow change (#9)
CSMJU confirmed: automated bank-feed income still requires a Branch Head
to confirm the amount before it counts toward the balance — this
**overrides** the earlier Phase 1 schema comment that assumed
auto-APPROVED income. Changed:
- `BANK_IMPORT` income now starts at `NEEDS_REVIEW`, not `APPROVED`.
- `ApprovalsService.confirmIncome()` + `POST
  /api/v1/transactions/:id/confirm-income` (Branch Head only):
  NEEDS_REVIEW -> APPROVED, same self-approval prevention and atomic
  audit-log write as expense approval, but explicitly skips the
  evidence-required check (income never has evidence) via a type guard
  that also stops `approve()`/`confirmIncome()` from being called on the
  wrong transaction type.
- `GET /api/v1/approvals/pending` now surfaces both PENDING expenses and
  NEEDS_REVIEW income in one queue.
- `seed.ts` Scenario 4 rewritten to go through the real two-step flow
  (create at NEEDS_REVIEW, then confirm) instead of creating income
  pre-APPROVED.

## Resolved — required an access-control change (#12)
CSMJU confirmed: students CAN view uploaded bills (full transparency),
reversing the earlier ASSUMPTION that defaulted to deny. Changed:
- `permission-matrix.ts`: `viewProtectedBill` flipped to `true` for
  STUDENT.
- `GET /api/v1/evidence/:id` now allows STUDENT (unscoped, same
  branch-wide read pattern STUDENT has everywhere else), not just
  TREASURER (scoped)/BRANCH_HEAD.
- `scripts/smoke-test-phase3.sh` Test 7 updated — it previously
  asserted students get a 403 here, which is now the wrong expectation.

## Resolved — Option A confirmed for #4
CSMJU confirmed Option A: display-only, no enforcement. `GET
/api/v1/year-accounts/:id/summary` now also returns
`pendingExpenseTotal` (sum of that year's PENDING expenses) alongside
the existing `balance` — purely informational, does not affect
`balance` and does not block creating or approving anything. Verified
against Postgres directly: opening 5000, two PENDING expenses (5000 +
4000 = 9000) and one APPROVED expense (1000) correctly produced
`approvedExpense: 1000`, `pendingExpenseTotal: 9000`, `balance: 4000`.

If this is ever upgraded to Option B (block new expenses/approvals once
approved+pending would go negative), that check belongs in
`TransactionsService.createExpense`/`ApprovalsService.approve` — this
field would still be the number that check reads from.

## Confirmed — #18 (adjustment approver)
CSMJU confirmed: Branch Head approves adjustments, same as Void. Not
yet implemented — there is no ADJUSTMENT creation flow built at all
yet (only the `TransactionSourceType.ADJUSTMENT` enum value exists in
the schema). Recorded here so the decision doesn't need to be
re-asked when that flow is eventually built.

## Not yet done
- Item #10 (duplicate-income key) remains blocked on the integration
  team's payload spec, unchanged from Phase 1.

## Resolved — required an ASSUMPTION change
**#9**: income pulled automatically from LINE is NOT auto-trusted —
Branch Head must confirm it before it counts toward balance. This
reverses the Phase 1 assumption ("verified import defaults to
APPROVED"). Not yet implemented: `TransactionStatus` already has
`NEEDS_REVIEW` for this, but there's no confirm-income endpoint yet, and
`ApprovalsService`'s evidence-required check needs to stay EXPENSE-only
(it must not block confirming income, which has no evidence concept).

**#12**: students CAN open uploaded bills (full transparency) — this
REVERSES the Phase 3 assumption that gated evidence download to
TREASURER/BRANCH_HEAD only. `permission-matrix.ts`
(`viewProtectedBill: false` for STUDENT) and `EvidenceController`'s
`@Roles()` on the download route both need updating — not yet done.
