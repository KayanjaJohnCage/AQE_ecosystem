"use client";

import { useEffect, useState } from "react";
import { readStoredSession } from "../../lib/clientSession";
import ProfileBoostManager from "./components/ProfileBoostManager";
import CampaignManager from "./components/CampaignManager";
import PrizeManager from "./components/PrizeManager";

type ManagerData = {
  users: number;
  vip: number;
  media: number;
  transactions: number;
  bookings: number;
  messages: number;
  products: number;
  support: number;
  withdrawals: number;
};

type ManagerProfile = {
  id?: string;
  name: string;
  city: string;
  tag: string;
  status: string;
  tier?: string;
};

type ManagerRow = { id?: string; title: string; meta: string; value: string };
type ReceiverDetails = {
  receiverName: string;
  receiverPhone: string;
  receiverCard: string;
  instructions: string;
};

type PlatformSettings = {
  tierPrices: { basic: number; premium: number; vip: number };
  renewalPrices: { basic: number; premium: number; vip: number };
  walletCurrency: string;
  qcExchangeRate: number;
  referralRates: { direct: number; indirect: number };
  about: string;
  contact: string;
  commercial: {
    profileBoostPrices: { daily: number; weekly: number; monthly: number };
    marketplaceCommissionRate: number;
    vipContentCommissionRate: number;
  };
  footer: {
    about: string;
    contact: { email: string; phone: string; whatsapp: string };
    links: Array<{ label: string; url: string }>;
  };
  pricing: {
    originalTierPrices: { basic: number; premium: number; vip: number };
    currentTierPrices: { basic: number; premium: number; vip: number };
    promotionalLabels: { basic: string; premium: string; vip: string };
    welcomeBonus: number;
    deduction: { basic: number; premium: number; vip: number };
    teamLeaderRenewalCommission: { basic: number; premium: number; vip?: number };
    vipSalary: number;
    vipSalaryDay: number;
    withdrawalBefore20th: boolean;
  };
  customerContent: {
    home: Record<string, unknown>;
    rewards: Record<string, unknown>;
    campaign: Record<string, unknown>;
    raffle: Record<string, unknown>;
    promotions: Record<string, unknown>;
    vipContent: Record<string, unknown>;
  };
};

const navGroups = [
  {
    title: "Operations",
    items: [
      "Dashboard",
      "Users & Profiles",
      "Media & Profile Boosts",
      "Campaign Room",
      "Verification",
      "Subscriptions",
      "Bookings & Requests",
      "Messages & DM",
      "Marketplace & Stores",
      "VIP Asset Room",
    ],
  },
  {
    title: "Trust & Finance",
    items: [
      "Reports & Moderation",
      "Customer Support",
      "Transactions & QC",
      "Payments & Approvals",
      "Withdrawals",
      "AML / Risk",
    ],
  },
  {
    title: "VIP Ecosystem",
    items: [
      "My Team / Referrals",
      "Tasks & Rewards",
      "Raffle",
      "Announcements",
      "Notifications",
    ],
  },
  {
    title: "Control",
    items: [
      "Roles & Permissions",
      "Owner Action Console",
      "Audit Logs",
      "Tier Rules",
      "VIP Salary",
      "Global Settings",
      "Customer Experience",
    ],
  },
];

const tableSeeds: Record<string, ManagerRow[]> = {
  "Users & Profiles": [
    { title: "Nia A.", meta: "Verified", value: "Tier: VIP" },
    { title: "Ayo D.", meta: "Active", value: "Tier: Premium" },
    { title: "Tariq M.", meta: "Pending review", value: "Tier: Basic" },
  ],
  "Bookings & Requests": [
    { title: "Brand discovery session", meta: "Kampala", value: "Confirmed" },
    { title: "Media kit planning", meta: "Nairobi", value: "Pending" },
    {
      title: "Community room access",
      meta: "Kigali",
      value: "Awaiting approval",
    },
  ],
  "Messages & DM": [
    { title: "Support check-in", meta: "2 new replies", value: "Unresolved" },
    { title: "Collab thread", meta: "Moderator reviewed", value: "Active" },
    { title: "VIP concierge", meta: "Priority queue", value: "Responding" },
  ],
  "Marketplace & Stores": [
    {
      title: "Premium spotlight bundle",
      meta: "Vendor: Atelier",
      value: "Live",
    },
    { title: "Travel pass", meta: "Vendor: NEO", value: "50 sold" },
    {
      title: "Community event ticket",
      meta: "Vendor: AQE",
      value: "Needs restock",
    },
  ],
  "Customer Support": [
    { title: "Payment dispute", meta: "High priority", value: "Open" },
    { title: "Verification appeal", meta: "Escalated", value: "In review" },
    { title: "Account issue", meta: "Low priority", value: "Resolved" },
  ],
  "Audit Logs": [
    { title: "Tier rule update", meta: "Owner action", value: "Approved" },
    { title: "QC ledger sync", meta: "System", value: "Success" },
    { title: "Risk review", meta: "Analyst", value: "No issues" },
  ],
};

export default function ManagerPage() {
  const [data, setData] = useState<ManagerData>({
    users: 0,
    vip: 0,
    media: 0,
    transactions: 0,
    bookings: 0,
    messages: 0,
    products: 0,
    support: 0,
    withdrawals: 0,
  });
  const [active, setActive] = useState("Dashboard");
  const [managerLabel, setManagerLabel] = useState("Administrator");
  const [profiles, setProfiles] = useState<ManagerProfile[]>([]);
  const [liveRows, setLiveRows] = useState<Record<string, ManagerRow[]>>({});
  const [profileQuery, setProfileQuery] = useState("");
  const [reviewMessage, setReviewMessage] = useState("");
  const [receiver, setReceiver] = useState<ReceiverDetails>({
    receiverName: "",
    receiverPhone: "",
    receiverCard: "",
    instructions: "",
  });
  const [settings, setSettings] = useState<PlatformSettings>({
    tierPrices: { basic: 65000, premium: 150000, vip: 250000 },
    renewalPrices: { basic: 2500, premium: 5000, vip: 8500 },
    walletCurrency: "UGX",
    qcExchangeRate: 1000,
    referralRates: { direct: 0.1, indirect: 0.05 },
    about: "",
    contact: "",
    commercial: {
      profileBoostPrices: { daily: 0, weekly: 0, monthly: 0 },
      marketplaceCommissionRate: 0,
      vipContentCommissionRate: 0,
    },
    footer: {
      about: "",
      contact: { email: "", phone: "", whatsapp: "" },
      links: [],
    },
    pricing: {
      originalTierPrices: { basic: 125000, premium: 250000, vip: 500000 },
      currentTierPrices: { basic: 65000, premium: 150000, vip: 250000 },
      promotionalLabels: { basic: "48% OFF", premium: "40% OFF", vip: "50% OFF" },
      welcomeBonus: 3000,
      deduction: { basic: 15000, premium: 30000, vip: 60000 },
      teamLeaderRenewalCommission: { basic: 2500, premium: 5000 },
      vipSalary: 10000,
      vipSalaryDay: 20,
      withdrawalBefore20th: false,
    },
    customerContent: {
      home: {},
      rewards: {},
      campaign: {},
      raffle: {},
      promotions: {},
      vipContent: {},
    },
  });

  useEffect(() => {
    const { session, user } = readStoredSession();
    const headers: HeadersInit = {};
    if (session.access_token)
      headers.authorization = `Bearer ${session.access_token}`;
    if (user.id) headers["x-user-id"] = user.id;

    if (user.email) {
      setManagerLabel(
        user.display_name || user.displayName || user.email.split("@")[0],
      );
    }

    fetch("/api/dashboard", { headers })
      .then(async (response) => {
        if (response.ok) {
          const payload = await response.json();
          if (payload.manager) setData(payload.manager);
        }
      })
      .catch(() => undefined);

    fetch("/api/profiles")
      .then(async (response) => {
        if (!response.ok) return;
        const payload = await response.json();
        if (Array.isArray(payload.profiles)) setProfiles(payload.profiles);
      })
      .catch(() => undefined);

    Promise.all([
      fetch("/api/bookings", { headers }),
      fetch("/api/messages", { headers }),
      fetch("/api/marketplace/products", { headers }),
      fetch("/api/support/tickets", { headers }),
      fetch("/api/vip/withdrawals", { headers }),
      fetch("/api/payments/manager-direct", { headers }),
      fetch("/api/media/manager", { headers }),
      fetch("/api/receipts", { headers }),
    ])
      .then(
        async ([
          bookingsResponse,
          messagesResponse,
          productsResponse,
          supportResponse,
          withdrawalsResponse,
          paymentsResponse,
          mediaResponse,
          receiptsResponse,
        ]) => {
          const [bookings, messages, products, support, withdrawals, payments, media] =
            await Promise.all([
              bookingsResponse.ok
                ? bookingsResponse.json()
                : Promise.resolve({}),
              messagesResponse.ok
                ? messagesResponse.json()
                : Promise.resolve({}),
              productsResponse.ok
                ? productsResponse.json()
                : Promise.resolve({}),
              supportResponse.ok ? supportResponse.json() : Promise.resolve({}),
              withdrawalsResponse.ok
                ? withdrawalsResponse.json()
                : Promise.resolve({}),
              paymentsResponse.ok
                ? paymentsResponse.json()
                : Promise.resolve({}),
              mediaResponse.ok
                ? mediaResponse.json()
                : Promise.resolve({}),
              receiptsResponse.ok
                ? receiptsResponse.json()
                : Promise.resolve({}),
            ]);

          const nextRows: Record<string, ManagerRow[]> = {};
          if (
            Array.isArray(bookings.bookings) &&
            bookings.bookings.length > 0
          ) {
            nextRows["Bookings & Requests"] = bookings.bookings.map(
              (booking: {
                title?: string;
                date?: string;
                amount?: string;
                status?: string;
              }) => ({
                id: (booking as { id?: string }).id,
                title: booking.title || "Booking request",
                meta: booking.date || "Date pending",
                value: booking.status || booking.amount || "Pending",
              }),
            );
          }
          if (
            Array.isArray(messages.messages) &&
            messages.messages.length > 0
          ) {
            nextRows["Messages & DM"] = messages.messages.map(
              (message: {
                userId?: string;
                preview?: string;
                time?: string;
                read?: boolean;
              }) => ({
                title: message.userId || "Community member",
                meta: message.preview || "No message preview",
                value: message.read ? "Read" : "Unread",
              }),
            );
          }
          if (
            Array.isArray(products.products) &&
            products.products.length > 0
          ) {
            nextRows["Marketplace & Stores"] = products.products.map(
              (product: {
                title?: string;
                seller_id?: string;
                price?: number;
                currency?: string;
                inventory?: number;
              }) => ({
                title: product.title || "Marketplace product",
                meta: `Seller: ${product.seller_id || "AQE"}`,
                value: `${product.currency || "USD"} ${product.price ?? 0} • ${product.inventory ?? 0} left`,
              }),
            );
          }
          if (Array.isArray(support.tickets) && support.tickets.length > 0) {
            nextRows["Customer Support"] = support.tickets.map(
              (ticket: {
                id?: string;
                subject?: string;
                category?: string;
                priority?: string;
                status?: string;
              }) => ({
                id: ticket.id,
                title: ticket.subject || "Support ticket",
                meta: `${ticket.category || "OTHER"} • ${ticket.priority || "MEDIUM"}`,
                value: ticket.status || "OPEN",
              }),
            );
          }
          if (
            Array.isArray(withdrawals.withdrawals) &&
            withdrawals.withdrawals.length > 0
          ) {
            nextRows["Withdrawals"] = withdrawals.withdrawals.map(
              (withdrawal: {
                id?: string;
                user_id?: string;
                tier?: string;
                payment_method?: string;
                recipient_name?: string;
                recipient_account?: string;
                currency?: string;
                amount?: number;
                service_charge_rate?: number;
                service_charge_amount?: number;
                net_amount?: number;
                status?: string;
              }) => ({
                id: withdrawal.id,
                title: `${(withdrawal.tier || "basic").toUpperCase()} payout · ${withdrawal.recipient_name || "member"}`,
                meta: `${withdrawal.payment_method || "MOBILE_MONEY"} · ${withdrawal.recipient_name || "No name"} · ${withdrawal.recipient_account || "No destination"}`,
                value: `${withdrawal.status || "PENDING"} · Gross ${withdrawal.currency || "UGX"} ${Number(withdrawal.amount || 0).toLocaleString()} · Fee ${Number(withdrawal.service_charge_amount || 0).toLocaleString()} (${(Number(withdrawal.service_charge_rate ?? 0.10) * 100).toFixed(0)}%) · Net payout ${withdrawal.currency || "UGX"} ${Number(withdrawal.net_amount || 0).toLocaleString()}`,
              }),
            );
          }
          if (
            Array.isArray(media.media) &&
            media.media.length > 0
          ) {
            nextRows["Profile Media"] = media.media.map(
              (item: {
                id?: string;
                ownerUserId?: string;
                type?: string;
                moderationStatus?: string;
                isProfilePhoto?: boolean;
              }) => ({
                id: item.id,
                title: `${(item.type || "image").toUpperCase()} ${item.isProfilePhoto ? "· PROFILE PHOTO" : "· PROFILE CONTENT"}`,
                meta: `Owner: ${item.ownerUserId || "member"}`,
                value: item.moderationStatus || "pending",
              }),
            );
          }
          if (
            Array.isArray(payments.payments) &&
            payments.payments.length > 0
          ) {
            nextRows["Payments & Approvals"] = payments.payments.map(
              (payment: {
                id?: string;
                user_id?: string;
                amount?: number;
                currency?: string;
                reference?: string;
                metadata?: { requestedTier?: string; paymentKind?: string; fundingSource?: string };
                status?: string;
              }) => ({
                id: payment.id,
                title: `${payment.currency || "UGX"} ${payment.amount ?? 0} • ${payment.user_id || "member"}`,
                meta: `${payment.reference || "No reference"} • ${payment.metadata?.paymentKind === "wallet_deposit" ? "Reference: WALLET" : `Reference: UPGRADE • ${(payment.metadata?.requestedTier || "premium").toUpperCase()}`}`,
                value: payment.status || "pending",
              }),
            );
          }
          setLiveRows(nextRows);
        },
      )
      .catch(() => undefined);

    fetch("/api/payments/receiver")
      .then(async (response) => {
        if (!response.ok) return;
        const payload = await response.json();
        if (payload.receiver) setReceiver(payload.receiver);
      })
      .catch(() => undefined);

    fetch("/api/settings")
      .then(async (response) => {
        if (!response.ok) return;
        const payload = await response.json();
        if (payload.settings) setSettings(payload.settings);
      })
      .catch(() => undefined);
  }, []);

  const filteredProfiles = profiles.filter((profile) => {
    const query = profileQuery.trim().toLowerCase();
    if (!query) return true;
    return `${profile.name} ${profile.city} ${profile.tag} ${profile.status}`
      .toLowerCase()
      .includes(query);
  });
  const profileRows: ManagerRow[] = filteredProfiles.map((profile) => ({
    title: profile.name,
    meta: `${profile.city} • ${profile.tag}`,
    value: `${profile.status} • ${(profile.tier || "basic").toUpperCase()}`,
  }));
  const rows: ManagerRow[] =
    active === "Users & Profiles" && profileRows.length > 0
      ? profileRows
      : liveRows[active]?.length
        ? liveRows[active]
        : (tableSeeds[active] ?? [
            {
              title: "Operational queue",
              meta: "Awaiting sync",
              value: "Ready",
            },
          ]);
  const paymentRows: ManagerRow[] = liveRows["Payments & Approvals"] ?? [];

  async function reviewBooking(
    bookingId: string,
    status: "accepted" | "rejected",
  ) {
    const { session, user } = readStoredSession();
    const headers: HeadersInit = { "Content-Type": "application/json" };
    if (session.access_token)
      headers.authorization = `Bearer ${session.access_token}`;
    if (user.id) headers["x-user-id"] = user.id;
    const response = await fetch("/api/bookings", {
      method: "PATCH",
      headers,
      body: JSON.stringify({ bookingId, status }),
    });
    const payload = await response.json().catch(() => ({}));
    setReviewMessage(
      payload.ok
        ? `Booking ${status}.`
        : payload.reason || "Booking review failed.",
    );
  }

  async function reviewWithdrawal(
    requestId: string,
    status: "APPROVED" | "REJECTED" | "PAID",
  ) {
    const { session, user } = readStoredSession();
    const headers: HeadersInit = { "Content-Type": "application/json" };
    if (session.access_token)
      headers.authorization = `Bearer ${session.access_token}`;
    if (user.id) headers["x-user-id"] = user.id;
    const response = await fetch("/api/vip/withdrawals", {
      method: "PATCH",
      headers,
      body: JSON.stringify({ requestId, status }),
    });
    const payload = await response.json().catch(() => ({}));
    setReviewMessage(
      payload.ok
        ? `Withdrawal ${status.toLowerCase()}.`
        : payload.reason || "Withdrawal review failed.",
    );
  }

  async function reviewMedia(mediaId: string, status: "approved" | "rejected") {
    const { session, user } = readStoredSession();
    const headers: HeadersInit = { "Content-Type": "application/json" };
    if (session.access_token) headers.authorization = `Bearer ${session.access_token}`;
    if (user.id) headers["x-user-id"] = user.id;

    const response = await fetch("/api/media/manager", {
      method: "PATCH",
      headers,
      body: JSON.stringify({ mediaId, status }),
    });
    const payload = await response.json().catch(() => ({}));
    setReviewMessage(
      payload.ok
        ? `Media ${status}.`
        : payload.reason || "Media moderation failed.",
    );
  }

  async function reviewPayment(
    orderId: string,
    status: "confirmed" | "rejected",
  ) {
    const { session, user } = readStoredSession();
    const headers: HeadersInit = { "Content-Type": "application/json" };
    if (session.access_token)
      headers.authorization = `Bearer ${session.access_token}`;
    if (user.id) headers["x-user-id"] = user.id;
    const response = await fetch("/api/payments/manager-direct", {
      method: "PATCH",
      headers,
      body: JSON.stringify({ orderId, status }),
    });
    const payload = await response.json().catch(() => ({}));
    setReviewMessage(
      payload.ok
        ? status === "confirmed"
          ? payload.payment?.paymentKind === "wallet_deposit"
            ? "Wallet deposit confirmed. Cash was credited to the member wallet."
            : `Payment confirmed. User upgraded to ${(payload.upgradedTier || payload.payment?.upgradedTier || "paid").toUpperCase()}.`
          : "Payment rejected."
        : payload.reason || "Payment review failed.",
    );
  }

  async function saveReceiver(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const { session, user } = readStoredSession();
    const headers: HeadersInit = { "Content-Type": "application/json" };
    if (session.access_token)
      headers.authorization = `Bearer ${session.access_token}`;
    if (user.id) headers["x-user-id"] = user.id;
    const response = await fetch("/api/payments/receiver", {
      method: "PATCH",
      headers,
      body: JSON.stringify(receiver),
    });
    const payload = await response.json().catch(() => ({}));
    setReviewMessage(
      payload.ok
        ? "Mukuru receiver details saved."
        : payload.reason || "Receiver details could not be saved.",
    );
    if (payload.receiver) setReceiver(payload.receiver);
  }

  async function saveSettings(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const { session, user } = readStoredSession();
    const headers: HeadersInit = { "Content-Type": "application/json" };
    if (session.access_token)
      headers.authorization = `Bearer ${session.access_token}`;
    if (user.id) headers["x-user-id"] = user.id;
    const response = await fetch("/api/settings", {
      method: "PATCH",
      headers,
      body: JSON.stringify(settings),
    });
    const payload = await response.json().catch(() => ({}));
    setReviewMessage(
      payload.ok
        ? "Platform settings saved."
        : payload.reason || "Platform settings could not be saved.",
    );
    if (payload.settings) setSettings(payload.settings);
  }

  return (
    <div className="manager-prototype">
      <aside className="manager-prototype-sidebar">
        <div className="manager-brand">AQE ADMIN</div>
        {navGroups.map((group) => (
          <div key={group.title}>
            <div className="manager-section-label">{group.title}</div>
            <nav className="manager-nav">
              {group.items.map((item) => (
                <button
                  className={active === item ? "active" : ""}
                  type="button"
                  key={item}
                  onClick={() => setActive(item)}
                >
                  <span className="manager-nav-icon">
                    {["▣", "♙", "▧", "✓", "◆", "◫", "✉", "▤", "♢"].at(
                      group.items.indexOf(item) % 9,
                    )}
                  </span>
                  <span>{item}</span>
                </button>
              ))}
            </nav>
          </div>
        ))}
      </aside>

      <main className="manager-prototype-main">
        <header className="manager-prototype-top">
          <div>
            <strong>AQE Ecosystem Manager</strong>
            <span>Live ecosystem oversight & operational control</span>
          </div>
          <div className="manager-user">
            <div className="manager-avatar">
              {managerLabel.slice(0, 2).toUpperCase()}
            </div>
            <span>{managerLabel}</span>
            <button type="button">⌄</button>
          </div>
        </header>

        <div className="manager-prototype-content">
          <div className="manager-title">
            {active === "Dashboard" ? "Command Center" : active}
          </div>
          <p className="manager-subtitle">
            {active === "Dashboard"
              ? "Activity overview sourced from the AQE ecosystem state."
              : `${active} operational view`}
          </p>

          {active === "Dashboard" ? (
            <>
              <div className="manager-metrics">
                <Metric label="USERS" value={data.users} />
                <Metric label="VIP" value={data.vip} />
                <Metric label="MEDIA ASSETS" value={data.media} />
                <Metric label="TRANSACTIONS" value={data.transactions} />
              </div>

              <div className="manager-two-column">
                <section className="manager-card">
                  <h3>Live activity</h3>
                  <div className="manager-activity">
                    <div className="manager-activity-row">
                      <span>New membership</span>
                      <strong>+24</strong>
                    </div>
                    <div className="manager-activity-row">
                      <span>Verified profiles</span>
                      <strong>+8</strong>
                    </div>
                    <div className="manager-activity-row">
                      <span>Wallet settlements</span>
                      <strong>+13</strong>
                    </div>
                  </div>
                </section>

                <section className="manager-card">
                  <h3>Ecosystem queues</h3>
                  <Queue label="Support" value={data.support} />
                  <Queue label="Withdrawals" value={data.withdrawals} />
                  <Queue label="Bookings" value={data.bookings} />
                </section>
              </div>
            </>
          ) : active === "Global Settings" || active === "Customer Experience" ? (
            <section className="manager-card manager-detail">
              <div className="manager-table-header">
                <h3>Platform settings</h3>
                <span className="status-pill">Manager controlled</span>
              </div>
              <p className="manager-subtitle">
                These values control customer-facing tier prices, renewal
                prices, public copy, and the QC conversion rate. Wallet cash and
                QC remain separate balances.
              </p>
              <form className="manager-settings-form" onSubmit={saveSettings}>
                <strong>
                  One-time tier prices ({settings.walletCurrency})
                </strong>
                {(["basic", "premium", "vip"] as const).map((tier) => (
                  <label key={`tier-${tier}`}>
                    {tier.toUpperCase()} price
                    <input
                      type="number"
                      min="0"
                      value={settings.tierPrices[tier]}
                      onChange={(event) =>
                        setSettings({
                          ...settings,
                          tierPrices: {
                            ...settings.tierPrices,
                            [tier]: Number(event.target.value),
                          },
                        })
                      }
                      required
                    />
                  </label>
                ))}
                <strong>
                  Monthly renewal prices ({settings.walletCurrency})
                </strong>
                {(["basic", "premium", "vip"] as const).map((tier) => (
                  <label key={`renewal-${tier}`}>
                    {tier.toUpperCase()} renewal
                    <input
                      type="number"
                      min="0"
                      value={settings.renewalPrices[tier]}
                      onChange={(event) =>
                        setSettings({
                          ...settings,
                          renewalPrices: {
                            ...settings.renewalPrices,
                            [tier]: Number(event.target.value),
                          },
                        })
                      }
                      required
                    />
                  </label>
                ))}
                <label>
                  Wallet currency
                  <input
                    value={settings.walletCurrency}
                    onChange={(event) =>
                      setSettings({
                        ...settings,
                        walletCurrency: event.target.value.toUpperCase(),
                      })
                    }
                    maxLength={3}
                    required
                  />
                </label>
                <label>
                  UGX per QC
                  <input
                    type="number"
                    min="1"
                    value={settings.qcExchangeRate}
                    onChange={(event) =>
                      setSettings({
                        ...settings,
                        qcExchangeRate: Number(event.target.value),
                      })
                    }
                    required
                  />
                </label>
                <label>
                  Direct referral rate (0-1)
                  <input
                    type="number"
                    min="0"
                    max="1"
                    step="0.01"
                    value={settings.referralRates.direct}
                    onChange={(event) =>
                      setSettings({
                        ...settings,
                        referralRates: {
                          ...settings.referralRates,
                          direct: Number(event.target.value),
                        },
                      })
                    }
                    required
                  />
                </label>
                <label>
                  Indirect referral rate (0-1)
                  <input
                    type="number"
                    min="0"
                    max="1"
                    step="0.01"
                    value={settings.referralRates.indirect}
                    onChange={(event) =>
                      setSettings({
                        ...settings,
                        referralRates: {
                          ...settings.referralRates,
                          indirect: Number(event.target.value),
                        },
                      })
                    }
                    required
                  />
                </label>
                <label>
                  About AQE
                  <textarea
                    value={settings.about}
                    onChange={(event) =>
                      setSettings({ ...settings, about: event.target.value })
                    }
                    rows={3}
                  />
                </label>
                <label>
                  Contact instructions
                  <textarea
                    value={settings.contact}
                    onChange={(event) =>
                      setSettings({ ...settings, contact: event.target.value })
                    }
                    rows={3}
                  />
                </label>
                <h4>Website footer</h4>
                <p className="manager-subtitle">
                  This information is customer-facing. The CEO can provide the About AQE text, contact details, and website/social links; the manager can update them here without changing the application code.
                </p>
                <label>
                  About AQE
                  <textarea
                    value={settings.footer.about}
                    onChange={(event) =>
                      setSettings({
                        ...settings,
                        footer: { ...settings.footer, about: event.target.value },
                      })
                    }
                    rows={5}
                    placeholder="Paste the official AQE About Us information here."
                  />
                </label>
                <div className="manager-two-column">
                  <label>
                    Contact email
                    <input
                      type="email"
                      value={settings.footer.contact.email}
                      onChange={(event) =>
                        setSettings({
                          ...settings,
                          footer: {
                            ...settings.footer,
                            contact: { ...settings.footer.contact, email: event.target.value },
                          },
                        })
                      }
                      placeholder="CEO-provided email"
                    />
                  </label>
                  <label>
                    Contact phone
                    <input
                      value={settings.footer.contact.phone}
                      onChange={(event) =>
                        setSettings({
                          ...settings,
                          footer: {
                            ...settings.footer,
                            contact: { ...settings.footer.contact, phone: event.target.value },
                          },
                        })
                      }
                      placeholder="CEO-provided phone"
                    />
                  </label>
                  <label>
                    WhatsApp
                    <input
                      value={settings.footer.contact.whatsapp}
                      onChange={(event) =>
                        setSettings({
                          ...settings,
                          footer: {
                            ...settings.footer,
                            contact: { ...settings.footer.contact, whatsapp: event.target.value },
                          },
                        })
                      }
                      placeholder="CEO-provided WhatsApp number or link"
                    />
                  </label>
                </div>
                <div className="manager-footer-links">
                  <div className="manager-table-header">
                    <h4>Website links</h4>
                    <button
                      type="button"
                      className="manager-action-button"
                      onClick={() =>
                        setSettings({
                          ...settings,
                          footer: {
                            ...settings.footer,
                            links: [...settings.footer.links, { label: "", url: "" }],
                          },
                        })
                      }
                    >
                      Add link
                    </button>
                  </div>
                  {settings.footer.links.length === 0 ? (
                    <p className="manager-subtitle">No footer links configured yet.</p>
                  ) : null}
                  {settings.footer.links.map((link, index) => (
                    <div className="manager-footer-link-row" key={index}>
                      <label>
                        Link label
                        <input
                          value={link.label}
                          onChange={(event) =>
                            setSettings({
                              ...settings,
                              footer: {
                                ...settings.footer,
                                links: settings.footer.links.map((item, itemIndex) =>
                                  itemIndex === index ? { ...item, label: event.target.value } : item,
                                ),
                              },
                            })
                          }
                          placeholder="Instagram, Website, Facebook..."
                        />
                      </label>
                      <label>
                        URL
                        <input
                          type="url"
                          value={link.url}
                          onChange={(event) =>
                            setSettings({
                              ...settings,
                              footer: {
                                ...settings.footer,
                                links: settings.footer.links.map((item, itemIndex) =>
                                  itemIndex === index ? { ...item, url: event.target.value } : item,
                                ),
                              },
                            })
                          }
                          placeholder="https://..."
                        />
                      </label>
                      <button
                        type="button"
                        className="manager-row-actions-button"
                        onClick={() =>
                          setSettings({
                            ...settings,
                            footer: {
                              ...settings.footer,
                              links: settings.footer.links.filter((_, itemIndex) => itemIndex !== index),
                            },
                          })
                        }
                      >
                        Remove
                      </button>
                    </div>
                  ))}
                </div>

                <h4>Commercial values not fixed by the current business sheet</h4>
                <p className="manager-subtitle">
                  These values are intentionally configurable. Keep them at zero until the business owner provides a price or commission rule; no value is invented by AQE.
                </p>
                <div className="manager-two-column">
                  {(["daily", "weekly", "monthly"] as const).map((period) => (
                    <label key={`boost-price-${period}`}>
                      {period.toUpperCase()} profile boost price ({settings.walletCurrency})
                      <input type="number" min="0" value={settings.commercial.profileBoostPrices[period]}
                        onChange={(event) => setSettings({ ...settings, commercial: { ...settings.commercial, profileBoostPrices: { ...settings.commercial.profileBoostPrices, [period]: Number(event.target.value) } } })} />
                    </label>
                  ))}
                  <label>
                    Marketplace commission (%)
                    <input type="number" min="0" max="100" step="0.01" value={settings.commercial.marketplaceCommissionRate * 100}
                      onChange={(event) => setSettings({ ...settings, commercial: { ...settings.commercial, marketplaceCommissionRate: Number(event.target.value) / 100 } })} />
                  </label>
                  <label>
                    VIP content commission (%)
                    <input type="number" min="0" max="100" step="0.01" value={settings.commercial.vipContentCommissionRate * 100}
                      onChange={(event) => setSettings({ ...settings, commercial: { ...settings.commercial, vipContentCommissionRate: Number(event.target.value) / 100 } })} />
                  </label>
                </div>

                <h4>Promotion pricing</h4>
                <p className="manager-subtitle">
                  Original prices, live promotional prices, and customer-facing promotion labels are manager controlled.
                </p>
                {(["basic", "premium", "vip"] as const).map((tier) => (
                  <div key={`promo-${tier}`} className="manager-two-column">
                    <label>
                      {tier.toUpperCase()} original price
                      <input type="number" min="0" value={settings.pricing.originalTierPrices[tier]}
                        onChange={(event) => setSettings({ ...settings, pricing: { ...settings.pricing, originalTierPrices: { ...settings.pricing.originalTierPrices, [tier]: Number(event.target.value) } } })} />
                    </label>
                    <label>
                      {tier.toUpperCase()} promotional price
                      <input type="number" min="0" value={settings.pricing.currentTierPrices[tier]}
                        onChange={(event) => setSettings({ ...settings, tierPrices: { ...settings.tierPrices, [tier]: Number(event.target.value) }, pricing: { ...settings.pricing, currentTierPrices: { ...settings.pricing.currentTierPrices, [tier]: Number(event.target.value) } } })} />
                    </label>
                    <label>
                      Customer promotion label
                      <input value={settings.pricing.promotionalLabels[tier]}
                        onChange={(event) => setSettings({ ...settings, pricing: { ...settings.pricing, promotionalLabels: { ...settings.pricing.promotionalLabels, [tier]: event.target.value } } })} />
                    </label>
                  </div>
                ))}
                <label>
                  Welcome bonus
                  <input type="number" min="0" value={settings.pricing.welcomeBonus}
                    onChange={(event) => setSettings({ ...settings, pricing: { ...settings.pricing, welcomeBonus: Number(event.target.value) } })} />
                </label>
                <label>
                  VIP salary
                  <input type="number" min="0" value={settings.pricing.vipSalary}
                    onChange={(event) => setSettings({ ...settings, pricing: { ...settings.pricing, vipSalary: Number(event.target.value) } })} />
                </label>
                <label>
                  VIP salary day
                  <input type="number" min="1" max="31" value={settings.pricing.vipSalaryDay}
                    onChange={(event) => setSettings({ ...settings, pricing: { ...settings.pricing, vipSalaryDay: Number(event.target.value) } })} />
                </label>
                <label>
                  Allow VIP withdrawal before the 20th
                  <input type="checkbox" checked={settings.pricing.withdrawalBefore20th}
                    onChange={(event) => setSettings({ ...settings, pricing: { ...settings.pricing, withdrawalBefore20th: event.target.checked } })} />
                </label>

                <h4>Customer-facing Rewards / Campaign / Raffle</h4>
                <label>
                  Rewards title
                  <input value={String(settings.customerContent.rewards.title ?? "")}
                    onChange={(event) => setSettings({ ...settings, customerContent: { ...settings.customerContent, rewards: { ...settings.customerContent.rewards, title: event.target.value } } })} />
                </label>
                <label>
                  Daily reward description
                  <textarea rows={2} value={String(settings.customerContent.rewards.dailyClaimDescription ?? "")}
                    onChange={(event) => setSettings({ ...settings, customerContent: { ...settings.customerContent, rewards: { ...settings.customerContent.rewards, dailyClaimDescription: event.target.value } } })} />
                </label>
                <label>
                  Campaign title
                  <input value={String(settings.customerContent.campaign.title ?? "")}
                    onChange={(event) => setSettings({ ...settings, customerContent: { ...settings.customerContent, campaign: { ...settings.customerContent.campaign, title: event.target.value } } })} />
                </label>
                <label>
                  Campaign description
                  <textarea rows={2} value={String(settings.customerContent.campaign.description ?? "")}
                    onChange={(event) => setSettings({ ...settings, customerContent: { ...settings.customerContent, campaign: { ...settings.customerContent.campaign, description: event.target.value } } })} />
                </label>
                <label>
                  Raffle title
                  <input value={String(settings.customerContent.raffle.title ?? "")}
                    onChange={(event) => setSettings({ ...settings, customerContent: { ...settings.customerContent, raffle: { ...settings.customerContent.raffle, title: event.target.value } } })} />
                </label>
                <label>
                  Raffle description
                  <textarea rows={2} value={String(settings.customerContent.raffle.description ?? "")}
                    onChange={(event) => setSettings({ ...settings, customerContent: { ...settings.customerContent, raffle: { ...settings.customerContent.raffle, description: event.target.value } } })} />
                </label>
                <label>
                  VIP content title
                  <input value={String(settings.customerContent.vipContent.title ?? "")}
                    onChange={(event) => setSettings({ ...settings, customerContent: { ...settings.customerContent, vipContent: { ...settings.customerContent.vipContent, title: event.target.value } } })} />
                </label>
                <label>
                  VIP content description
                  <textarea rows={2} value={String(settings.customerContent.vipContent.description ?? "")}
                    onChange={(event) => setSettings({ ...settings, customerContent: { ...settings.customerContent, vipContent: { ...settings.customerContent.vipContent, description: event.target.value } } })} />
                </label>

                <button type="submit" className="manager-action-button">
                  Save platform settings
                </button>
              </form>
              {reviewMessage ? (
                <div className="manager-review-message">{reviewMessage}</div>
              ) : null}
            </section>
          ) : active === "Payments & Approvals" ? (
            <>
              <section className="manager-card manager-detail">
                <div className="manager-table-header">
                  <h3>Mukuru receiver details</h3>
                  <span className="status-pill">Manager controlled</span>
                </div>
                <p className="manager-subtitle">
                  Customers see these details and use them on Mukuru to send
                  payment. They never edit the receiver account.
                </p>
                <form className="manager-settings-form" onSubmit={saveReceiver}>
                  <label>
                    Receiver name
                    <input
                      value={receiver.receiverName}
                      onChange={(event) =>
                        setReceiver({
                          ...receiver,
                          receiverName: event.target.value,
                        })
                      }
                      required
                    />
                  </label>
                  <label>
                    Receiver phone number
                    <input
                      value={receiver.receiverPhone}
                      onChange={(event) =>
                        setReceiver({
                          ...receiver,
                          receiverPhone: event.target.value,
                        })
                      }
                      required
                    />
                  </label>
                  <label>
                    Receiver card / account
                    <input
                      value={receiver.receiverCard}
                      onChange={(event) =>
                        setReceiver({
                          ...receiver,
                          receiverCard: event.target.value,
                        })
                      }
                      required
                    />
                  </label>
                  <label>
                    Customer instructions
                    <textarea
                      value={receiver.instructions}
                      onChange={(event) =>
                        setReceiver({
                          ...receiver,
                          instructions: event.target.value,
                        })
                      }
                      rows={3}
                    />
                  </label>
                  <button type="submit" className="manager-action-button">
                    Save receiver details
                  </button>
                </form>
              </section>
              <section className="manager-card manager-detail">
                <div className="manager-table-header">
                  <h3>Payment approvals</h3>
                </div>
                {reviewMessage ? (
                  <div className="manager-review-message">{reviewMessage}</div>
                ) : null}
                <div className="manager-list-table">
                  {paymentRows.map((row: ManagerRow) => (
                    <div
                      key={`${active}-${row.id || row.title}`}
                      className="manager-row"
                    >
                      <div>
                        <strong>{row.title}</strong>
                        <span>{row.meta}</span>
                      </div>
                      <div className="manager-row-actions">
                        <em>{row.value}</em>
                        {row.id ? (
                          <>
                            <button
                              type="button"
                              onClick={() =>
                                reviewPayment(row.id!, "confirmed")
                              }
                            >
                              Confirm & upgrade
                            </button>
                            <button
                              type="button"
                              onClick={() => reviewPayment(row.id!, "rejected")}
                            >
                              Reject
                            </button>
                          </>
                        ) : null}
                      </div>
                    </div>
                  ))}
                </div>
              </section>
            </>
          ) : active === "Tasks & Rewards" ? (
            <PrizeManager />
          ) : (
            <section className="manager-card manager-detail">
              <div className="manager-table-header">
                <h3>{active}</h3>
                {active === "Media & Profile Boosts" ? <ProfileBoostManager /> : null}
                {active === "Campaign Room" ? <CampaignManager /> : null}

      {active === "Users & Profiles" ? (
                  <input
                    className="manager-search"
                    value={profileQuery}
                    onChange={(event) => setProfileQuery(event.target.value)}
                    placeholder="Filter profiles"
                    aria-label="Filter profiles"
                  />
                ) : null}
                <button
                  type="button"
                  className="manager-action-button"
                  onClick={() =>
                    setReviewMessage(`${active} review queue opened.`)
                  }
                >
                  Review
                </button>
              </div>
              {reviewMessage ? (
                <div className="manager-review-message">{reviewMessage}</div>
              ) : null}

              <div className="manager-metrics condensed">
                <Metric label="BOOKINGS" value={data.bookings} />
                <Metric label="MESSAGES" value={data.messages} />
                <Metric label="PRODUCTS" value={data.products} />
                <Metric label="SUPPORT" value={data.support} />
              </div>

              {active === "Withdrawals" ? (
                <div className="manager-review-message">
                  <strong>CEO withdrawal policy:</strong> UGX 30,000 minimum · UGX
                  5,000,000 maximum · 10% service charge · Basic weekends only ·
                  Premium every 2 days · VIP every 1 day · at least 1 day between
                  applications. The 10% fee is credited to the member's direct
                  Team Leader when the payout is marked Succeed after the money
                  has been sent.
                </div>
              ) : null}

              <div className="manager-list-table">
                {rows.map((row: ManagerRow) => (
                  <div key={`${active}-${row.title}`} className="manager-row">
                    <div>
                      <strong>{row.title}</strong>
                      <span>{row.meta}</span>
                    </div>
                    <div className="manager-row-actions">
                      <em>{row.value}</em>
                      {active === "Bookings & Requests" &&
                      row.id &&
                      /pending/i.test(row.value) ? (
                        <>
                          <button
                            type="button"
                            onClick={() => reviewBooking(row.id!, "accepted")}
                          >
                            Approve
                          </button>
                          <button
                            type="button"
                            onClick={() => reviewBooking(row.id!, "rejected")}
                          >
                            Reject
                          </button>
                        </>
                      ) : null}
                      {active === "Profile Media" &&
                      row.id &&
                      /pending/i.test(row.value) ? (
                        <>
                          <button
                            type="button"
                            onClick={() => reviewMedia(row.id!, "approved")}
                          >
                            Approve
                          </button>
                          <button
                            type="button"
                            onClick={() => reviewMedia(row.id!, "rejected")}
                          >
                            Reject
                          </button>
                        </>
                      ) : null}
                      {active === "Withdrawals" &&
                      row.id &&
                      /approved/i.test(row.value) ? (
                        <button
                          type="button"
                          onClick={() =>
                            reviewWithdrawal(row.id!, "PAID")
                          }
                        >
                          Mark Succeed — payout sent
                        </button>
                      ) : null}
                      {active === "Withdrawals" &&
                      row.id &&
                      /pending/i.test(row.value) ? (
                        <>
                          <button
                            type="button"
                            onClick={() =>
                              reviewWithdrawal(row.id!, "APPROVED")
                            }
                          >
                            Approve
                          </button>
                          <button
                            type="button"
                            onClick={() =>
                              reviewWithdrawal(row.id!, "REJECTED")
                            }
                          >
                            Reject
                          </button>
                        </>
                      ) : null}
                    </div>
                  </div>
                ))}
              </div>
            </section>
          )}
        </div>
      </main>
    </div>
  );
}

function Metric({ label, value }: { label: string; value: number }) {
  return (
    <div className="manager-metric">
      <span>{label}</span>
      <strong>{value}</strong>
    </div>
  );
}

function Queue({ label, value }: { label: string; value: number }) {
  return (
    <div className="manager-queue">
      <span>{label}</span>
      <strong>{value}</strong>
    </div>
  );
}
