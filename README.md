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
