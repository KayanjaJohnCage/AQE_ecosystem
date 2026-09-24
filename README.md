# AQE Ecosystem

AQE is a greenfield MVP ecosystem for customer, manager, VIP, and wallet workflows. This repository is being rebuilt around a real production architecture using Next.js, TypeScript, Supabase, and server-side authorization.

## Stack

- Next.js 16
- TypeScript
- Supabase Auth + PostgreSQL + Storage
- Vitest
- Zod

## Current status

The application foundation and server-side business workflows are implemented. This includes Supabase Auth, RBAC, profiles, RLS migrations, QC charging, wallets, payments, subscriptions, media uploads, support, VIP withdrawals, bookings, marketplace products, comments, messaging, and audit logging.

## Local setup

1. Install dependencies with `npm install`.
2. Copy `.env.example` to `.env.local` and fill the Supabase values.
3. Apply `supabase/migrations/001_aqe_foundation.sql`, then root `migrations/0001_init.sql` through the latest migration (`0039_membership_aware_qc_chat.sql`) in filename order.
4. Run `npm test`, `npm run typecheck`, and `npm run build`.
5. Start the app with `npm run dev`.
6. Check `/api/health` before accepting real traffic.

### Environment variables

- `NEXT_PUBLIC_SUPABASE_URL`: Supabase project URL.
- `NEXT_PUBLIC_SUPABASE_ANON_KEY`: Supabase publishable/anon key.
- `SUPABASE_SERVICE_ROLE_KEY`: server-only key. Never expose or commit it.
- `NEXT_PUBLIC_APP_ENV`: `development`, `staging`, or `production`.
- `CRON_SECRET`: server-only secret required by the VIP salary cron.
- `MUKURU_SEND_MONEY_URL` (optional): payment instruction URL.

Blank Supabase values enable limited demo mode. Persistent workflows require Supabase configuration and applied migrations.

### Applying migrations

The foundation migration lives in `supabase/migrations/` and the follow-up migrations currently live in the root `migrations/` folder. In Supabase Dashboard, open SQL Editor and run the foundation file first, followed by `migrations/0001_init.sql` through `migrations/0015_wallet_referrals_atomic_payment.sql` in order. Do not run them out of order. Migration `0015` adds unique referral links, direct/indirect earnings, an idempotent cash-wallet ledger, and the server-only payment confirmation function.

The root migration files are not automatically discovered by `supabase db push`. If using the Supabase CLI, move or consolidate the follow-up files into `supabase/migrations/` with unique timestamp prefixes before running `supabase db push`; do not keep and apply duplicate copies.

The current migration sequence extends through `0039_membership_aware_qc_chat.sql`. Migration `0039` enforces the current membership rule: upgraded members are free for QC chat while registered/unupgraded members are charged. Apply migrations strictly in filename order. The latest migrations add atomic withdrawals, profile media limits/boosts, receipts, campaigns, VIP salary, renewal commissions, separate VIP creator-content subscriptions, subscriber-only media RLS, renewal chaining, and the private media storage bucket.

## Important rules

- Do not fake financial confirmation.
- QC and wallet operations must be server-side.
- VIP-specific access is controlled by the server, not browser state.
- Use Supabase Storage and database records for all media.

## Production boundaries

- Apply all migrations before staging or production use.
- Connect real payment provider credentials and webhooks before accepting money.
- Keep `SUPABASE_SERVICE_ROLE_KEY` server-only.
- Demo fallback behavior is for local development only.

## Verification

Verify with `npm run typecheck`, `npm test`, and `npm run build`. Use `npm run dev` for local development and `/api/health` to inspect configuration.

## Cron secret

AQE uses `CRON_SECRET` to protect server-side scheduled endpoints such as the VIP salary job. Vercel sends this value as `Authorization: Bearer <CRON_SECRET>` when it invokes a configured cron route. Keep the secret only in the hosting provider's server environment; never put it in `NEXT_PUBLIC_*`, browser code, Git, or screenshots.

Generate a long random value (Vercel recommends at least 16 characters), set the same value in the production environment, and redeploy. If `CRON_SECRET` is missing or the Authorization header does not match, AQE returns HTTP 401 and the scheduled job does not run.
