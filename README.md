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
