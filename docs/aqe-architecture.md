# AQE Production Architecture Summary

This repo is being built to preserve the AQE ecosystem model described in the updated handoff.

## Core economic separation

AQE has two separate financial systems:

- QC economy = gamified virtual currency (`qc_wallet`, `qc_ledger`)
- Cash economy = real earnings and withdrawals (`cash_wallet`, `creator_earnings`, `withdrawal_request`)

They must never be merged into one generic wallet.

## Cash vs QC rules

- QC is virtual, collectible, and earned through participation, rewards, tasks, referrals, promotions, and purchases.
- Cash is real-money earnings for creators, marketplace activity, and eligible payouts.
- All QC changes must be server-side only.
- Every QC mutation must create a ledger entry and be auditable.

## Required data model principles

- `qc_wallet` stores the user balance as a derived current value.
- `qc_ledger` is the authoritative source for balance changes.
- `daily_checkin` prevents duplicate claims.
- `daily_checkin_rewards` stores configurable weekday rewards.
- `support_ticket` and `support_message` are user-facing support features.
- Internal manager/admin systems must remain separated from normal user support.
- VIP withdrawals must follow a configurable three-day weekly schedule, not a daily schedule.

## Manager support and internal console separation

The original profile manager concept should not be exposed as a user support experience.

User-facing support:
- Manager Support Room
- Support tickets
- Support replies
- Ticket status flow

Internal-only operations:
- QC transaction review where authorized
- Creator earning review
- Withdrawal admin review
- Platform analytics
- Audit logs
- Moderator/admin controls

## Phase order to preserve

1. Foundation
2. QC economy
3. QC utilities
4. Creator economy
5. Marketplace
6. Referrals and VIP
7. Manager Support
8. Admin hardening

## Implementation note

This repository currently contains the Phase 1 foundation only. The next engineering steps are:

- server-side QC transaction service
- wallet + ledger schema
- daily claim and weekly attendance logic
- support tickets and manager console separation
- VIP withdrawal schedule config
- audit logging and RLS enforcement
