# AQE Original Frontend Implementation Matrix

The original `AQE_Ecosystem_Final_Ready.html` is the frontend specification. The current Next.js application serves that exact frontend through `/customer` while preserving the current server/API layer underneath.

| Original screen | Current entry | Source of truth |
|---|---|---|
| Home | `/customer` | `screen-home` |
| Explore | `/customer/explore` | `screen-explore` |
| Shop | `/customer/shop` | `screen-shop` |
| Messages | `/customer/messages` | `screen-messages` |
| My Profile | `/customer/profile` | `screen-me` |
| Bill | `/customer/bill` | `screen-bill` |
| Team | `/customer/team` | `screen-team` |
| Tasks | `/customer/tasks` | `screen-tasks` |
| Rewards | `/customer/rewards` | `screen-rewards` |
| Raffle | `/customer/raffle` | `screen-raffle` |
| Download | `/customer/download` | `screen-download` |
| Manager | `/customer/manager` | `screen-manager` |
| AQE Payments | `/customer/payments` | `screen-aqe-payments` |
| Settings | `/customer/settings` | `screen-settings` |
| Book Now | `/customer/book-now` | `screen-book` |
| Comments | `/customer/comments` | `screen-comments` |
| Wallet | `/customer/wallet` | `screen-wallet` |
| Premium | `/customer/premium` | `screen-premium` |
| VIP | `/customer/vip-hub` | `screen-vip` |
| Queue | `/customer/queue` | `screen-queue` |
| Vault | `/customer/vault` | `screen-vault` |
| Store | `/customer/store` | `screen-store` |
| Groups | `/customer/groups` | `screen-groups` |
| AQE Plans | `/customer/plans` | `screen-aqe-plans` |
| AQE Wallet | `/customer/aqe-wallet` | `screen-aqe-wallet` |
| Gifts | `/customer/gifts` | `screen-aqe-gifts` |
| Campaigns | `/customer/campaigns` | `screen-aqe-campaigns` |
| Prizes | `/customer/prizes` | `screen-aqe-prizes` |
| AQE Referrals | `/customer/referrals` | `screen-aqe-referrals` |
| AQE Withdraw | `/customer/withdraw` | `screen-aqe-withdraw` |
| AQE Media | `/customer/media` | `screen-aqe-media` |
| Booking | `/customer/booking` | `screen-booking` |
| Booking Inbox | `/customer/booking-inbox` | `screen-booking-inbox` |

## Preserved original UI systems

The original header, mobile drawer, bottom navigation, desktop navigation, age gate, authentication sheet, registration flow, profile detail overlays, cart drawer, deposit/withdraw/invite modals, payment UI, message system, tier cards, VIP/asset-room UI, media polish, notification UI and original CSS/theme are retained in `public/aqe-original.html`.

## Current backend bridge

The restored frontend uses the current Next.js APIs for authentication/session hydration, profiles, dashboard balances, marketplace products, referrals, messages, bookings, comments, support tickets, daily QC claims, VIP withdrawal requests, and payment creation.

Payment actions intentionally keep the current server-side implementation. Membership upgrades are marked as `membership_upgrade`; wallet deposits remain `wallet_deposit`. The server validates membership pricing before creating the order, and manager-direct payments remain pending until manager confirmation.


## Completeness check

The original customer file currently contains 33 unique `screen-*` containers. All 33 are mapped by the Next.js customer host, so direct `/customer/...` entries can open the corresponding original screen. The original frontend remains intact rather than being re-created from a reduced React approximation.
