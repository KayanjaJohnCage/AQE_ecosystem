# AQE ECOSYSTEM — FULL-STACK DEVELOPMENT → PRODUCTION HANDOFF
## Greenfield MVP Implementation Brief for VS Code GitHub Copilot

**Project:** AQE Ecosystem  
**Objective:** Build the real, launch-ready MVP from scratch using the supplied AQE customer and manager/admin prototypes as the UI/UX source of truth.

---

# 1. NON-NEGOTIABLE STARTING INSTRUCTION

## THIS IS A GREENFIELD REBUILD.

The existing repository is **legacy/reference material only**.

Copilot MUST:

1. Inspect the old repository.
2. Inspect the supplied customer prototype.
3. Inspect the supplied manager/admin prototype.
4. Inspect this handoff.
5. Extract useful assets, terminology, business rules, UI references and prototype behavior.
6. Create a **new production architecture from scratch**.
7. NOT inherit the old folder structure.
8. NOT carry forward localStorage architecture, hardcoded demo state, fake users, plaintext passwords, fake balances, fake payment confirmations, or prototype-only security.
9. NOT spend time redesigning the product.

The two supplied finished prototypes are the **visual and UX source of truth**.

Preserve their:
- visual identity
- colors
- typography
- spacing
- cards
- navigation
- page structure
- dialogs/modals
- responsive behavior
- labels
- terminology
- customer journeys
- manager journeys

Only make changes required to:
- make the UI responsive
- connect it to the real backend
- fix broken interactions
- improve accessibility/usability
- prevent security problems

Do NOT replace the prototype with a generic dashboard template.

---

# 2. PRIMARY DEVELOPMENT OBJECTIVE

Turn the AQE prototypes into a real full-stack web application with:

- real authentication
- real user profiles
- real profile photos and media
- real Supabase Storage
- real PostgreSQL persistence
- real Basic/Premium/VIP subscriptions
- real tier feature controls
- real QC accounting
- real wallet accounting
- real payments
- real manager direct-payment workflow
- real Mukuru redirect workflow
- real bookings
- real comments
- real messaging
- real media/content access rules
- real marketplace
- real VIP ecosystem
- real manager/admin control
- real RBAC
- real audit logs
- real notifications
- production-safe security

The MVP must be **quick, clean, modular and maintainable**.

Do not over-engineer.

---

# 3. SOURCE PROTOTYPES

The current finished references include:

### Customer
`AQE_Ecosystem_Final_Ready(1).html`

### Manager/Admin
`AQE_Manager_Production_PHASE14_Tier_Feature_Control(1).html`

These files are UI references, not production architecture.

The manager prototype includes operational areas such as users, profiles, media, subscriptions, bookings, transactions, withdrawals, permissions, audit and feature controls.

The customer prototype contains the intended ecosystem experience, tier presentation and customer-side journeys.

---

# 4. IMPORTANT CURRENT UI FIXES TO PRESERVE

The registration photo-upload interface must be rebuilt as a polished, responsive production component.

It must work correctly on:
- small phones
- large phones
- tablets
- laptops
- desktop screens

The profile-photo and media system must also be implemented properly.

### Production requirement

When a user uploads:
- profile photo
- gallery image
- video/media

the uploaded asset must actually appear in the correct UI location after persistence.

Do NOT use temporary browser data URLs as the final source.

Use:

**Supabase Storage → database media record → authenticated/public media URL → frontend rendering**

Profile photo selection must be stored in the database.

---

# 5. RECOMMENDED STACK

Use a simple modern stack.

Preferred:

- Frontend: Next.js + TypeScript
- Styling: preserve prototype CSS/design; Tailwind may be used where useful without changing the design
- Backend: Next.js server-side routes/actions or clean API layer
- Database: Supabase PostgreSQL
- Authentication: Supabase Auth
- Storage: Supabase Storage
- Authorization: PostgreSQL/RLS + server-side authorization
- Validation: Zod or equivalent
- Testing: unit/integration + Playwright E2E
- Git: GitHub

If the existing environment already strongly dictates another modern compatible framework, document the decision. Otherwise use the preferred stack above.

Do not introduce unnecessary infrastructure such as Redis, Kubernetes or microservices for the MVP.

---

# 6. SUPABASE

Use Supabase as the primary backend platform.

Requirements:

- Supabase Auth
- PostgreSQL
- Storage
- Row Level Security
- server-side privileged operations
- database migrations
- database functions where transactional consistency requires them

### Africa performance

When the project owner creates the Supabase project, select the Supabase region that provides the best practical latency for the African/Ugandan user base.

Do NOT hard-code or invent a region.

Keep database access efficient:
- indexes
- pagination
- selective queries
- optimized media loading
- no unnecessary polling

---

# 7. PAYMENT ARCHITECTURE — IMPORTANT

## A. MUKURU

Mukuru is **NOT an AQE API payment integration for this MVP**.

Do NOT build:

- Mukuru sandbox
- Mukuru webhook
- Mukuru callback verification
- invented Mukuru API endpoints
- invented webhook signatures
- fake Mukuru credentials

### Correct flow

1. User chooses the Mukuru payment option.
2. AQE displays the required payment/reference information.
3. AQE sends the user to the **Mukuru Pay Send Money page**.
4. User completes the transfer externally.
5. AQE does not pretend it received an automated provider confirmation.
6. The resulting AQE payment/subscription/deposit state is handled through the defined AQE confirmation workflow.

The implementation must clearly distinguish:
- `initiated`
- `pending`
- `confirmed`
- `rejected`
- `cancelled`

Never mark money as received simply because the user clicked a button.

---

# 8. MANAGER DIRECT PAYMENT

This is a manual/direct payment method.

Correct flow:

1. Customer selects Manager Direct Pay.
2. AQE shows the configured manager payment instructions.
3. Customer sends money directly to the AQE manager.
4. Customer submits:
   - amount
   - currency
   - reference/transaction number
   - payment method
   - optional proof/details required by the business process
5. AQE creates a pending transaction.
6. Manager reviews the transaction.
7. Manager confirms actual receipt.
8. Manager approves or rejects.
9. On approval, secure server-side logic creates the corresponding:
   - financial transaction
   - wallet credit, or
   - subscription activation, or
   - QC credit
10. Every privileged action is audited.

Never trust a client-side approval or client-supplied balance.

---

# 9. FINANCIAL SOURCE OF TRUTH

Do not store balances as independently editable numbers.

Use immutable ledger records.

Suggested:

- `wallet_accounts`
- `wallet_ledger`
- `qc_accounts`
- `qc_ledger`
- `financial_transactions`
- `withdrawal_requests`
- `subscriptions`
- `payment_methods`
- `payment_instructions`

Balance should be derived safely from ledger state or maintained through controlled transactional database functions.

Every financial mutation must be:
- authenticated
- authorized
- transactional
- auditable
- idempotent where appropriate

---

# 10. QC RULE — LOCKED BUSINESS RULE

Each chat message costs **1 QC**.

Premium and VIP users receive a daily allowance of:

**5 QC specifically for chat.**

Correct sequence:

1. User sends chat message.
2. System checks today's chat allowance.
3. If free daily allowance remains:
   - consume 1 daily chat QC.
4. Once the daily 5 are consumed:
   - consume 1 QC from the user's global QC balance.
5. If global QC balance is zero:
   - reject the message
   - tell the user to recharge QC
   - do not send the message.

The QC deduction must happen server-side in a transaction.

Never allow:
- negative QC
- double charging
- charging without sending
- sending without charging when payment is required

Use an idempotency strategy for message/QC operations.

---

# 11. MEMBERSHIP TIERS

Implement:

- Basic
- Premium
- VIP

Tier must be stored in real database records.

Do not rely on:
- hidden buttons
- browser variables
- localStorage
- client-only tier checks

Server authorization must enforce tier restrictions.

---

# 12. VIP FEATURE CONTROL

VIP-only features include, at minimum:

- Invites
- My Team
- Rewards
- Raffle
- other features explicitly configured as VIP-only

Basic and Premium users must receive a clear upgrade path when trying to access VIP-only functionality.

The manager/admin must be able to control feature entitlements.

Use database-backed feature configuration rather than hardcoded browser-only flags.

Suggested model:

`feature_definitions`

`feature_entitlements`

`role_permissions`

`feature_flags`

---

# 13. USER AUTHENTICATION

Implement real Supabase Auth.

Support:

- registration
- login
- logout
- session persistence
- password reset
- email verification where configured
- protected routes
- manager/admin protected routes

Never store plaintext passwords.

The prototype manager credentials are demo data only and must NOT become production credentials.

---

# 14. USER PROFILE SYSTEM

Create real profile records.

Suggested:

`profiles`

Fields may include:

- id
- user_id
- display_name
- bio
- phone
- country
- location
- category
- services
- tier
- verification_status
- profile_photo_id
- created_at
- updated_at

Profile photo must reference an actual media record.

---

# 15. PROFILE MEDIA SYSTEM

Create:

`profile_media`

Suggested fields:

- id
- owner_user_id
- profile_id
- storage_path
- media_type
- mime_type
- file_size
- duration
- thumbnail_path
- visibility
- is_profile_photo
- moderation_status
- created_at

Use Supabase Storage.

### Required behavior

Images:
- upload
- persist
- display
- select as profile photo
- replace/remove
- manager moderation

Videos:
- upload
- persist
- display with correct player
- moderation
- protected access where required

Do not put large files into PostgreSQL.

---

# 16. STORAGE SECURITY

Use separate logical storage areas/buckets where appropriate, for example:

- profile-media
- private-media
- vip-assets
- verification-documents

Private assets must use controlled access/signed URLs.

Never expose private storage paths as public unrestricted content.

Users must only be able to:
- upload their own allowed content
- modify their own content
- delete their own content

Managers/admins require explicit privileged authorization.

---

# 17. EXPLORE / PROFILE ACTIONS

Explored user profiles must use:

- **Book Now**
- **Comment**

Do not use the incorrect old “Message” action where the product requirement calls for “Comment.”

Messaging remains a separate real feature where appropriate.

---

# 18. CONTENT VISIBILITY / SENSITIVE CONTENT

Before posting Explore content, the user must choose audience suitability.

Required behavior:

### Non-sensitive
Default:
**Allow for all**

### Sensitive
Setting:
**Ask always**

Sensitive content appears on Explore with a dark/hidden overlay.

When clicked, prompt:

- **View next post**
- **View this anyway**

If user chooses:
- View next post → close prompt and continue exploration.
- View this anyway → reveal/open the content according to access rules.

Store content sensitivity and visibility in the database.

Do not rely on CSS alone for access control.

---

# 19. BOOKINGS

Implement real booking records.

Suggested:

`bookings`

Include:
- customer
- provider/profile owner
- date/time
- service
- amount
- currency
- status
- notes
- created_at
- updated_at

Statuses:

- pending
- accepted
- rejected
- cancelled
- completed
- disputed

Manager must be able to oversee bookings.

---

# 20. COMMENTS

Implement actual comments.

Requirements:

- authenticated posting
- ownership
- moderation
- deletion according to permissions
- timestamps
- profile/content association
- notification where appropriate

---

# 21. MESSAGING

Implement real conversations.

Suggested:

- `conversations`
- `conversation_members`
- `messages`

Messages must connect to real users.

Do not store conversations in browser localStorage.

Integrate the locked QC charging rule for paid chat where required.

---

# 22. WALLET

The ecosystem needs an AQE accounting layer.

Users may need to:

- deposit
- view balance
- purchase
- recharge QC
- request withdrawal
- view transaction history

Implement:
- wallet account
- ledger
- transaction history
- pending states
- approval states
- failed states

Never let the client directly update wallet balances.

---

# 23. WITHDRAWALS

Create:

`withdrawal_requests`

Flow:

1. User submits withdrawal request.
2. Validate available balance.
3. Lock/reserve appropriate funds.
4. Manager reviews.
5. Approve/reject.
6. Complete payment through the configured process.
7. Record final state.
8. Audit every privileged action.

Support:
- pending
- approved
- rejected
- processing
- completed
- failed
- cancelled

---

# 24. REFERRALS / VIP SALARY

Implement real referral relationships.

Suggested:

- referral_codes
- referrals
- referral_rewards
- salary/earning records where required

Do not credit rewards merely because a referral URL was clicked.

Define qualifying conditions clearly in database/business logic.

---

# 25. REWARDS

Implement real reward records.

Support:
- reward definitions
- eligibility
- claims
- status
- transaction/QC effects
- manager control
- audit

---

# 26. CAMPAIGNS

Campaigns can contain:

- gift/reward
- campaign code
- validity dates
- usage limits
- eligibility
- claim status

User enters a campaign code in Rewards.

Server validates:
- campaign exists
- campaign active
- user eligible
- code valid
- not already claimed
- limits not exceeded

Then atomically create the reward/claim.

---

# 27. PRIZE WINNING

Implement prize categories such as:

- electronics
- furniture
- clothes
- other configured categories

Manager must be able to:
- create prizes
- configure campaigns/raffles
- select winners according to the defined business process
- record winners
- maintain audit records

Do not create a fake random winner mechanism without a documented rule.

---

# 28. MARKETPLACE / STORE

Implement MVP marketplace functionality:

- products
- sellers
- prices
- product media
- inventory/status
- orders
- buyer
- seller
- purchase transaction
- order status

Do not attempt a giant e-commerce platform for MVP.

---

# 29. VIP ECOSYSTEM

Implement the VIP surfaces shown in the prototype, including as applicable:

- Asset Room
- Store
- Tasks
- Rewards
- Invites
- Raffle
- Team
- Groups
- Booking Queue

Every VIP surface must be server-authorized.

---

# 30. MANAGER / ADMIN APPLICATION

Build the supplied manager UI into a real application.

Manager areas should cover the prototype's operational requirements:

- Command Center
- Users
- Profiles
- Verification
- Subscriptions
- Bookings
- Marketplace
- Profile Media
- Asset Room
- Moderation
- Support
- Transactions
- Withdrawals
- Risk
- Rewards
- Referrals
- Permissions
- Audit Logs
- Global Settings
- Feature Flags

The prototype already demonstrates manager operational concepts such as live activity, ecosystem queues, user/tier management and profile media review. Preserve this experience while replacing demo state with real data.

---

# 31. RBAC

Create proper roles.

Minimum:

- customer
- manager
- admin

Potential additional operational roles may be added if required.

Use:
- database role records
- server authorization
- RLS
- privileged server operations

Do not trust:
- hidden admin pages
- client-side role variables
- email string checks
- browser state

---

# 32. AUDIT LOGGING

Create:

`audit_logs`

Record privileged actions such as:

- user updates
- tier changes
- verification decisions
- payment approvals
- wallet credits
- wallet debits
- withdrawal decisions
- media removal
- moderation
- permissions changes
- feature flag changes
- reward grants
- campaign changes

Include:
- actor
- action
- target
- details
- timestamp
- correlation/request ID where useful

Never expose secrets in logs.

---

# 33. NOTIFICATIONS

Implement persistent notifications.

Support:
- unread/read
- user-specific notifications
- manager notifications
- important financial notifications
- booking updates
- reward updates
- moderation updates

---

# 34. SUPPORT

Implement a simple MVP support-ticket system.

Suggested:

`support_tickets`

Statuses:
- open
- investigating
- waiting
- resolved
- closed

Manager can review and update tickets.

---

# 35. VERIFICATION

Create a verification workflow.

Suggested:

`verification_cases`

Possible states:
- pending
- approved
- rejected
- resubmission_required

Verification documents must be stored securely and privately.

Do not log private documents or unnecessary sensitive information.

---

# 36. DATABASE DESIGN

Use migrations.

At minimum consider:

- profiles
- subscriptions
- tier_features
- feature_flags
- wallet_accounts
- wallet_ledger
- qc_accounts
- qc_ledger
- financial_transactions
- payment_instructions
- withdrawal_requests
- profile_media
- conversations
- conversation_members
- messages
- bookings
- comments
- products
- orders
- order_items
- rewards
- reward_claims
- campaigns
- campaign_claims
- prizes
- referrals
- support_tickets
- verification_cases
- notifications
- audit_logs
- roles
- permissions
- role_permissions

Do not create tables unnecessarily. Keep the schema understandable.

---

# 37. TRANSACTIONAL RULES

Financial operations must use database transactions/functions where needed.

Examples:

### QC charge
Check balance → insert debit → update/derive balance → create message operation.

### Wallet deposit
Confirm transaction → insert financial record → insert wallet credit → update subscription/QC where applicable.

### Withdrawal
Check available funds → reserve/debit → create withdrawal record.

### Reward
Check eligibility → create claim → credit reward → audit.

No partial financial state.

---

# 38. SECURITY

Implement:

- RLS
- server-side authorization
- input validation
- rate limiting where practical
- secure cookies/session handling
- CSRF protection where relevant
- XSS-safe rendering
- safe file validation
- MIME/type checks
- file size limits
- protected private media
- secure secrets handling
- no service-role key in browser
- no plaintext passwords
- no fake security

Never trust:
- client balances
- client tier
- client role
- client payment status
- client reward eligibility
- client media ownership

---

# 39. MEDIA UPLOAD VALIDATION

For profile images:
- accepted image types
- size limits
- safe filename/path
- storage ownership checks
- optional image dimension checks

For videos:
- accepted video types
- size limits
- duration limits where appropriate
- storage ownership checks

Prevent arbitrary file uploads.

---

# 40. RESPONSIVE FRONTEND

The supplied design must work on:

- mobile
- tablet
- laptop
- desktop

Do not redesign.

Fix:
- overflowing forms
- clipped buttons
- broken grids
- oversized media
- horizontal scrolling
- modal overflow
- navigation problems

Registration photo upload must be especially polished.

Test common viewport sizes.

---

# 41. PERFORMANCE

Prioritize:

- efficient database queries
- indexes
- pagination
- lazy loading
- optimized images
- thumbnails for video/media where useful
- minimal client-side state
- no unnecessary polling

Do not prematurely introduce complex infrastructure.

---

# 42. PROJECT STRUCTURE

Create a clean production structure from scratch.

Example:

```text
aqe-ecosystem/
├── app/
├── components/
├── lib/
├── services/
├── hooks/
├── types/
├── supabase/
│   ├── migrations/
│   └── seed/
├── public/
├── tests/
│   ├── unit/
│   ├── integration/
│   └── e2e/
├── docs/
├── .env.example
├── package.json
└── README.md
```

Adapt the structure to the selected framework, but keep clear separation between:
- UI
- business logic
- database access
- authorization
- validation
- types
- tests

---

# 43. PROTOTYPE → PRODUCTION CONVERSION RULE

Replace:

| Prototype | Production |
|---|---|
| localStorage | PostgreSQL |
| data URLs | Supabase Storage |
| hardcoded users | Supabase Auth + profiles |
| hardcoded balances | wallet ledger |
| hardcoded QC | QC ledger |
| browser tier checks | server authorization |
| browser admin checks | RBAC + RLS |
| fake payment success | real payment state/manager confirmation |
| demo media | Storage + profile_media |
| toast-only operations | server operations |
| static metrics | database queries |
| fake audit entries | audit_logs |

---

# 44. WHAT COPILOT MUST NOT DO

Do NOT:

- redesign AQE
- start from the old repository structure
- preserve prototype localStorage as production storage
- hardcode users
- hardcode passwords
- expose Supabase service-role keys
- create fake payment success
- invent Mukuru APIs/webhooks
- create unnecessary microservices
- add unnecessary infrastructure
- declare features complete while they remain frontend mocks
- replace the AQE visual identity with a generic UI kit

---

# 45. DEVELOPMENT ORDER

Implement in this order.

## PHASE 1 — Greenfield Foundation
- create new architecture
- package setup
- TypeScript
- environment handling
- Supabase client/server setup
- base routing
- design system extraction
- migrate prototype assets

## PHASE 2 — Database + Auth
- schema
- migrations
- RLS
- Supabase Auth
- profiles
- roles

## PHASE 3 — Customer UI
- reproduce prototype pages
- responsive navigation
- registration
- login
- dashboard
- profile
- explore

## PHASE 4 — Media
- profile photo upload
- gallery upload
- video upload
- profile photo selection
- Storage policies
- media rendering
- manager media moderation

## PHASE 5 — Tiers + Feature Controls
- Basic
- Premium
- VIP
- subscriptions
- entitlement system
- manager feature controls

## PHASE 6 — Wallet + QC
- wallet
- wallet ledger
- QC account
- QC ledger
- recharge
- transaction history
- locked 5-chat-QC rule

## PHASE 7 — Payments
- Mukuru redirect flow
- Manager Direct Pay
- payment instructions
- pending/approved/rejected states
- manager confirmation
- financial audit

## PHASE 8 — Core Ecosystem
- bookings
- comments
- messaging
- notifications
- referrals
- rewards

## PHASE 9 — VIP
- Asset Room
- Store
- Tasks
- Rewards
- Invites
- Raffle
- Team
- Groups
- Booking Queue

## PHASE 10 — Marketplace
- products
- sellers
- orders
- purchase flow

## PHASE 11 — Manager/Admin
- dashboard
- users
- verification
- subscriptions
- bookings
- media
- moderation
- payments
- withdrawals
- rewards
- referrals
- permissions
- audit
- settings
- feature flags

## PHASE 12 — Hardening + Launch Preparation
- authorization review
- RLS review
- validation
- error handling
- performance
- responsive fixes
- logging
- tests
- production build

---

# 46. COPILOT WORKING METHOD

Do NOT attempt to generate the entire system blindly in one response.

At every phase:

1. Inspect.
2. Plan.
3. Implement.
4. Run typecheck.
5. Run lint.
6. Run tests.
7. Build.
8. Fix errors.
9. Update documentation.
10. Continue to the next phase.

Keep a file:

`docs/AQE_IMPLEMENTATION_STATUS.md`

Track:

```text
Phase
Feature
Status
Files changed
Database migration
Known issue
Next action
```

Use statuses:

- NOT STARTED
- IN PROGRESS
- BLOCKED
- COMPLETE

Do not mark a feature COMPLETE if it is only mocked.

---

# 47. DEFINITION OF DONE

A feature is complete only when:

- UI works
- backend works
- database persistence works
- authorization works
- validation works
- errors are handled
- mobile layout works
- relevant tests pass
- production build passes

For financial features additionally:
- transaction safety
- audit logging
- idempotency where applicable
- no client-side balance manipulation

---

# 48. README REQUIREMENTS

Create a complete README explaining:

- AQE overview
- architecture
- stack
- prerequisites
- environment variables
- Supabase project setup
- database migrations
- storage setup
- local development
- test commands
- build commands
- deployment
- payment workflows
- security notes

The project owner will perform installations, environment configuration, testing and deployment execution.

Copilot's responsibility is to provide the code and clear setup documentation.

---

# 49. ENVIRONMENT VARIABLES

Create:

`.env.example`

Never commit real secrets.

Expected categories may include:

```text
NEXT_PUBLIC_SUPABASE_URL=
NEXT_PUBLIC_SUPABASE_ANON_KEY=
SUPABASE_SERVICE_ROLE_KEY=
```

Only add variables that the actual implementation needs.

Service-role secrets must remain server-side.

---

# 50. TESTING TARGET

The project owner will run the actual environment setup and testing.

Copilot must nevertheless create the test suite.

### Customer smoke tests

- registration
- login
- logout
- profile
- profile photo upload
- gallery upload
- video upload
- profile photo selection
- Explore
- Book Now
- Comment
- Premium upgrade
- VIP upgrade
- VIP gates
- QC recharge
- QC history
- daily chat allowance
- paid chat after allowance
- booking
- wallet deposit
- purchase
- withdrawal request
- notifications

### VIP

- Asset Room
- Store
- Tasks
- Rewards
- Invites
- Raffle
- Team
- Groups
- Booking Queue

### Manager

- manager login
- RBAC
- dashboard
- users
- verification
- subscriptions
- bookings
- marketplace
- media
- moderation
- support
- transactions
- withdrawals
- rewards
- referrals
- permissions
- audit
- settings
- feature flags

### Financial

- Manager Direct Pay pending
- Manager Direct Pay approval
- Manager Direct Pay rejection
- Mukuru redirect
- QC debit
- QC recharge
- wallet credit
- wallet debit
- withdrawal
- duplicate operation protection
- wrong amount handling
- failed transaction handling

---

# 51. LEGACY REPOSITORY RULE

The old repository may contain useful material, but it is NOT the foundation.

Use it only for:
- assets
- prototype references
- terminology
- business logic discovery
- content
- historical implementation clues

If the old code conflicts with this handoff or the supplied finished prototypes, do not blindly preserve it.

Prefer the clean greenfield implementation.

---

# 52. LEGAL / FINANCIAL ARCHITECTURE CAUTION

AQE should not be represented as a bank or licensed e-money issuer unless the appropriate legal structure and licensing exist.

Build an internal accounting/ledger layer around the actual payment processes.

Before offering unrestricted stored-value functionality or making regulatory claims, the project owner should obtain appropriate legal/compliance confirmation for the operating jurisdiction.

This does NOT stop development of the MVP architecture.

---

# 53. PRODUCTION OBSERVABILITY

Provide enough logging to diagnose:

- authentication failures
- database errors
- payment problems
- failed withdrawals
- failed uploads
- authorization failures
- unexpected application errors

Do not log:
- passwords
- secrets
- full payment credentials
- private verification documents
- unnecessary sensitive personal data

Use request/correlation IDs for important server operations.

---

# 54. ERROR HANDLING

User-facing errors must be:

- understandable
- safe
- actionable

Never expose:
- stack traces
- SQL errors
- secrets
- provider credentials

---

# 55. FINAL COPILOT COMMAND

After placing this file in:

`/docs/AQE_FULLSTACK_COPILOT_HANDOFF.md`

give Copilot this instruction:

> You are the lead implementation engineer for AQE Ecosystem.
>
> This is a GREENFIELD REBUILD.
>
> Inspect the legacy repository only for reusable assets, prototype references and business rules. Do not inherit its architecture or technical debt.
>
> Inspect the supplied AQE customer prototype and AQE manager/admin prototype. Treat them as the UI/UX source of truth.
>
> Read `/docs/AQE_FULLSTACK_COPILOT_HANDOFF.md` completely.
>
> First create `/docs/AQE_IMPLEMENTATION_STATUS.md`.
>
> Then create the new production project structure from scratch.
>
> Implement the system phase-by-phase in the order defined by this document.
>
> Preserve the existing AQE UI and style. Do not redesign it.
>
> Replace every prototype-only mechanism with real backend/database/storage/authentication.
>
> Use Supabase for Auth, PostgreSQL, Storage and RLS.
>
> Use the best practical Supabase region for the African/Ugandan user base when the project owner configures the Supabase project. Do not assume or hard-code a region.
>
> Mukuru is a redirect-to-Mukuru-Pay-Send-Money flow for this MVP. Do not implement Mukuru sandbox, API callbacks or webhooks.
>
> Manager Direct Pay is a manual payment flow where the customer sends money directly to the configured AQE manager and the manager verifies and approves/rejects the transaction.
>
> Never fake financial confirmation.
>
> Implement the locked QC rule exactly: each chat message costs 1 QC; Premium and VIP receive 5 daily chat QC; after those 5 are consumed, chat consumes global QC; if global QC is zero, the user must recharge before chatting.
>
> Implement real profile photo and media upload using Supabase Storage and real database records.
>
> Make registration photo upload fully responsive.
>
> Implement server-side authorization, RLS, RBAC, audit logging and transactional financial operations.
>
> Work incrementally. After each meaningful stage, typecheck, lint, test and build. Fix errors before continuing.
>
> Do not claim completion for frontend-only mocks.
>
> Do not stop at planning. Start coding the actual system.
>
> The final target is a real AQE MVP that can be configured, tested and deployed by the project owner.

---

# 56. FINAL SUCCESS CRITERIA

The project is ready for the owner to take over when:

1. The new repository has a clean production architecture.
2. Customer UI matches the supplied prototype.
3. Manager UI matches the supplied prototype.
4. Authentication is real.
5. Supabase database is real.
6. Storage is real.
7. Profile photos display correctly.
8. Media displays correctly.
9. Registration upload is responsive.
10. Basic/Premium/VIP works.
11. VIP gates work server-side.
12. QC accounting works.
13. Chat QC rule works.
14. Wallet accounting works.
15. Mukuru redirect works.
16. Manager Direct Pay works.
17. Bookings work.
18. Comments work.
19. Messaging works.
20. Marketplace works.
21. VIP ecosystem works.
22. Manager operations work.
23. RBAC works.
24. Audit logs work.
25. RLS/security controls are implemented.
26. Tests exist.
27. Production build succeeds.
28. README/setup documentation is complete.

**The goal is a smooth, neat MVP that can move quickly from development into real production—not a second prototype.**
