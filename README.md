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
2. Copy `.env.example` to `.env.local` and fill all three Supabase values.
3. Apply `supabase/migrations/001_aqe_foundation.sql` first, then apply root `migrations/0001_init.sql` through `migrations/0012_audit_rls.sql` in filename order.
4. Run `npm test` and `npm run typecheck`.
5. Start the app with `npm run dev`.
6. Check `http://localhost:3000/api/health`.

### Environment variables

- `NEXT_PUBLIC_SUPABASE_URL`: Supabase project URL.
- `NEXT_PUBLIC_SUPABASE_ANON_KEY`: Supabase publishable/anon key.
- `SUPABASE_SERVICE_ROLE_KEY`: server-only key. Never expose or commit it.
- `NEXT_PUBLIC_APP_ENV`: `development`, `staging`, or `production`.

Blank Supabase values enable limited demo mode. Persistent workflows require Supabase configuration and applied migrations.

### Applying migrations

The foundation migration lives in `supabase/migrations/` and the follow-up migrations currently live in the root `migrations/` folder. In Supabase Dashboard, open SQL Editor and run the foundation file first, followed by `migrations/0001_init.sql` through `migrations/0012_audit_rls.sql` in order. Do not run them out of order.

The root migration files are not automatically discovered by `supabase db push`. If using the Supabase CLI, move or consolidate the follow-up files into `supabase/migrations/` with unique timestamp prefixes before running `supabase db push`; do not keep and apply duplicate copies.

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
