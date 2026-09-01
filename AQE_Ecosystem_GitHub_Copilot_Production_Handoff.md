# AQE ECOSYSTEM — GITHUB COPILOT PRODUCTION HANDOFF GUIDE

**Document purpose:** This is the authoritative implementation brief for GitHub Copilot/Copilot Agent when setting up and developing the real AQE Ecosystem repository.

**Important:** The two supplied HTML files are the visual/product baselines. Preserve their UI, layout, terminology, navigation, and interaction intent. Convert them into the production Next.js application instead of redesigning the product.

---

## 1. MISSION

Build a real, production-ready AQE Ecosystem web platform from the supplied customer and manager HTML prototypes.

The goal is to have a working system that can be:

- cloned from GitHub
- installed locally
- configured with environment variables
- started in development
- tested end-to-end
- deployed to staging
- tested with real payment-provider sandbox/test flows
- promoted to production

The implementation should prioritize:

1. correctness
2. security
3. server-authoritative financial operations
4. smooth user experience
5. preserving the existing AQE UI
6. simple maintainable architecture
7. automated testing
8. fast launch

Do NOT over-engineer the system.

---

# 2. AUTHORITATIVE PRODUCT RULES

These rules are product requirements and must not be changed by Copilot unless the project owner explicitly changes them.

## 2.1 User tiers

### Basic

Basic users are primarily view-only.

Basic users must upgrade to Premium or VIP to access restricted functionality.

### Premium

Premium users have:

- independent profile
- 3 included profile photos
- ability to upload profile photos
- ability to select any uploaded photo as profile picture
- additional profile photos cost 5 QC each
- access to QC balance/history/recharge
- daily 5-message chat allowance
- normal customer ecosystem features

Premium does NOT receive VIP-only features.

### VIP

VIP includes everything in Premium plus:

- unlimited profile photos
- video uploads
- Asset Room
- Store
- Tasks
- Rewards
- Invites/referrals
- Raffle
- My Team
- Groups
- Voice notes
- Booking Queue
- other explicitly VIP-only ecosystem modules

---

# 3. VIP-ONLY ACCESS

The following require VIP:

- My Team
- VIP Tasks
- Rewards
- Raffle
- Invites/referrals
- VIP Hub
- Booking Queue
- Media Vault / Asset Room
- My Store
- Groups
- Voice notes where marked VIP-only

If a Basic or Premium user attempts to access a VIP-only feature:

- do not expose protected data
- show an upgrade prompt
- preserve their current page/state where practical
- never rely only on hidden UI elements for authorization

Authorization must also be enforced server-side.

---

# 4. QC — SINGLE GLOBAL CREDIT SYSTEM

QC is the ONLY AQE credit currency.

Do not recreate separate Booking Credits and Chat Credits.

## 4.1 QC usage

QC can be consumed by:

- chat after the daily allowance is exhausted
- booking requests
- DM access requests
- paid content
- extra Premium profile photos
- future paid AQE functionality

## 4.2 QC chat rule

Premium and VIP users receive a daily allowance of:

**5 chat messages per day**

The first 5 chat messages use the daily allowance.

After the daily allowance is exhausted:

- each additional chat message consumes 1 QC from the global QC balance

If:

- daily allowance is exhausted
- AND global QC balance is 0

then chat is blocked immediately and the user must recharge QC.

Important:

**Recharging QC does NOT reset the daily 5-message allowance.**

The daily allowance and global QC balance are separate concepts.

Basic users do not receive the Premium/VIP daily chat allowance unless product rules explicitly grant it later.

## 4.3 QC pricing

Current prototype pricing:

| QC | Price |
|---:|---:|
| 10 QC | UGX 10,000 |
| 25 QC | UGX 25,000 |
| 50 QC | UGX 50,000 |
| 100 QC | UGX 100,000 |
| 250 QC | UGX 250,000 |

Current prototype assumption:

**1 QC = UGX 1,000**

Make pricing configurable in the database/configuration layer rather than hardcoding it throughout the frontend.

## 4.4 Other QC costs

Current rules:

- DM access request = 5 QC
- Photo content = 10 QC
- Video content = 20 QC
- extra Premium profile photo = 5 QC

These should be represented as configurable product/feature pricing where practical.

## 4.5 QC history

Premium and VIP users must be able to see:

- current QC balance
- QC earned
- QC purchased
- QC spent
- transaction history
- date/time
- reason/source
- reference where applicable
- balance after transaction

QC must be implemented as an immutable ledger.

Recommended fields:

- id
- user_id
- transaction_type
- amount
- balance_after
- source
- reference_type
- reference_id
- description
- created_at

Never edit historical ledger entries to correct balances.

Corrections must be new reversal/adjustment entries.

---

# 5. PROFILE MEDIA

## Premium

- first 3 profile images included
- additional images cost 5 QC each
- can remove images
- can choose any uploaded image as profile picture

## VIP

- unlimited profile images
- video uploads
- can choose any uploaded image as profile picture

## Basic

- cannot upload profile media unless explicitly changed later

## Production requirements

Prototype data URLs must NOT be used in production.

Use:

- Supabase Storage for media files
- PostgreSQL metadata records
- signed/private URLs where content is protected
- server-side entitlement checks
- file-size/type validation
- safe upload limits
- moderation capability

Never expose verification documents through public profile APIs.

---

# 6. EXPLORE / PROFILE ACTIONS

Profile actions must be:

- Book Now
- Comment

NOT Message.

When a user selects:

### Book Now

Open booking flow with that profile/user preselected.

### Comment

Open comments with that profile/user preselected.

The profile header chat icon was also changed to comment.

Do not reintroduce Message as the profile-header action unless explicitly requested.

---

# 7. BOOKINGS

Bookings consume global QC where the relevant booking action is paid.

Booking architecture should support:

- booking request
- requester
- target profile/creator
- booking type
- status
- QC cost
- payment/ledger reference
- timestamps
- cancellation
- approval/rejection
- completion
- dispute handling where required

VIP users have access to Booking Queue.

All financial/QC deductions must happen server-side.

---

# 8. COMMENTS, CHAT AND DM

## Comments

Comments are separate from private chat.

Profile comments must use the selected profile as context.

## Chat

Each message is subject to the QC/daily allowance rules.

The server must decide whether a message:

1. uses one of the daily 5 allowances, or
2. consumes 1 QC

Do not let the browser decide.

## DM access

DM access request = 5 QC.

Implement:

- request
- payment/QC deduction
- acceptance/rejection where applicable
- conversation access
- audit trail

---

# 9. WALLET / FINANCIAL MODEL

The AQE user-facing Wallet represents an internal platform balance/ledger.

AQE should NOT be represented as a bank or licensed e-money issuer unless the appropriate legal/regulatory structure exists.

The recommended architecture is:

Payment provider / regulated rail
        ↓
AQE financial ledger
        ↓
User Wallet / QC
        ↓
Purchases / subscriptions / payouts

Real money remains with regulated payment/banking rails.

AQE maintains an auditable internal ledger representing user balances and platform accounting.

## Treasury concepts

Manager-facing concepts may include:

- OPERATING
- CUSTOMER_FUNDS
- CREATOR_PAYABLES
- REVENUE
- FEES

Do not automatically classify customer funds as AQE revenue.

Example only:

Customer pays UGX 100,000
- payment fee: UGX 3,000
- creator entitlement: UGX 80,000
- AQE revenue: UGX 17,000

The actual commercial split must remain configurable.

---

# 10. WALLET CAPABILITIES

Users should be able to:

- view wallet balance
- view wallet history
- deposit/recharge
- purchase subscriptions
- purchase products/services
- recharge QC
- request withdrawals where eligible
- view transaction/receipt information

But all wallet operations must be server-controlled.

Never trust a balance sent from the browser.

Never implement:

```text
clientBalance += amount
```

as a source of truth.

The database ledger is the source of truth.

---

# 11. PAYMENT PROVIDER

Preferred launch provider:

**Flutterwave**

Use the provider for:

- UGX payments
- Uganda mobile money
- subscriptions/payments as supported
- payouts/withdrawals as supported

Do not build a custom payment processor.

## Payment flow

Recharge/payment:

1. user chooses amount/package
2. frontend calls secure server endpoint
3. server creates payment transaction
4. server creates unique transaction reference
5. user completes payment with Flutterwave
6. Flutterwave sends webhook
7. server validates webhook
8. server verifies transaction with Flutterwave
9. verify:
   - transaction status
   - amount
   - currency
   - customer
   - transaction/reference
10. only then credit AQE ledger
11. create receipt
12. notify user

Never credit wallet/QC simply because the frontend says payment succeeded.

Webhooks must be idempotent.

Repeated webhooks must not credit the user twice.

---

# 12. WITHDRAWALS

Withdrawal flow:

1. user requests withdrawal
2. server validates balance
3. server checks eligibility
4. create withdrawal record
5. lock/reserve relevant amount
6. risk/compliance checks
7. manager approval where required
8. initiate provider payout
9. verify provider response/status
10. update ledger
11. release/settle locked balance
12. notify user
13. create audit event

Support:

- pending
- approved
- rejected
- processing
- paid
- failed
- reversed

Never delete financial records.

---

# 13. RECONCILIATION

The system must support reconciliation between:

- AQE internal financial ledger
- Flutterwave transactions
- Flutterwave settlement information
- bank/payment settlement where applicable

Build transaction references so every financial movement can be traced.

Recommended identifiers:

- internal transaction ID
- provider transaction ID
- provider tx_ref
- user ID
- ledger entry ID
- related purchase/subscription/withdrawal ID

---

# 14. DATABASE

Use:

**PostgreSQL via Supabase**

Use migrations as the source of truth.

Recommended entities:

- profiles
- profile_media
- subscriptions
- wallet_accounts
- wallet_ledger
- financial_transactions
- qc_accounts
- qc_ledger
- chat_daily_usage
- bookings
- booking_items
- dm_requests
- conversations
- messages
- vip_assets
- asset_purchases
- stores
- products
- orders
- tasks
- task_completions
- rewards
- raffles
- raffle_entries
- teams
- team_members
- referrals
- notifications
- comments
- reviews
- verification_cases
- verification_documents
- support_tickets
- moderation_cases
- risk_alerts
- withdrawals
- admin_users
- admin_roles
- admin_permissions
- audit_logs
- announcements
- feature_flags

Do not blindly create every table before understanding relationships. Build migrations in logical groups.

---

# 15. DATABASE TRANSACTION RULE

Operations involving money or QC must be atomic.

Examples:

Recharge:

payment verified
→ financial transaction
→ wallet ledger
→ QC ledger if applicable
→ balance update
→ receipt

Purchase:

validate entitlement
→ validate balance
→ debit
→ purchase record
→ creator payable
→ platform revenue
→ audit event

If a multi-step financial operation fails, it must not leave partially applied balances.

Use database transactions / secure server-side database functions where appropriate.

---

# 16. LEDGER RULES

Wallet and QC ledgers are immutable.

Never:

- edit old financial entries
- delete old financial entries
- directly overwrite balances without a ledger reason

Corrections use:

- reversal
- refund
- adjustment

with a new record referencing the original transaction.

Balances may be cached/materialized for performance, but the ledger remains authoritative.

---

# 17. CREATOR EARNINGS

Creator earnings should support:

- pending
- available
- locked/reserved
- withdrawn
- reversed

This is necessary for:

- purchases
- bookings
- content sales
- payouts
- disputes/refunds

Do not immediately mark every incoming purchase as withdrawable if a hold period or dispute process applies.

---

# 18. AUTHENTICATION

Use:

**Supabase Auth**

Support at minimum:

- email authentication
- secure sessions
- logout
- password reset
- protected routes

Keep authentication logic server-aware.

Do not build custom authentication.

---

# 19. AUTHORIZATION

Use a central entitlement/permission system.

Do not scatter rules such as:

```text
if (user.tier === "VIP")
```

through hundreds of components.

Create reusable authorization helpers such as:

- canAccessFeature()
- requireTier()
- requireRole()
- canUploadProfileMedia()
- canSendMessage()
- canUseVipAssetRoom()
- canWithdraw()
- canManageUser()

UI checks are for UX.

Server-side checks are the real security boundary.

---

# 20. ADMIN / MANAGER

The supplied AQE manager HTML is the UI baseline.

Preserve its information architecture.

Current manager areas include:

## Operations

- Dashboard
- Users & Profiles
- Verification Queue
- Subscriptions
- Bookings & Requests
- Marketplace & Stores
- VIP Asset Room

## Trust & Finance

- Reports & Moderation
- Customer Support
- Transactions & Receipts
- Withdrawals
- AML / Risk Alerts

## Growth

- Announcements
- Global Notifications
- Rewards & Tasks
- Referrals

## Control

- Roles & Permissions
- Audit Logs
- Global Settings
- Feature Flags

The original manager UI explicitly emphasizes operational queues, trust, finance and platform control. Preserve that structure.

Manager dashboard metrics must become database-derived rather than hardcoded demo numbers.

---

# 21. MANAGER SECURITY

Manager/admin functionality is highly privileged.

Requirements:

- role-based access control
- least privilege
- audit logging
- server-side authorization
- step-up authentication for sensitive actions
- rate limiting for sensitive actions
- protected routes
- no public exposure of private verification documents
- no client-side-only admin controls

Sensitive actions should record:

- actor
- role
- action
- target
- previous state where appropriate
- new state where appropriate
- reason
- timestamp
- request/correlation ID

---

# 22. AUDIT LOGS

Audit logs should cover at least:

- login/security events
- admin access
- subscription changes
- wallet adjustments
- QC adjustments
- withdrawals
- refunds
- verification decisions
- moderation decisions
- user suspension
- permission changes
- feature flag changes
- sensitive asset access
- payment events

Audit logs must be append-only.

---

# 23. MODERATION

Support moderation for:

- profiles
- media
- messages
- comments
- products
- reviews
- reports
- risk signals
- escalations

Manager UI should expose queues and statuses.

Do not expose private moderation/verification data through public APIs.

---

# 24. VIP ASSET ROOM

VIP Asset Room supports:

- photos
- videos
- other saleable assets

Requirements:

- VIP authorization
- protected storage
- asset metadata
- pricing in QC where applicable
- purchase tracking
- access events
- moderation
- secure delivery

Private assets must not be publicly accessible simply because a URL is known.

Use private buckets/signed URLs where appropriate.

---

# 25. STORES / MARKETPLACE

VIP users can have stores.

Support:

- store profile
- products
- pricing
- inventory where applicable
- digital delivery where applicable
- orders
- disputes
- product moderation
- seller/creator earnings

Manager UI should support product/store/order oversight.

---

# 26. TASKS / REWARDS / REFERRALS / RAFFLE / TEAMS

Implement these as separate modules with server-side eligibility.

### Tasks

- task definitions
- completion
- validation
- reward
- anti-abuse checks

### Rewards

- campaigns
- reward rules
- eligibility
- issuance
- ledger/audit trail

### Referrals

- referral relationship
- attribution
- commissions
- hold period
- caps
- versioned rules

Historical referral earnings must remain explainable even after rules change.

### Raffle

- raffle definition
- entry eligibility
- entries
- draw/result
- auditability

### Teams

- team
- team members
- roles
- invitations
- permissions

---

# 27. NOTIFICATIONS

Support:

- in-app notifications
- payment confirmations
- QC recharge confirmations
- booking updates
- subscription updates
- withdrawal updates
- moderation/account notices
- manager announcements

Create a central notification system rather than ad-hoc browser alerts.

---

# 28. FEATURE FLAGS

Use feature flags for incomplete or risky modules.

The manager UI already includes feature flag concepts such as:

- Messaging V2
- VIP Asset Room
- Rewards campaigns
- Referral Level 2
- New payment adapter

Feature flags should be stored server-side and respected by both frontend and backend.

Never use feature flags as a replacement for authorization.

---

# 29. TECH STACK

Use:

- Next.js
- TypeScript
- React
- PostgreSQL
- Supabase Auth
- Supabase Storage
- Supabase database
- Flutterwave
- Vercel
- GitHub
- GitHub Actions

Avoid during initial launch:

- microservices
- Kubernetes
- GraphQL
- Redis clusters
- custom auth
- custom payment processing
- separate Python backend
- native mobile apps
- unnecessary infrastructure

Keep the architecture simple.

---

# 30. ENVIRONMENTS

Use three logical environments:

### Development

Local development + Supabase development project + Flutterwave test credentials.

### Preview/Staging

Vercel preview deployment + development/staging Supabase + test payment credentials.

### Production

Vercel production + production Supabase + live payment credentials.

Never mix:

- production secrets into development
- test credentials into production
- development databases with production users

---

# 31. ENVIRONMENT VARIABLES

Create:

`.env.example`

Include placeholders only.

Expected categories:

```text
NEXT_PUBLIC_SUPABASE_URL=
NEXT_PUBLIC_SUPABASE_ANON_KEY=

SUPABASE_SERVICE_ROLE_KEY=

FLUTTERWAVE_PUBLIC_KEY=
FLUTTERWAVE_SECRET_KEY=
FLUTTERWAVE_ENCRYPTION_KEY=
FLUTTERWAVE_WEBHOOK_SECRET=

NEXT_PUBLIC_APP_URL=
```

Use the exact environment variables required by the current SDK/API implementation.

Never commit real secrets.

Never expose service-role credentials to the browser.

---

# 32. STORAGE

Use Supabase Storage.

Suggested separation:

- public profile-safe media where genuinely public
- protected VIP assets
- verification documents
- private user uploads

Verification documents should be private.

Use signed URLs and server-side authorization.

Validate:

- MIME type
- extension
- file size
- upload ownership
- tier entitlement
- storage path

---

# 33. UI MIGRATION RULE

The two supplied HTML files are prototypes.

Do NOT simply embed the HTML in an iframe.

Do NOT redesign the UI unnecessarily.

Convert:

- HTML → React components
- CSS → maintainable styling
- JavaScript interactions → React/server actions
- fake arrays → database queries
- toast-only actions → real actions
- hardcoded metrics → database metrics

Preserve:

- layout
- navigation
- labels
- terminology
- visual hierarchy
- user flow
- manager information architecture

Improve accessibility and responsiveness where needed without changing the product identity.

---

# 34. SOURCE FILES

The project owner will provide two HTML files to Copilot:

1. Customer frontend — latest AQE Unified QC / Phase 8 version
2. Manager frontend — AQE Ecosystem Manager / Phase 9 version

Treat the latest supplied files as the visual source of truth.

Earlier prototypes are historical references only.

The manager prototype currently contains demo/static values and toast-based actions; these must be replaced by real backend functionality.

---

# 35. ROUTING

Suggested structure:

```text
/
├── auth/
│   ├── login
│   ├── signup
│   └── reset-password
│
├── dashboard
├── explore
├── profile/[id]
├── comments
├── bookings
├── messages
├── wallet
├── qc
├── subscriptions
├── media
├── store
├── tasks
├── rewards
├── invites
├── raffle
├── team
├── groups
│
└── manager/
    ├── dashboard
    ├── users
    ├── verification
    ├── subscriptions
    ├── bookings
    ├── marketplace
    ├── assets
    ├── moderation
    ├── support
    ├── transactions
    ├── withdrawals
    ├── risk
    ├── announcements
    ├── notifications
    ├── rewards
    ├── referrals
    ├── permissions
    ├── audit
    ├── settings
    └── flags
```

Adjust routing if necessary to fit the actual Next.js App Router implementation, but preserve these product destinations.

---

# 36. API / SERVER ACTION PRINCIPLES

Use Next.js server routes/actions for backend operations where appropriate.

Examples:

```text
POST /api/qc/recharge
POST /api/qc/spend
POST /api/bookings
POST /api/messages
POST /api/wallet/deposit
POST /api/wallet/withdraw
POST /api/payments/flutterwave/webhook
POST /api/subscriptions
POST /api/media/upload
```

Exact routing may differ.

Rules:

- validate every request
- authenticate every private request
- authorize every sensitive operation
- validate amounts server-side
- use database transactions
- use idempotency for payment/webhook operations
- log important actions
- return safe error messages

---

# 37. VALIDATION

Use a schema validation library such as Zod if appropriate.

Validate:

- UUIDs/IDs
- amounts
- currencies
- tier values
- payment references
- uploaded file metadata
- pagination
- user input
- admin actions

Never trust:

- client tier
- client balance
- client QC balance
- client payment status
- client permissions

---

# 38. SECURITY BASELINE

Before production:

- Supabase RLS enabled on user data
- private tables protected
- admin APIs protected
- service role key server-only
- secrets outside Git
- secure cookies/session handling
- rate limiting on sensitive endpoints
- webhook verification
- payment verification
- idempotency
- input validation
- file validation
- authorization checks
- audit logging
- safe error handling
- no sensitive data in logs
- no verification documents in public APIs

---

# 39. TESTING STRATEGY

Testing must be part of development, not something added at the end.

Use appropriate automated tests for:

## Unit tests

Test pure business rules:

- QC deduction
- daily chat allowance
- tier entitlements
- subscription status
- referral calculations
- wallet calculations
- withdrawal eligibility

## Integration tests

Test:

- database operations
- RLS
- payment webhook handling
- QC ledger
- wallet ledger
- subscription activation
- booking creation
- media authorization

## End-to-end tests

Test critical user journeys:

### Journey A — Signup

signup
→ login
→ profile
→ dashboard

### Journey B — Premium

upgrade
→ Premium active
→ 3 included photos
→ fourth photo costs 5 QC

### Journey C — VIP

upgrade
→ VIP active
→ VIP-only navigation available
→ video upload
→ Asset Room
→ Store
→ Tasks
→ Rewards
→ Invites
→ Raffle
→ Team
→ Groups

### Journey D — QC

recharge
→ payment
→ webhook
→ verification
→ QC credited
→ history updated

### Journey E — Chat

Premium/VIP:
message 1
→ allowance 1/5

...
message 5
→ allowance 5/5

message 6
→ consume 1 QC

QC = 0
→ message blocked

recharge QC
→ QC increases
→ daily allowance remains exhausted

### Journey F — Booking

profile
→ Book Now
→ correct user preselected
→ QC check
→ QC deduction
→ booking created

### Journey G — Wallet

deposit
→ payment
→ wallet credited

purchase
→ wallet/QC deducted
→ transaction recorded

withdraw
→ eligibility
→ request
→ approval/risk
→ payout
→ ledger update

### Journey H — Manager

manager login
→ dashboard
→ user search
→ user detail
→ subscription
→ transaction
→ withdrawal
→ moderation
→ audit log

---

# 40. PAYMENT TESTING

Before live payments:

- use Flutterwave test environment
- test successful payment
- test failed payment
- test cancelled payment
- test duplicate webhook
- test wrong amount
- test wrong currency
- test invalid signature/webhook
- test delayed webhook
- test provider verification failure
- test retry behavior

The wallet/QC must never be credited from an unverified frontend callback.

---

# 41. FINANCIAL TEST CASES

Explicitly test:

1. UGX 10,000 → 10 QC
2. UGX 25,000 → 25 QC
3. UGX 50,000 → 50 QC
4. UGX 100,000 → 100 QC
5. UGX 250,000 → 250 QC

Test insufficient QC.

Test insufficient wallet balance.

Test simultaneous spending requests.

Test duplicate requests.

Test webhook replay.

Test refund/reversal.

Test withdrawal failure.

Test withdrawal retry.

Test ledger consistency.

---

# 42. CONCURRENCY / DOUBLE-SPEND PROTECTION

This is critical.

Two simultaneous requests must not be able to spend the same balance.

Use:

- database transactions
- row locking / atomic update patterns
- constraints
- idempotency keys
- unique provider transaction IDs

Test concurrent QC spending and concurrent wallet spending.

---

# 43. CI/CD

GitHub Actions should run:

```text
npm install / npm ci
→ lint
→ typecheck
→ unit tests
→ integration tests where configured
→ build
```

Recommended workflow:

```text
feature branch
      ↓
GitHub push
      ↓
CI
      ↓
Vercel preview
      ↓
manual QA
      ↓
pull request
      ↓
main
      ↓
production deployment
```

Do not automatically deploy unfinished experimental branches to production.

---

# 44. DEVELOPMENT ORDER

Follow this order.

## DAY 1 — FOUNDATION

- initialize repository
- Next.js
- TypeScript
- App Router
- Supabase connection
- environment setup
- linting
- formatting
- testing foundation
- GitHub Actions
- basic route structure
- import customer UI
- import manager UI shell

## DAY 2 — DATABASE + AUTH

- database migrations
- profiles
- tiers
- subscriptions
- Supabase Auth
- RLS
- protected routes
- authorization foundation

## DAY 3 — PROFILES + MEDIA

- profiles
- Premium 3-image rule
- 5 QC extra image rule
- VIP unlimited images
- VIP videos
- profile-picture selection
- Storage
- signed URLs/private assets

## DAY 4 — WALLET + QC

- wallet account
- financial ledger
- QC account
- QC ledger
- daily chat usage
- QC history
- recharge packages
- atomic spending

## DAY 5 — PAYMENTS

- Flutterwave adapter
- payment creation
- webhook
- verification
- idempotency
- receipts
- test payments
- reconciliation foundation

## DAY 6 — BOOKINGS + CHAT

- Book Now
- Comments
- DM requests
- chat
- daily 5-message allowance
- QC spending
- booking flow

## DAY 7 — VIP ECOSYSTEM

- Asset Room
- Store
- Tasks
- Rewards
- Invites
- Raffle
- Team
- Groups
- Voice notes where required

## DAY 8 — MANAGER

- real manager authentication
- RBAC
- users
- verification
- subscriptions
- bookings
- transactions
- withdrawals
- moderation
- support
- risk
- rewards
- referrals
- audit
- settings
- feature flags

## DAY 9 — SECURITY + TESTING

- RLS review
- authorization review
- financial tests
- concurrency tests
- payment tests
- E2E tests
- file-security tests
- admin-security tests

## DAY 10 — STAGING

- Vercel staging/preview
- staging Supabase
- Flutterwave test
- smoke tests
- monitoring
- error handling
- mobile/desktop QA

## DAY 11 — LAUNCH READINESS

- final migration
- production environment
- production secrets
- domain
- payment live credentials
- final smoke tests
- rollback plan
- soft launch

---

# 45. COPILOT WORKING RULES

When implementing:

1. Inspect the existing repository before creating files.
2. Inspect both supplied HTML prototypes completely.
3. Preserve the UI.
4. Do not delete working product behavior without a replacement.
5. Replace prototype behavior with production equivalents.
6. Do not invent new product rules.
7. Ask only when a genuinely blocking business decision is missing.
8. Prefer simple solutions.
9. Keep business logic centralized.
10. Never put secrets in source code.
11. Never trust client balances.
12. Never trust client payment status.
13. Never trust client tier/role.
14. Use migrations for database changes.
15. Add tests with important business logic.
16. Run typecheck/lint/tests/build after meaningful changes.
17. Fix errors before moving to the next stage.
18. Keep commits small and descriptive.
19. Do not redesign the AQE interface.
20. Do not introduce unnecessary frameworks or infrastructure.

---

# 46. DEFINITION OF DONE

A module is NOT complete just because its UI renders.

A module is complete when:

- UI works
- backend works
- database works
- authorization works
- validation works
- errors are handled
- audit/ledger requirements are satisfied
- tests exist
- tests pass
- TypeScript passes
- lint passes
- production build passes

For financial features, additionally:

- transaction is atomic
- duplicate processing is prevented
- ledger is auditable
- provider verification exists
- failure/reversal path exists

---

# 47. LOCAL SETUP EXPERIENCE

The finished repository should allow a developer to do approximately:

```bash
git clone <repo>
cd aqe-ecosystem
npm install
cp .env.example .env.local
# fill development environment variables
npm run dev
```

Expected result:

```text
AQE Ecosystem available locally
Customer application works
Manager application works
Supabase connected
Database migrations available
Authentication works
Tests can run
Build can run
```

Also provide scripts similar to:

```text
npm run dev
npm run build
npm run start
npm run lint
npm run typecheck
npm run test
npm run test:e2e
```

Use the exact package/tooling choices that are installed.

---

# 48. README REQUIREMENTS

The repository README must explain:

- what AQE is
- stack
- prerequisites
- local setup
- environment variables
- Supabase setup
- database migrations
- test commands
- build commands
- deployment
- payment test mode
- production deployment
- security notes
- architecture overview

A new developer should be able to clone the repo and understand how to run it without asking the project owner basic setup questions.

---

# 49. IMPORTANT PROTOTYPE → PRODUCTION CONVERSIONS

Replace all prototype-only mechanisms.

### Replace:

browser local state
→ Supabase database

browser data URLs
→ Supabase Storage

hardcoded balances
→ wallet/QC ledger

hardcoded users
→ profiles database

hardcoded metrics
→ database queries

toast-only buttons
→ server actions/API

fake payment success
→ Flutterwave verification

browser tier checks
→ server authorization

browser QC deduction
→ transactional QC ledger

browser admin controls
→ RBAC + server authorization

browser audit simulation
→ persistent audit_logs

static feature flags
→ database-backed feature flags

---

# 50. DATA OWNERSHIP

The system should have clear sources of truth:

| Data | Source of truth |
|---|---|
| Authentication | Supabase Auth |
| Profile | PostgreSQL |
| Tier | subscriptions / entitlement records |
| QC | qc_ledger / qc_accounts |
| Wallet | wallet_ledger / wallet_accounts |
| Payments | financial_transactions + provider |
| Media | Supabase Storage + profile_media |
| Bookings | PostgreSQL |
| Messages | PostgreSQL |
| Orders | PostgreSQL |
| Admin permissions | PostgreSQL/RBAC |
| Audit | audit_logs |
| Feature flags | feature_flags |

---

# 51. REGULATORY / FINANCIAL CAUTION

AQE should not be described as a bank or e-money issuer unless properly licensed/structured.

The initial architecture should use regulated payment rails/provider services and maintain an internal AQE accounting/ledger layer.

Before offering unrestricted stored-value functionality or making regulatory claims in Uganda, obtain appropriate legal/compliance confirmation.

This is an implementation constraint, not a reason to stop development.

---

# 52. PRODUCTION OBSERVABILITY

Implement enough observability to diagnose:

- payment failures
- webhook failures
- database errors
- authentication failures
- failed withdrawals
- failed uploads
- authorization failures
- unexpected application errors

Do not log:

- passwords
- secrets
- full payment credentials
- private verification documents
- sensitive personal data unnecessarily

Use request/correlation IDs for important server operations.

---

# 53. ERROR HANDLING

User-facing errors should be:

- understandable
- safe
- actionable

Do not expose raw database errors, stack traces, secrets, or provider credentials.

Server logs may contain diagnostic details where appropriate, but user responses must remain safe.

---

# 54. MOBILE / RESPONSIVE REQUIREMENT

The existing AQE interface must work on:

- desktop
- tablet
- mobile

Do not redesign the product, but fix layout issues that prevent practical mobile use.

Test at common viewport sizes.

---

# 55. PERFORMANCE

Prioritize:

- server-side data fetching where appropriate
- optimized images
- lazy loading large media
- pagination for large tables/lists
- database indexes
- efficient queries
- no unnecessary client-side polling

Do not prematurely introduce Redis or other infrastructure.

---

# 56. LAUNCH SMOKE TEST CHECKLIST

Before launch:

### Customer

- [ ] signup
- [ ] login
- [ ] logout
- [ ] profile
- [ ] explore
- [ ] Book Now
- [ ] Comment
- [ ] Premium upgrade
- [ ] VIP upgrade
- [ ] profile image upload
- [ ] profile image selection
- [ ] VIP video upload
- [ ] QC recharge
- [ ] QC history
- [ ] daily chat allowance
- [ ] paid chat after allowance
- [ ] booking
- [ ] DM request
- [ ] wallet deposit
- [ ] purchase
- [ ] withdrawal request
- [ ] notifications

### VIP

- [ ] Asset Room
- [ ] Store
- [ ] Tasks
- [ ] Rewards
- [ ] Invites
- [ ] Raffle
- [ ] Team
- [ ] Groups
- [ ] Booking Queue

### Manager

- [ ] manager login
- [ ] role checks
- [ ] dashboard
- [ ] users
- [ ] verification
- [ ] subscriptions
- [ ] bookings
- [ ] marketplace
- [ ] Asset Room
- [ ] moderation
- [ ] support
- [ ] transactions
- [ ] withdrawals
- [ ] risk
- [ ] rewards
- [ ] referrals
- [ ] permissions
- [ ] audit
- [ ] settings
- [ ] feature flags

### Financial

- [ ] successful payment
- [ ] failed payment
- [ ] duplicate webhook
- [ ] wrong amount
- [ ] wrong currency
- [ ] QC credit
- [ ] QC debit
- [ ] wallet credit
- [ ] wallet debit
- [ ] refund
- [ ] withdrawal
- [ ] withdrawal failure
- [ ] reconciliation

---

# 57. FINAL COPILOT INSTRUCTION

You are acting as the implementation engineer for AQE Ecosystem.

Start by inspecting:

1. the current repository
2. the customer HTML file
3. the manager HTML file
4. this guide

Then create an implementation plan in the repository README or a development-plan document.

After that, implement the system incrementally in the development order above.

At each stage:

- inspect
- implement
- migrate
- test
- typecheck
- lint
- build
- fix errors
- continue

Do not claim a feature is complete if it is only a frontend mock.

The ultimate requirement is:

**A developer can clone the GitHub repository, configure development environment variables, run the database migrations, start the application, and test the real AQE customer and manager ecosystem end-to-end.**

The AQE UI should remain faithful to the supplied prototypes while the underlying system becomes a real secure production application.

