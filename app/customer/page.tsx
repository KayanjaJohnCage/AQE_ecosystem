"use client";

import { usePathname } from "next/navigation";

const screenByPath: Record<string, string> = {
  "/customer": "screen-home",
  "/customer/explore": "screen-explore",
  "/customer/shop": "screen-shop",
  "/customer/messages": "screen-messages",
  "/customer/profile": "screen-me",
  "/customer/bill": "screen-bill",
  "/customer/team": "screen-team",
  "/customer/tasks": "screen-tasks",
  "/customer/rewards": "screen-rewards",
  "/customer/raffle": "screen-raffle",
  "/customer/download": "screen-download",
  "/customer/manager": "screen-manager",
  "/customer/payments": "screen-aqe-payments",
  "/customer/settings": "screen-settings",
  "/customer/book-now": "screen-book",
  "/customer/comments": "screen-comments",
  "/customer/wallet": "screen-wallet",
  "/customer/premium": "screen-premium",
  "/customer/vip-hub": "screen-vip",
  "/customer/queue": "screen-queue",
  "/customer/vault": "screen-vault",
  "/customer/store": "screen-store",
  "/customer/groups": "screen-groups",
  "/customer/plans": "screen-aqe-plans",
  "/customer/aqe-wallet": "screen-aqe-wallet",
  "/customer/gifts": "screen-aqe-gifts",
  "/customer/campaigns": "screen-aqe-campaigns",
  "/customer/prizes": "screen-aqe-prizes",
  "/customer/referrals": "screen-aqe-referrals",
  "/customer/withdraw": "screen-aqe-withdraw",
  "/customer/media": "screen-aqe-media",
  "/customer/booking": "screen-booking",
  "/customer/booking-inbox": "screen-booking-inbox",
};

export default function CustomerPage() {
  const pathname = usePathname();
  const screen = screenByPath[pathname] ?? "screen-home";

  return (
    <main className="aqe-original-host">
      <iframe
        title="AQE Ecosystem"
        className="aqe-original-frame"
        src={`/aqe-original.html?screen=${encodeURIComponent(screen)}`}
      />
    </main>
  );
}
