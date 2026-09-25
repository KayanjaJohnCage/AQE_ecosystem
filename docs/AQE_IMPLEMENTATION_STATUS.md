# AQE Implementation Status

Updated: 2026-09-26

## Current state

The repository has moved well beyond the original greenfield foundation. The core AQE customer, manager, wallet/QC, membership, referral, withdrawal, VIP, marketplace, booking, raffle, notification and media infrastructure is present in the current `main` branch.

CI is used as the code-quality gate: lint, TypeScript typecheck, tests and production build must pass before changes are considered mergeable.

## Implemented in code

| Area | Status | Notes |
| --- | --- | --- |
| Customer site / routing | IMPLEMENTED | Customer entry and restricted AQE Control entry are separated. |
| Manager Control | IMPLEMENTED | Separate restricted route and server-side manager/admin role checks. |
| Manager Google + password gate | IMPLEMENTED | Google identity is checked server-side using configured email + immutable Google subject, then the manager password is required. Manager APIs require a signed manager session gate. |
| Membership tiers | IMPLEMENTED | Basic, Premium and VIP pricing/upgrade infrastructure, welcome bonus and entitlement plumbing are present. |
| Cash wallet | IMPLEMENTED | Wallet ledger, atomic mutation paths and withdrawal reservation/refund flows are present. |
| QC | IMPLEMENTED | QC is separate from cash and includes recharge/daily claim/membership-aware server-side operations. |
| Payments | IMPLEMENTED | Mukuru/provider abstraction and Manager Direct queue are present. |
| Wallet deposit minimum | IMPLEMENTED | UGX 5,000 minimum is enforced by API validation and migration constraint for new wallet-deposit orders. |
| Referral / commissions | IMPLEMENTED | Direct/indirect referral infrastructure and commission ledgers are present. |
| VIP Asset Room / salary | IMPLEMENTED | PIN gate, salary ledger and atomic salary transfer infrastructure are present. |
| Withdrawals | IMPLEMENTED | UGX 30,000 minimum, UGX 5,000,000 maximum, 10% service charge, tier restrictions and atomic lifecycle are present. |
| Referral prizes | IMPLEMENTED | Catalogue, eligibility, physical/cash request and manager approval infrastructure are present. |
| VIP creator content | IMPLEMENTED | Subscription/payment/expiry/renewal infrastructure is present. |
| Marketplace | IMPLEMENTED | Product and checkout/commission infrastructure is present. |
| Profile boosts | IMPLEMENTED | Manager-configurable boost pricing and activation infrastructure is present. |
| Bookings | IMPLEMENTED | Customer request and manager approval/rejection infrastructure is present. |
| Raffle | IMPLEMENTED | Configuration and QC-based draw/settlement infrastructure is present. |
| Notifications | IMPLEMENTED | Notification infrastructure and membership/payment/withdrawal-related events are present. |
| Media / storage | IMPLEMENTED | Profile media, tier limits, moderation and private/public access infrastructure are present. |

## Remaining launch work

These are not being hidden as "complete" because they depend on production configuration, business values, external services or live QA.

### 1. Production Manager Authentication Configuration
- [ ] Set `AQE_MANAGER_GOOGLE_EMAIL` to the actual designated AQE Google account.
- [ ] Set `AQE_MANAGER_GOOGLE_SUB` to that Google account's immutable Google subject.
- [ ] Generate and set a strong `AQE_MANAGER_SESSION_SECRET`.
- [ ] Enable Google provider in Supabase Auth.
- [ ] Configure the Google OAuth client and Supabase callback/redirect URLs.
- [ ] Ensure the designated Supabase Auth user has the manager/admin profile role.
- [ ] Set the manager password for that same Supabase Auth user.

### 2. Payment / deposit production setup
- [ ] Set the real payment provider credentials and webhook configuration.
- [ ] Confirm the production receiving phone/card details.
- [ ] Test a UGX 5,000 wallet deposit and a value below UGX 5,000.
- [ ] Test Manager Direct with sender name and phone.
- [ ] Test membership upgrade payment confirmation and duplicate webhook/idempotency behavior.

### 3. Withdrawal production QA
- [ ] Test UGX 30,000 and UGX 5,000,000 boundaries.
- [ ] Test 10% service charge and 90% net payout.
- [ ] Test Basic weekend restriction and two-direct-invite requirement.
- [ ] Test Premium 48-hour application interval.
- [ ] Test VIP configured withdrawal schedule.
- [ ] Test rejection/cancellation refund and Team Leader fee credit on successful payout.

### 4. Business content/configuration
- [ ] Enter final CEO About/contact/footer/social-link values.
- [ ] Configure final tier, boost, VIP content and marketplace values.
- [ ] Upload/host the final CEO prize images and configure their production URLs.
- [ ] Verify promotional labels and prices against the latest approved business sheet.

### 5. Full end-to-end QA
- [ ] Registration -> referral -> membership payment -> commission -> wallet.
- [ ] Wallet -> upgrade/QC/VIP content/marketplace.
- [ ] VIP -> salary -> wallet -> withdrawal.
- [ ] Prize eligibility -> request -> approval -> wallet/fulfilment.
- [ ] Booking -> manager decision -> customer notification.
- [ ] Raffle -> QC entry -> atomic draw -> settlement.
- [ ] Private media/RLS access attempts with another user.
- [ ] Unauthorized manager Google account.
- [ ] Authorized Google account with wrong password.
- [ ] Authorized Google account with correct password on multiple devices.
- [ ] Direct manager API calls without the signed manager session.

### 6. Production infrastructure
- [ ] Apply/verify all migrations in the production Supabase project.
- [ ] Verify RLS policies in production.
- [ ] Configure Vercel production environment variables.
- [ ] Configure CRON and verify scheduled jobs.
- [ ] Verify production health endpoint.
- [ ] Verify Cloudflare DNS, Vercel domain assignment and HTTPS for `afriqueerescortsecosystem.com`.
- [ ] Verify the production Google OAuth redirect URL.

## Business rules locked in current code

- Wallet deposit minimum: **UGX 5,000**.
- Withdrawal minimum: **UGX 30,000**.
- Withdrawal maximum: **UGX 5,000,000**.
- Withdrawal service charge: **10%**.
- Withdrawal net payout: **90% of gross**.
- Basic/Premium minimum direct invites before withdrawal: **2**.
- Basic withdrawal window: **weekends**.
- Premium withdrawal interval: **48 hours**.
- VIP withdrawal schedule remains configurable by the system/business settings.
- VIP salary: **UGX 10,000 per direct invite**, separate from referral commission.
- Daily free QC claim: **5 QC**.
- QC remains separate from the cash wallet.

## Important distinction

"Implemented" above means the application logic exists in the repository and passes the automated code gate. It does **not** mean that live Supabase, Google OAuth, payment-provider credentials, Cloudflare/Vercel DNS, production migrations or real-money transactions have been verified from this repository alone.
