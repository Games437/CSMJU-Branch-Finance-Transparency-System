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
- `RbacGuard`'s "no default deny" gap from Phase 2 still applies.
- Manual income creation and income import (`POST
  /integrations/{sourceId}/income-events`) are not built — those depend
  on the still-unresolved bank integration questions (Section 35).
- No checksum computed/stored for uploaded evidence yet (schema supports
  it as optional — Business Rule 6 says "when appropriate" — but nothing
  populates it, so accidental duplicate uploads aren't detected).
