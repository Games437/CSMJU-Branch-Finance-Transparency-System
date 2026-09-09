# CSMJU-BFTS — Frontend

Next.js (App Router) frontend for the Branch Financial Transparency
System. Talks to the NestJS backend (see the sibling `csmju-bfts-backend`
project) over REST.

## Setup

```bash
npm install
cp .env.local.example .env.local
npm run dev
```

Runs on **http://localhost:3001** (not 3000 — that's the backend's
port; both run at once during development).

Make sure the backend is running first (`npm run start:dev` in
`csmju-bfts-backend`), with CORS configured to allow this origin — the
backend's `.env` needs:
```
CORS_ORIGIN="http://localhost:3001"
```

## ⚠️ Dev-only auth — read before doing anything else
There is no real login yet. The real CSMJU SSO handoff mechanism is
still unresolved (Requirements doc Section 35 #1/#2). Instead, a
banner at the top of every page lets you pick one of the backend's
seeded users (`s1`=Student, `t2`=Treasurer, `bh1`=Branch Head) via
`src/lib/dev-auth.tsx`. This attaches the same `x-external-user-id`
header the backend's dev auth strategy expects.

**This is a placeholder to delete, not a foundation to build real auth
on top of.** When the real SSO mechanism is decided, replace
`dev-auth.tsx` and `DevRoleSwitcher.tsx` entirely — components that
call `useDevAuth()` will need to switch to whatever the real auth
context ends up being, but the API client (`src/lib/api.ts`) itself
doesn't need to change, since it already treats "how to identify the
user" as `dev-auth.tsx`'s concern, not its own.

Requires the backend database to be seeded (`npm run db:seed` in
`csmju-bfts-backend`) — the dev role switcher's three users only exist
if that's been run.

## What's built so far

- **Dashboard (`/`)**: overview of all year accounts (cohorts) —
  balance, pending expense total (display-only, per Section 31 #4
  Option A), approved income/expense breakdown. Branch Head also sees
  a pending-approvals count banner.

## Design concept: "passbook"
The visual language is a bank passbook metaphor — see
`tailwind.config.ts` for the color tokens (paper/ink neutrals, plus a
jade/brass/rust accent trio that carries meaning: jade for
approved/positive figures, brass for pending/attention states, rust
for void/negative figures — not decorative choices). Fonts: Noto Serif
Thai for headings/balance figures, IBM Plex Sans Thai for body text,
IBM Plex Mono for tabular numeric data. No dark mode yet — deliberately
left out rather than done as a naive color inversion.

## Known limitations
- Dev-only auth (see above) — the biggest one.
- No error boundary / retry UI beyond a plain error message.
- Year account list re-fetches all summaries on every mount; fine for
  4 cohorts, would need real caching (React Query or similar) if that
  count ever grew meaningfully.
- Not yet built: Treasurer's create-expense flow, Branch Head's
  approval detail/action pages, evidence upload/viewer, academic-year
  advancement UI. Dashboard only, per the current task scope.
