# AQE Production Launch Runbook

## 1. Required environment

Set these in the hosting provider's production environment:

- NEXT_PUBLIC_SUPABASE_URL
- NEXT_PUBLIC_SUPABASE_ANON_KEY
- SUPABASE_SERVICE_ROLE_KEY
- NEXT_PUBLIC_APP_ENV=production
- CRON_SECRET
- MUKURU_SEND_MONEY_URL (optional; defaults to Mukuru Send Money)

Never expose SUPABASE_SERVICE_ROLE_KEY or CRON_SECRET to the browser.

## 2. Database migration order

Apply the foundation migration first, then every root migration in filename order through 0038_atomic_daily_qc_claim.sql.

Do not skip or reorder migrations.

## 3. Production Supabase checks

Confirm:

- Auth is enabled.
- The production profiles/user records exist.
- The private profile-media storage bucket exists.
- RLS is enabled on financial, profile, media, subscription, boost, receipt and campaign tables.
- Service-role-only financial RPC permissions are intact.
- Manager/admin accounts have the correct server-side profile role.

## 4. Payment smoke test

Use a controlled test account and verify:

1. Membership upgrade creates a payment order.
2. Manager confirmation changes the requested tier.
3. Welcome bonus is issued once.
4. Referral earnings are issued once.
5. The upgrading member's cash wallet is not incorrectly credited by the membership payment.
6. QC recharge credits only QC.
7. Wallet deposit credits only cash.
8. Membership renewal uses the configured tier renewal price and chains after the current active period.
9. VIP creator-content payment unlocks only the selected VIP's subscriber-only content.
10. Creator-content earnings reach the selected VIP wallet once.
11. Duplicate confirmation does not duplicate money.

## 5. Withdrawal smoke test

Verify:

- 8% service charge.
- Gross amount is reserved atomically.
- Rejection/cancellation refunds the reserved amount.
- PAID removes the pending reservation.
- VIP withdrawals before the 20th are rejected.
- VIP withdrawal day rules are enforced by the application.
- Manager-only finalization works.
- Withdrawal receipt is generated.

## 6. Media smoke test

Verify:

- Independent profile registration accepts the first photo.
- The first photo becomes the profile photo.
- Upload limits follow the member tier.
- Manager moderation works.
- Public media receives signed read access.
- Subscriber-only VIP media does not expose a signed URL to unsubscribed viewers.
- Active subscriber receives access.
- Expired subscriber loses access.

## 7. Membership/content smoke test

Verify separately:

- Basic/Premium/VIP membership renewal.
- VIP creator-content subscription.
- Creator-content expiry.
- Creator-content renewal.
- Membership upgrade does not automatically subscribe a user to another VIP's creator content.

## 8. Hosting gate

Before opening public traffic:

- npm ci --legacy-peer-deps
- npm run typecheck
- npm run test --silent
- npm run build
- GET /api/health
- Confirm production Supabase configuration is reported as ready.
- Confirm the VIP salary cron is configured with CRON_SECRET.
- Confirm CRON_SECRET is stored only as a server-side production environment variable.
- Confirm notifications and upgraded-member state migrations 0037/0038 are applied before testing daily QC claims.
- Confirm the deployment is using the intended production environment variables.

## 9. Business items requiring CEO confirmation

Do not invent these values:

- Destination/accounting treatment for the CEO 12% registration deduction.
- VIP team-leader renewal commission, because the pricing sheet does not specify one.
- Paid profile-boost prices.
- Any platform commission on VIP creator-content subscriptions.

These should be configured before the corresponding financial features are enabled.
