# AQE Ecosystem — Phase 1 (Working repo)

This repository contains the Phase 1 scaffold for the AQE production app: Next.js + TypeScript + Supabase foundation.

## Updated product architecture

The updated handoff makes several rules explicit:

- QC and cash are two different economic systems.
- `qc_wallet` and `qc_ledger` are authoritative and server-side only.
- Creator earnings and withdrawals belong to the cash/economy layer.
- Manager Support Room is user-facing support; internal manager/admin tools must remain separate.
- VIP withdrawals must follow a configurable three-day weekly schedule.

## Supabase region recommendation

For the initial AQE deployment, the recommended production region is Frankfurt (`eu-central-1`) unless a specific data-residency requirement dictates otherwise.

The app should use the Supabase Data API for browser access and a direct PostgreSQL/Postgres connection for migrations and admin tasks. Secret values must stay on the server and never be exposed to the browser.

## Quick start

1. Copy `.env.example` to `.env.local` and fill values.
2. Install packages:

```bash
npm install
```

3. Start the app:

```bash
npm run dev
```

## Useful scripts

- `npm run dev` — Next.js dev server
- `npm run build` — Create production build
- `npm run start` — Start production server
- `npm run lint` — Run ESLint
- `npm run typecheck` — Run TypeScript typecheck
- `npm run test` — Run Vitest tests

## Phase 1 deliverables

- Next.js (App Router) + TypeScript
- Supabase client wiring
- Customer & Manager UI shells
- ESLint and TypeScript config
- Vitest test runner
- CI workflow skeleton
- `.env.example` and migration foundation

## Next engineering steps

- Add server-side QC transaction service and atomic balance updates
- Build `qc_wallet` + `qc_ledger` schema and related policies
- Add daily claim and weekly attendance logic
- Separate support tickets from internal admin tools
- Introduce configurable VIP withdrawal schedule and approval flow
- Add audit logs, RLS, and idempotency protections

See [docs/aqe-architecture.md](docs/aqe-architecture.md) for the implementation summary.
