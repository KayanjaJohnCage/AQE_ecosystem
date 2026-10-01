"use client";

import { useEffect, useState } from "react";
import { createClient } from "@supabase/supabase-js";
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
  userId?: string;
  name: string;
  city: string;
  tag: string;
  status: string;
  tier?: string;
  role?: string;
};

type ManagerRow = { id?: string; title: string; meta: string; value: string };
type ReceiverDetails = {
  id?: string;
  receiverName: string;
  receiverPhone: string;
  receiverCard: string;
  network?: string;
  instructions: string;
  status?: "available" | "busy" | "inactive";
  updatedAt?: string;
};

type TroubleshootRequest = { id: string; user_id: string; requested_change: string; details: string; qc_charge: number; status: string; created_at: string };
type ManagerPaymentNumber = {
  id: string;
  number: string;
  name: string;
  network: "Airtel" | "MTN";
  status: "available" | "busy";
};

type PlatformSettings = {
  tierPrices: { basic: number; premium: number; vip: number };
  renewalPrices: { basic: number; premium: number; vip: number };
  walletCurrency: string;
  qcExchangeRate: number;
  referralRates: { direct: number; indirect: number };
  referralRatesByTier: { basic: { direct: number; indirect: number }; premium: { direct: number; indirect: number }; vip: { direct: number; indirect: number } };
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
    explore: Record<string, unknown>;
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

const tableSeeds: Record<string, ManagerRow[]> = {};

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
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [managerLabel, setManagerLabel] = useState("Administrator");
  const [profiles, setProfiles] = useState<ManagerProfile[]>([]);
  const [liveRows, setLiveRows] = useState<Record<string, ManagerRow[]>>({});
  const [profileQuery, setProfileQuery] = useState("");
  const [reviewMessage, setReviewMessage] = useState("");
  const [managerNumbers, setManagerNumbers] = useState<ManagerPaymentNumber[]>([]);
  const [troubleshootRequests, setTroubleshootRequests] = useState<TroubleshootRequest[]>([]);
  const [urgentAlerts, setUrgentAlerts] = useState<Array<{text:string;target:string}>>([]);
  const [recentActivity, setRecentActivity] = useState<ManagerRow[]>([]);
  const [browserAlertsEnabled, setBrowserAlertsEnabled] = useState(() => {
    try {
      return typeof Notification !== "undefined" && Notification.permission === "granted" &&
        localStorage.getItem("aqe-manager-browser-alerts") === "1";
    } catch {
      return false;
    }
  });
  const [receivers, setReceivers] = useState<ReceiverDetails[]>([]);
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
    referralRates: { direct: 0.1, indirect: 0.12 },
    referralRatesByTier: { basic: { direct: 0.10, indirect: 0 }, premium: { direct: 0.10, indirect: 0 }, vip: { direct: 0.12, indirect: 0.12 } },
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
      home: { filters: ["All","Available","VIP","Premium","Kampala","Entebbe","Female","Male","Lesbian"] },
      explore: { filters: ["All","Photography","Video","Art","Styling","Audio"] },
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

    fetch("/api/profiles", { headers })
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
          const [bookings, messages, products, support, withdrawals, payments, media, receipts] =
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
          if (Array.isArray(payments.payments)) {
            nextRows["Payments & Approvals"] = payments.payments.map(
              (payment: {
                id?: string;
                user_id?: string;
                amount?: number;
                currency?: string;
                reference?: string;
                created_at?: string;
                displayStatus?: string;
                locked?: boolean;
                senderName?: string;
                senderPhone?: string;
                senderNetwork?: string;
                receiverName?: string;
                receiverPhone?: string;
                receiverCard?: string;
                metadata?: { requestedTier?: string; paymentKind?: string; fundingSource?: string };
                status?: string;
              }) => {
                const kind = payment.metadata?.paymentKind || "wallet_deposit";
                const referenceLabel =
                  kind === "wallet_deposit"
                    ? "WALLET"
                    : kind === "membership_upgrade"
                      ? `UPGRADE • ${(payment.metadata?.requestedTier || "basic").toUpperCase()}`
                      : kind.toUpperCase();
                const sender = payment.senderName || "Sender not supplied";
                const senderPhone = payment.senderPhone || "Number not supplied";
                const receiver = payment.receiverName || "Receiver not configured";
                const receiverPhone = payment.receiverPhone || "—";
                const sent = payment.created_at ? new Date(payment.created_at).toLocaleString() : "Time unavailable";
                return {
                  id: payment.id,
                  title: `${payment.currency || "UGX"} ${Number(payment.amount ?? 0).toLocaleString()} • ${sender}`,
                  meta: `${referenceLabel} • Sent ${sent} • From ${senderPhone} → ${receiver} ${receiverPhone}`,
                  value: `${payment.displayStatus || payment.status || "pending"} • ${payment.locked ? "LOCKED" : "ACTION REQUIRED"}`,
                };
              },
            );
          }

          if (Array.isArray(receipts.receipts)) {
            nextRows["Transactions & QC"] = receipts.receipts.slice(0, 100).map(
              (receipt: {
                id?: string;
                transaction_type?: string;
                description?: string;
                amount?: number;
                currency?: string;
                status?: string;
                created_at?: string;
                receipt_number?: string;
              }) => ({
                id: receipt.id,
                title: receipt.description || receipt.transaction_type || "Transaction",
                meta: `${receipt.receipt_number || "Receipt"} • ${receipt.created_at ? new Date(receipt.created_at).toLocaleString() : "Time unavailable"}`,
                value: `${receipt.status || "COMPLETED"} • ${receipt.currency || "UGX"} ${Number(receipt.amount || 0).toLocaleString()}`,
              }),
            );
            setRecentActivity(nextRows["Transactions & QC"].slice(0, 8));
          }

          const alerts: string[] = [];
          const pendingPayments = (payments.payments || []).filter((p: { status?: string }) => ["initiated","pending"].includes(String(p.status)));
          if (pendingPayments.length) alerts.push({text:`${pendingPayments.length} payment request${pendingPayments.length === 1 ? "" : "s"} awaiting action.`,target:"Payments & Approvals"});
          const pendingWithdrawals = (withdrawals.withdrawals || []).filter((w: { status?: string }) => ["PENDING","APPROVED"].includes(String(w.status)));
          if (pendingWithdrawals.length) alerts.push({text:`${pendingWithdrawals.length} withdrawal request${pendingWithdrawals.length === 1 ? "" : "s"} need attention.`,target:"Withdrawals"});
          const openSupport = (support.tickets || []).filter((t: { status?: string }) => String(t.status).toUpperCase() === "OPEN");
          if (openSupport.length) alerts.push({text:`${openSupport.length} open customer support ticket${openSupport.length === 1 ? "" : "s"} need attention.`,target:"Customer Support"});
          setUrgentAlerts(alerts);
          setLiveRows(nextRows);
        },
      )
      .catch(() => undefined);

    fetch("/api/support/troubleshoot")
      .then(async (response) => {
        if (!response.ok) return;
        const payload = await response.json();
        if (Array.isArray(payload.requests)) setTroubleshootRequests(payload.requests);
      })
      .catch(() => undefined);

    fetch("/api/payments/manager-numbers")
      .then(async (response) => {
        if (!response.ok) return;
        const payload = await response.json();
        if (Array.isArray(payload.numbers)) setManagerNumbers(payload.numbers);
      })
      .catch(() => undefined);

    fetch("/api/payments/receiver")
      .then(async (response) => {
        if (!response.ok) return;
        const payload = await response.json();
        if (Array.isArray(payload.receivers)) setReceivers(payload.receivers);
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

  useEffect(() => {
    let timer: ReturnType<typeof setInterval> | undefined;
    let lastPending = -1;

    const pollUrgentQueues = async () => {
      const { session, user } = readStoredSession();
      const headers: HeadersInit = {};
      if (session.access_token) headers.authorization = `Bearer ${session.access_token}`;
      if (user.id) headers["x-user-id"] = user.id;

      try {
        const [paymentsResponse, withdrawalsResponse, supportResponse] = await Promise.all([
          fetch("/api/payments/manager-direct", { headers, cache: "no-store" }),
          fetch("/api/vip/withdrawals", { headers, cache: "no-store" }),
          fetch("/api/support/tickets", { headers, cache: "no-store" }),
        ]);
        const payments = paymentsResponse.ok ? await paymentsResponse.json() : {};
        const withdrawals = withdrawalsResponse.ok ? await withdrawalsResponse.json() : {};
        const support = supportResponse.ok ? await supportResponse.json() : {};
        const pendingPayments = (payments.payments || []).filter((p: { status?: string }) => ["initiated", "pending"].includes(String(p.status))).length;
        const pendingWithdrawals = (withdrawals.withdrawals || []).filter((w: { status?: string }) => ["PENDING", "APPROVED"].includes(String(w.status))).length;
        const openSupport = (support.tickets || []).filter((t: { status?: string }) => String(t.status).toUpperCase() === "OPEN").length;
        const alerts: string[] = [];
        if (pendingPayments) alerts.push(`${pendingPayments} payment request${pendingPayments === 1 ? "" : "s"} awaiting action.`);
        if (pendingWithdrawals) alerts.push(`${pendingWithdrawals} withdrawal request${pendingWithdrawals === 1 ? "" : "s"} need attention.`);
        if (openSupport) alerts.push(`${openSupport} open customer support ticket${openSupport === 1 ? "" : "s"} need attention.`);
        setUrgentAlerts(alerts);

        if (lastPending >= 0 && pendingPayments > lastPending && browserAlertsEnabled && "Notification" in window && Notification.permission === "granted") {
          try {
            new Notification("AQE Manager: new payment request", {
              body: `${pendingPayments - lastPending} new payment request${pendingPayments - lastPending === 1 ? "" : "s"} need confirmation.`,
            });
          } catch (_) {}
        }
        lastPending = pendingPayments;
      } catch (_) {}
    };

    pollUrgentQueues();
    timer = setInterval(pollUrgentQueues, 5000);
    return () => { if (timer) clearInterval(timer); };
  }, [browserAlertsEnabled]);

  const managerHeaders = (): HeadersInit => {
    const { session, user } = readStoredSession();
    const headers: HeadersInit = { "Content-Type": "application/json" };
    if (session.access_token) headers.authorization = `Bearer ${session.access_token}`;
    if (user.id) headers["x-user-id"] = user.id;
    return headers;
  };

  const managerResourceForActive = (section: string) => ({
    "Users & Profiles": "profiles",
    "Bookings & Requests": "bookings",
    "Messages & DM": "direct_messages",
    "Marketplace & Stores": "marketplace_products",
    "Customer Support": "support_ticket",
    "Profile Media": "profile_media",
    "Campaign Room": "campaigns",
    "Raffle": "campaign_redemptions",
    "Announcements": "notifications",
    "Notifications": "notifications",
    "My Team / Referrals": "referral_earnings",
    "Tasks & Rewards": "aqe_prizes",
    "VIP Asset Room": "vip_asset_rooms",
    "Withdrawals": "vip_withdrawal_requests",
    "Transactions & QC": "transaction_receipts",
    "Payments & Approvals": "payment_orders",
  } as Record<string,string>)[section] || "";

  const controlRequest = async (action: string, resource: string, payload: Record<string, unknown> = {}) => {
    const response = await fetch("/api/manager/control", {
      method: "POST",
      headers: managerHeaders(),
      body: JSON.stringify({ action, resource, ...payload }),
      cache: "no-store",
    });
    const body = await response.json().catch(() => ({}));
    if (!response.ok || !body.ok) throw new Error(body.reason || "Manager action failed.");
    return body;
  };

  const managerCreate = async () => {
    const resource = managerResourceForActive(active);
    if (!resource || (!["notifications","bookings","direct_messages","marketplace_products","campaigns","aqe_prizes","support_ticket","profiles"].includes(resource))) {
      setReviewMessage("Create-new is not available for this financial/audit queue. Use its dedicated workflow.");
      return;
    }
    try {
      if (resource === "profiles") {
        const email = window.prompt("Customer email") || "";
        const password = window.prompt("Temporary password (8+ characters)") || "";
        const displayName = window.prompt("Customer display name") || "";
        const phone = window.prompt("Customer phone number") || "";
        if (!email || !password || !displayName || !phone) return;
        const response = await fetch("/api/manager/users", { method: "POST", headers: managerHeaders(), body: JSON.stringify({ email, password, displayName, phone }) });
        const body = await response.json().catch(() => ({}));
        if (!response.ok || !body.ok) throw new Error(body.reason || "Customer creation failed.");
        setReviewMessage("Customer account created successfully.");
        return;
      }
      const payload: Record<string, unknown> = {};
      if (resource === "notifications") {
        payload.userId = window.prompt("Customer user ID"); if (!payload.userId) return;
        payload.title = window.prompt("Notification title") || ""; payload.body = window.prompt("Notification message") || "";
      } else if (resource === "bookings") {
        payload.customerId = window.prompt("Customer user ID") || ""; payload.providerId = window.prompt("Provider user ID") || "";
        payload.service = window.prompt("Service") || ""; payload.amount = Number(window.prompt("Amount (UGX)") || 0); payload.currency = "UGX"; payload.status = "pending";
      } else if (resource === "direct_messages") {
        payload.recipientId = window.prompt("Recipient user ID") || ""; payload.body = window.prompt("Message") || "";
      } else if (resource === "marketplace_products") {
        payload.sellerId = window.prompt("Seller user ID") || ""; payload.title = window.prompt("Product title") || "";
        payload.price = Number(window.prompt("Price (UGX)") || 0); payload.inventory = Number(window.prompt("Inventory") || 1); payload.currency = "UGX"; payload.status = "active";
      } else if (resource === "campaigns") {
        payload.name = window.prompt("Campaign name") || ""; payload.description = window.prompt("Description") || ""; payload.status = "draft";
      } else if (resource === "aqe_prizes") {
        payload.title = window.prompt("Prize title") || ""; payload.inviteRequirement = Number(window.prompt("Invite requirement") || 1);
        payload.tierScope = window.prompt("Tier scope", "vip") || "vip"; payload.rewardType = window.prompt("Reward type", "physical") || "physical";
      } else {
        payload.userId = window.prompt("Customer user ID") || ""; payload.category = window.prompt("Category", "GENERAL") || "GENERAL"; payload.subject = window.prompt("Subject") || ""; payload.priority = "MEDIUM"; payload.status = "OPEN";
      }
      await controlRequest("create", resource, payload);
      setReviewMessage(`${active}: new record created.`);
    } catch (error) { setReviewMessage(error instanceof Error ? error.message : "Create failed."); }
  };

  const managerEdit = async (row: ManagerRow) => {
    const resource = managerResourceForActive(active);
    if (!resource || !row.id) return;
    if (resource === "transaction_receipts" || resource === "payment_orders" || resource === "referral_earnings") {
      setReviewMessage("Financial records are immutable; use the dedicated approval/reversal workflow.");
      return;
    }
    const field = window.prompt("Field to update (for example status, title, body, notes, price, inventory)", "status");
    if (!field) return;
    const value = window.prompt(`New value for ${field}`);
    if (value === null) return;
    try {
      const payload: Record<string, unknown> = { id: row.id };
      const numericFields = ["amount","price","inventory","cash_value","invite_requirement","qc_charge"];
      payload[field] = numericFields.includes(field) ? Number(value) : value;
      await controlRequest("update", resource, payload);
      setReviewMessage(`${active}: record updated.`);
    } catch (error) { setReviewMessage(error instanceof Error ? error.message : "Update failed."); }
  };

  const managerDelete = async (row: ManagerRow) => {
    if (active === "Users & Profiles" && ["manager","admin"].includes(String((row as ManagerRow & { role?: string }).role || "").toLowerCase())) {
      setReviewMessage("Manager/admin accounts cannot be deleted."); return;
    }
    const resource = managerResourceForActive(active);
    if (!resource || !row.id) return;
    if (resource === "profile_media") {
      if (!window.confirm("Delete this media asset from the database and storage?")) return;
      try {
        const response = await fetch("/api/media/item", { method: "DELETE", headers: managerHeaders(), body: JSON.stringify({ mediaId: row.id }) });
        const body = await response.json().catch(() => ({}));
        if (!response.ok || !body.ok) throw new Error(body.reason || "Media deletion failed.");
        setReviewMessage("Media asset deleted from storage and database.");
      } catch (error) { setReviewMessage(error instanceof Error ? error.message : "Media deletion failed."); }
      return;
    }
    if (resource === "payment_orders" || resource === "referral_earnings") {
      setReviewMessage("Payment orders and referral earnings are protected financial records and cannot be deleted from Manager Control.");
      return;
    }
    if (!window.confirm(`Delete this ${active} record? This action cannot be undone.`)) return;
    try {
      await controlRequest("delete", resource, { id: row.id });
      setReviewMessage(`${active}: record deleted.`);
    } catch (error) { setReviewMessage(error instanceof Error ? error.message : "Delete failed."); }
  };

  const managerBlock = async (row: ManagerRow) => {
    if (!row.id || active !== "Users & Profiles") return;
    if (String((row as ManagerRow & { role?: string }).role || "").toLowerCase() === "manager" || String((row as ManagerRow & { role?: string }).role || "").toLowerCase() === "admin") {
      setReviewMessage("Manager/admin accounts cannot be blocked."); return;
    }
    const currentlyBlocked = /blocked/i.test(row.value);
    try {
      await controlRequest(currentlyBlocked ? "unblock" : "block", "profiles", { userId: row.id });
      setReviewMessage(currentlyBlocked ? `${row.title} unblocked.` : `${row.title} blocked.`);
    } catch (error) { setReviewMessage(error instanceof Error ? error.message : "Block action failed."); }
  };

  const managerClear = async () => {
    const resource = managerResourceForActive(active);
    if (!resource || ["payment_orders","referral_earnings","cash_wallet","cash_wallet_ledger","qc_ledger","creator_earnings","audit_log"].includes(resource)) {
      setReviewMessage("Clear-all is disabled for live financial ledgers and audit data. Transaction history/receipts can be cleared separately.");
      return;
    }
    if (!window.confirm(`Clear ALL records in ${active}? This cannot be undone.`)) return;
    try {
      await controlRequest("clear", resource);
      setReviewMessage(`${active}: all records cleared.`);
    } catch (error) { setReviewMessage(error instanceof Error ? error.message : "Clear-all failed."); }
  };

  /* Live manager sync: refreshes the current operational queue every 3 seconds without page reload. */
  useEffect(() => {
    let timer: ReturnType<typeof setInterval> | undefined;
    const refresh = async () => {
      const headers = managerHeaders();
      try {
        const dashboardResponse = await fetch("/api/dashboard", { headers, cache: "no-store" });
        if (dashboardResponse.ok) {
          const payload = await dashboardResponse.json();
          if (payload.manager) setData(payload.manager);
        }
        const endpoints: Record<string,string> = {
          "Users & Profiles": "/api/profiles",
          "Bookings & Requests": "/api/bookings",
          "Messages & DM": "/api/messages",
          "Marketplace & Stores": "/api/marketplace/products",
          "Customer Support": "/api/support/tickets",
          "Withdrawals": "/api/vip/withdrawals",
          "Payments & Approvals": "/api/payments/manager-direct",
          "Profile Media": "/api/media/manager",
          "Transactions & QC": "/api/receipts",
        };
        const endpoint = endpoints[active];
        if (!endpoint) return;
        const response = await fetch(endpoint, { headers, cache: "no-store" });
        if (!response.ok) return;
        const payload = await response.json();
        if (active === "Users & Profiles" && Array.isArray(payload.profiles)) setProfiles(payload.profiles);
        if (active === "Bookings & Requests" && Array.isArray(payload.bookings)) setLiveRows(x => ({...x,"Bookings & Requests":payload.bookings.map((b:any)=>({id:b.id,title:b.title||"Booking request",meta:b.date||b.created_at||"Date pending",value:b.status||String(b.amount||"Pending")}))}));
        if (active === "Messages & DM" && Array.isArray(payload.messages)) setLiveRows(x => ({...x,"Messages & DM":payload.messages.map((m:any)=>({id:m.id,title:m.userId||m.sender_id||"Community member",meta:m.preview||m.body||"Message",value:m.read?"Read":"Unread"}))}));
        if (active === "Marketplace & Stores" && Array.isArray(payload.products)) setLiveRows(x => ({...x,"Marketplace & Stores":payload.products.map((p:any)=>({id:p.id,title:p.title||"Product",meta:`Seller: ${p.seller_id||"AQE"}`,value:`${p.currency||"UGX"} ${Number(p.price||0).toLocaleString()} • ${p.inventory??0} left`}))}));
        if (active === "Customer Support" && Array.isArray(payload.tickets)) setLiveRows(x => ({...x,"Customer Support":payload.tickets.map((t:any)=>({id:t.id,title:t.subject||"Support ticket",meta:`${t.category||"OTHER"} • ${t.priority||"MEDIUM"}`,value:t.status||"OPEN"}))}));
        if (active === "Withdrawals" && Array.isArray(payload.withdrawals)) setLiveRows(x => ({...x,"Withdrawals":payload.withdrawals.map((w:any)=>({id:w.id,title:`${String(w.tier||"basic").toUpperCase()} payout • ${w.recipient_name||"member"}`,meta:`${w.payment_method||"MOBILE_MONEY"} • ${w.recipient_account||"No destination"}`,value:`${w.status||"PENDING"} • Gross ${w.currency||"UGX"} ${Number(w.amount||0).toLocaleString()}`}))}));
        if (active === "Payments & Approvals" && Array.isArray(payload.payments)) setLiveRows(x => ({...x,"Payments & Approvals":payload.payments.map((p:any)=>({id:p.id,title:`${p.currency||"UGX"} ${Number(p.amount||0).toLocaleString()} • ${p.senderName||p.user_id||"member"}`,meta:`${p.metadata?.paymentKind==="wallet_deposit"?"WALLET":"UPGRADE"} • ${p.created_at?new Date(p.created_at).toLocaleString():"Time unavailable"} • From ${p.senderPhone||"—"} → ${p.receiverName||"—"}`,value:`${p.displayStatus||p.status||"pending"} • ${p.locked?"LOCKED":"ACTION REQUIRED"}`}))}));
        if (active === "Profile Media" && Array.isArray(payload.media)) setLiveRows(x => ({...x,"Profile Media":payload.media.map((m:any)=>({id:m.id,title:`${String(m.type||"image").toUpperCase()} • ${m.isProfilePhoto?"PROFILE PHOTO":"PROFILE CONTENT"}`,meta:`Owner: ${m.ownerUserId||"member"}`,value:m.moderationStatus||"pending"}))}));
        if (active === "Transactions & QC" && Array.isArray(payload.receipts)) setLiveRows(x => ({...x,"Transactions & QC":payload.receipts.map((q:any)=>({id:q.id,title:q.description||q.transaction_type||"Transaction",meta:q.receipt_number||"Receipt",value:`${q.status||"COMPLETED"} • ${q.currency||"UGX"} ${Number(q.amount||0).toLocaleString()}`}))}));
      } catch (_) {}
    };
    refresh();
    const liveEvent = () => { void refresh(); };
    window.addEventListener("aqe-manager-live-event", liveEvent);
    timer = setInterval(refresh, 3000);
    return () => {
      if (timer) clearInterval(timer);
      window.removeEventListener("aqe-manager-live-event", liveEvent);
    };
  }, [active]);

  /* Supabase Realtime wakes the manager immediately when a subscribed public table changes.
     The 3-second sync remains as a resilience fallback for missed websocket events. */
  useEffect(() => {
    const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const key = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
    const { session } = readStoredSession();
    const accessToken = session.access_token;
    const refreshToken = session.refresh_token;
    if (!url || !key || typeof accessToken !== "string" || typeof refreshToken !== "string") return;
    const client = createClient(url, key);
    let channel: ReturnType<typeof client.channel> | undefined;
    let cancelled = false;
    (async () => {
      try {
        const result = await client.auth.setSession({
          access_token: accessToken,
          refresh_token: refreshToken,
        });
        if (cancelled || result.error) return;
        channel = client
          .channel("aqe-manager-live-db")
          .on("postgres_changes", { event: "*", schema: "public" }, () => {
            window.dispatchEvent(new Event("aqe-manager-live-event"));
          })
          .subscribe();
      } catch (_) {}
    })();
    return () => {
      cancelled = true;
      if (channel) void client.removeChannel(channel);
    };
  }, []);

  const enableManagerNotifications = async () => {
    if (!("Notification" in window)) {
      setReviewMessage("This browser does not support system notifications. The in-console urgent alert will still work.");
      return;
    }
    if (Notification.permission === "granted") {
      setBrowserAlertsEnabled(true);
      try { localStorage.setItem("aqe-manager-browser-alerts", "1"); } catch {}
      return;
    }
    if (Notification.permission === "denied") {
      setReviewMessage("Browser notifications are blocked. Enable them in the browser site settings.");
      return;
    }
    const permission = await Notification.requestPermission();
    if (permission === "granted") {
      setBrowserAlertsEnabled(true);
      try { localStorage.setItem("aqe-manager-browser-alerts", "1"); } catch {}
      setReviewMessage("Manager browser alerts enabled.");
    }
  };

  const filteredProfiles = profiles.filter((profile) => {
    const query = profileQuery.trim().toLowerCase();
    if (!query) return true;
    return `${profile.name} ${profile.city} ${profile.tag} ${profile.status}`
      .toLowerCase()
      .includes(query);
  });
  const profileRows: ManagerRow[] = filteredProfiles.map((profile) => ({
    id: profile.userId || profile.id,
    title: profile.name,
    meta: `${profile.city} • ${profile.tag}`,
    value: `${profile.status} • ${(profile.tier || "basic").toUpperCase()}`,
    role: profile.role,
  }));
  const rows: ManagerRow[] =
    active === "Users & Profiles" && profileRows.length > 0
      ? profileRows
      : liveRows[active]?.length
        ? liveRows[active]
        : (tableSeeds[active] ?? []);
  const paymentRows: ManagerRow[] = liveRows["Payments & Approvals"] ?? [];

  async function deleteCustomer(userId: string, name: string) {
    if (!userId) {
      setReviewMessage("This customer has no user ID and cannot be deleted.");
      return;
    }
    const confirmed = window.confirm(
      `Delete customer account "${name}"? This removes the customer profile/auth identity and customer-facing content. Financial and audit records are retained for traceability. This action cannot be undone.`,
    );
    if (!confirmed) return;

    const { session, user } = readStoredSession();
    const headers: HeadersInit = { "Content-Type": "application/json" };
    if (session.access_token) headers.authorization = `Bearer ${session.access_token}`;
    if (user.id) headers["x-user-id"] = user.id;

    const response = await fetch("/api/manager/users", {
      method: "DELETE",
      headers,
      body: JSON.stringify({ userId }),
    });
    const payload = await response.json().catch(() => ({}));
    if (!response.ok || !payload.ok) {
      setReviewMessage(payload.reason || "Customer deletion failed.");
      return;
    }
    setProfiles((items) => items.filter((item) => (item.userId || item.id) !== userId));
    setReviewMessage(payload.message || `Customer ${name} deleted.`);
  }

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
            ? "Wallet deposit completed. Cash was credited to the member wallet."
            : `Payment completed. User upgraded to ${(payload.upgradedTier || payload.payment?.upgradedTier || "paid").toUpperCase()}.`
          : "Payment request rejected and locked."
        : payload.reason || "Payment review failed.",
    );
    if (payload.ok) {
      const refreshed = await fetch("/api/payments/manager-direct", { headers });
      if (refreshed.ok) {
        const body = await refreshed.json().catch(() => ({}));
        if (Array.isArray(body.payments)) {
          setLiveRows((current) => ({
            ...current,
            "Payments & Approvals": body.payments.map((payment: {
              id?: string; amount?: number; currency?: string; user_id?: string; reference?: string;
              created_at?: string; displayStatus?: string; locked?: boolean; senderName?: string;
              senderPhone?: string; receiverName?: string; receiverPhone?: string;
              metadata?: { requestedTier?: string; paymentKind?: string }; status?: string;
            }) => ({
              id: payment.id,
              title: `${payment.currency || "UGX"} ${Number(payment.amount || 0).toLocaleString()} • ${payment.senderName || payment.user_id || "member"}`,
              meta: `${payment.metadata?.paymentKind === "wallet_deposit" ? "WALLET" : "UPGRADE"} • Sent ${payment.created_at ? new Date(payment.created_at).toLocaleString() : "Time unavailable"} • From ${payment.senderPhone || "—"} → ${payment.receiverName || "—"} ${payment.receiverPhone || ""}`,
              value: `${payment.displayStatus || payment.status || "pending"} • ${payment.locked ? "LOCKED" : "ACTION REQUIRED"}`,
            })),
          }));
        }
      }
    }
  }

  async function managerIdentityUpdate(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const userId = String(form.get("userId") || "").trim();
    const field = String(form.get("field") || "");
    const value = String(form.get("value") || "");
    const body: Record<string, string> = { userId };
    if (field === "displayName") body.displayName = value;
    if (field === "phone") body.phone = value;
    if (field === "email") body.email = value;
    if (field === "password") body.password = value;
    if (!userId || !value) { setReviewMessage("User ID and new value are required."); return; }
    const response = await fetch("/api/account/identity", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    const payload = await response.json().catch(() => ({}));
    setReviewMessage(payload.ok ? "Account identity updated for " + userId + "." : payload.reason || "Manager identity update failed.");
    if (payload.ok) event.currentTarget.reset();
  }

  async function updateTroubleshoot(requestId: string, status: string) {
    const response = await fetch("/api/support/troubleshoot", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ requestId, status }),
    });
    const payload = await response.json().catch(() => ({}));
    setReviewMessage(payload.ok ? "Troubleshoot request " + status.toLowerCase() + "." : payload.reason || "Troubleshoot update failed.");
    if (payload.ok) setTroubleshootRequests((items) => items.map((item) => item.id === requestId ? { ...item, status } : item));
  }

  function updateManagerNumber(id: string, patch: Partial<ManagerPaymentNumber>) {
    setManagerNumbers((items) =>
      items.map((item) => (item.id === id ? { ...item, ...patch } : item)),
    );
  }

  async function saveManagerNumbers() {
    const response = await fetch("/api/payments/manager-numbers", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ numbers: managerNumbers }),
    });
    const payload = await response.json().catch(() => ({}));
    setReviewMessage(payload.ok ? "Manager payment numbers saved." : payload.reason || "Payment number update failed.");
    if (Array.isArray(payload.numbers)) setManagerNumbers(payload.numbers);
  }

  async function saveReceiver(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const { session, user } = readStoredSession();
    const headers: HeadersInit = { "Content-Type": "application/json" };
    if (session.access_token) headers.authorization = "Bearer " + session.access_token;
    if (user.id) headers["x-user-id"] = user.id;
    const method = receiver.id ? "PATCH" : "POST";
    const response = await fetch("/api/payments/receiver", {
      method,
      headers,
      body: JSON.stringify(receiver),
    });
    const payload = await response.json().catch(() => ({}));
    setReviewMessage(payload.ok ? (receiver.id ? "Receiver details updated." : "Receiver details added.") : payload.reason || "Receiver details could not be saved.");
    if (payload.ok) {
      setReceiver({ receiverName:"", receiverPhone:"", receiverCard:"", network:"Mukuru", instructions:"", status:"available" });
      const refreshed = await fetch("/api/payments/receiver", { cache:"no-store" });
      const body = await refreshed.json().catch(() => ({}));
      if (Array.isArray(body.receivers)) setReceivers(body.receivers);
      if (body.receiver) setReceiver(body.receiver);
    }
  }

  async function deleteReceiver(id: string) {
    if (!window.confirm("Delete this payment receiver? Customers will no longer be able to select it.")) return;
    const response = await fetch("/api/payments/receiver", {
      method:"DELETE", headers:managerHeaders(), body:JSON.stringify({ id }),
    });
    const payload=await response.json().catch(()=>({}));
    setReviewMessage(payload.ok ? "Receiver deleted." : payload.reason || "Receiver deletion failed.");
    if(payload.ok) {
      setReceivers((items)=>items.filter((item)=>item.id!==id));
      if(receiver.id===id) setReceiver({receiverName:"",receiverPhone:"",receiverCard:"",network:"Mukuru",instructions:"",status:"available"});
    }
  }

  function editReceiver(item: ReceiverDetails) {
    setReceiver({...item});
    window.scrollTo({ top: 0, behavior: "smooth" });
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
    <div className="manager-shell">
      <aside className={`manager-shell-sidebar ${mobileMenuOpen ? "mobile-open" : ""}`}>
        <div className="manager-brand"><img src="/AQE-Nav&Icon.jpeg" alt="AQE" /><span>AQE ADMIN</span></div>
        {navGroups.map((group) => (
          <div key={group.title}>
            <div className="manager-section-label">{group.title}</div>
            <nav className="manager-nav">
              {group.items.map((item) => (
                <button
                  className={active === item ? "active" : ""}
                  type="button"
                  key={item}
                  onClick={() => { setActive(item); setMobileMenuOpen(false); }}
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

      <main className="manager-shell-main">
        <header className="manager-shell-top">
          <button type="button" className="manager-mobile-menu" onClick={() => setMobileMenuOpen((open) => !open)} aria-label={mobileMenuOpen ? "Close Manager menu" : "Open Manager menu"} aria-expanded={mobileMenuOpen}>
            {mobileMenuOpen ? "✕" : "☰"} <span>MENU</span>
          </button>
          <div>
            <strong>AQE Ecosystem Manager</strong>
            <span>Live ecosystem oversight & operational control</span>
          </div>
          <div className="manager-user">
            <div className="manager-avatar">
              {managerLabel.slice(0, 2).toUpperCase()}
            </div>
            <span>{managerLabel}</span>
            <button type="button" onClick={enableManagerNotifications} title="Enable urgent browser alerts">
              {browserAlertsEnabled ? "🔔" : "🔕"}
            </button>
            <button type="button" onClick={() => setMobileMenuOpen(false)}>⌄</button>
          </div>
        </header>

        <div className="manager-shell-content">
          <div className="manager-title">
            {active === "Dashboard" ? "Command Center" : active}
          </div>
          <p className="manager-subtitle">
            {active === "Dashboard"
              ? "Activity overview sourced from the AQE ecosystem state."
              : `${active} operational view`}
          </p>

          {urgentAlerts.length ? (
            <div className="manager-urgent-alert" role="alert">
              <strong>Urgent attention required</strong>
              {urgentAlerts.map((alert) => (
                <button key={alert.text} type="button" onClick={() => { setActive(alert.target); setMobileMenuOpen(false); }} title={`Open ${alert.target}`}>
                  {alert.text} <span>Open {alert.target} →</span>
                </button>
              ))}
            </div>
          ) : null}

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
                    {recentActivity.length ? recentActivity.map((item) => (
                      <div className="manager-activity-row" key={item.id || item.title}>
                        <span>{item.title}<small>{item.meta}</small></span>
                        <strong>{item.value}</strong>
                      </div>
                    )) : (
                      <div className="manager-review-message">No recent transactions or receipts yet.</div>
                    )}
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
                <div className="manager-rule-box">
                  <strong>Authoritative referral earnings</strong>
                  <p className="manager-subtitle">These tier rules are protected in the payment confirmation calculation: Basic direct 10%; Premium direct 10%; VIP direct 12% + indirect 12%. The manager UI must not silently change the percentages used by confirmed payments.</p>
                  <div className="manager-two-column">
                    {(["basic","premium","vip"] as const).map((tier) => (
                      <div key={tier} className="manager-rule-item">
                        <strong>{tier.toUpperCase()}</strong>
                        <span>Direct {settings.referralRatesByTier[tier].direct * 100}%</span>
                        <span>Indirect {settings.referralRatesByTier[tier].indirect * 100}%</span>
                      </div>
                    ))}
                  </div>
                </div>
                <h4>Home & Explore filter buttons</h4>
                <p className="manager-subtitle">Edit the labels/order shown on the customer Home and Explore pages. These labels do not grant access or alter financial calculations.</p>
                <label>
                  Home filters (one label per line)
                  <textarea rows={5}
                    value={Array.isArray(settings.customerContent.home.filters) ? (settings.customerContent.home.filters as string[]).join("\n") : ""}
                    onChange={(event) => setSettings({
                      ...settings,
                      customerContent: {
                        ...settings.customerContent,
                        home: { ...settings.customerContent.home, filters: event.target.value.split(/\n|,/).map((x)=>x.trim()).filter(Boolean).slice(0,20) }
                      }
                    })}
                  />
                </label>
                <label>
                  Explore filters (one label per line)
                  <textarea rows={5}
                    value={Array.isArray(settings.customerContent.explore.filters) ? (settings.customerContent.explore.filters as string[]).join("\n") : ""}
                    onChange={(event) => setSettings({
                      ...settings,
                      customerContent: {
                        ...settings.customerContent,
                        explore: { ...settings.customerContent.explore, filters: event.target.value.split(/\n|,/).map((x)=>x.trim()).filter(Boolean).slice(0,20) }
                      }
                    })}
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
                  <h3>Mukuru receivers</h3>
                  <span className="status-pill">Add · Edit · Delete</span>
                </div>
                <p className="manager-subtitle">Manager-controlled receiver accounts. Customers only see receivers marked Available. Adding a receiver does not change or complete a customer payment; payment remains pending until Manager confirmation.</p>
                <div className="manager-list-table">
                  {receivers.length ? receivers.map((item) => (
                    <div key={item.id} className="manager-row">
                      <div>
                        <strong>{item.receiverName} · {item.network || "Mukuru"}</strong>
                        <span>{item.receiverPhone} · {item.receiverCard} · {item.status || "available"}</span>
                        <small>{item.instructions}</small>
                      </div>
                      <div className="manager-row-actions">
                        <button type="button" onClick={() => editReceiver(item)}>Edit</button>
                        <button type="button" onClick={() => deleteReceiver(item.id || "")}>Delete</button>
                      </div>
                    </div>
                  )) : <div className="manager-review-message">No receiver records yet. Add the first receiver below.</div>}
                </div>
                <form className="manager-settings-form" onSubmit={saveReceiver}>
                  <h4>{receiver.id ? "Edit receiver" : "Add receiver"}</h4>
                  <label>Receiver name<input value={receiver.receiverName} onChange={(event)=>setReceiver({...receiver,receiverName:event.target.value})} required /></label>
                  <label>Receiver phone number<input value={receiver.receiverPhone} onChange={(event)=>setReceiver({...receiver,receiverPhone:event.target.value})} required /></label>
                  <label>Receiver card / account<input value={receiver.receiverCard} onChange={(event)=>setReceiver({...receiver,receiverCard:event.target.value})} required /></label>
                  <label>Network / channel<input value={receiver.network || "Mukuru"} onChange={(event)=>setReceiver({...receiver,network:event.target.value})} /></label>
                  <label>Status<select value={receiver.status || "available"} onChange={(event)=>setReceiver({...receiver,status:event.target.value as ReceiverDetails["status"]})}><option value="available">Available</option><option value="busy">Busy</option><option value="inactive">Inactive</option></select></label>
                  <label>Customer instructions<textarea value={receiver.instructions} onChange={(event)=>setReceiver({...receiver,instructions:event.target.value})} rows={3} /></label>
                  <div className="manager-row-actions">
                    <button type="submit" className="manager-action-button">{receiver.id ? "Update receiver" : "Add receiver"}</button>
                    {receiver.id ? <button type="button" onClick={()=>setReceiver({receiverName:"",receiverPhone:"",receiverCard:"",network:"Mukuru",instructions:"",status:"available"})}>Cancel edit</button> : null}
                  </div>
                </form>
              </section>
              <section className="manager-card manager-detail">
                <div className="manager-table-header">
                  <h3>Manager payment numbers</h3>
                  <span className="status-pill">Customer selectable</span>
                </div>
                <p className="manager-subtitle">
                  Only numbers marked Available are shown to customers. Switching a number to Busy immediately removes it from the customer selection list.
                </p>
                <div className="manager-list-table">
                  {managerNumbers.map((item) => (
                    <div key={item.id} className="manager-row">
                      <div>
                        <strong>{item.number}</strong>
                        <span>{item.name} · {item.network}</span>
                      </div>
                      <div className="manager-row-actions">
                        <em>{item.status}</em>
                        <button type="button" onClick={() => updateManagerNumber(item.id, { status: item.status === "available" ? "busy" : "available" })}>
                          Set {item.status === "available" ? "Busy" : "Available"}
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
                <button type="button" className="manager-action-button" onClick={saveManagerNumbers}>
                  Save payment-number statuses
                </button>
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
                        {row.id && !row.value.includes("LOCKED") && row.value.includes("ACTION REQUIRED") ? (
                          <>
                            <button type="button" onClick={() => reviewPayment(row.id!, "confirmed")}>
                              Confirm / Complete
                            </button>
                            <button type="button" onClick={() => reviewPayment(row.id!, "rejected")}>
                              Reject & Lock
                            </button>
                          </>
                        ) : row.id ? <span className="manager-locked-label">Locked</span> : null}
                      </div>
                    </div>
                  ))}
                </div>
              </section>
            </>
          ) : active === "Customer Support" ? (
            <>
              <section className="manager-card manager-detail">
                <div className="manager-table-header">
                  <h3>Manager Troubleshoot Requests</h3>
                  <span className="status-pill">5 QC per request</span>
                </div>
                <p className="manager-subtitle">Customers can request help changing account name, email or password before the seven-day window. Review the requested issue and update the account through the manager controls.</p>
                <div className="manager-list-table">
                  {troubleshootRequests.length ? troubleshootRequests.map((item) => (
                    <div key={item.id} className="manager-row">
                      <div>
                        <strong>{item.requested_change.replaceAll("_"," ")}</strong>
                        <span>{item.user_id} · {item.details}</span>
                      </div>
                      <div className="manager-row-actions">
                        <em>{item.status}</em>
                        {item.status === "OPEN" ? <button type="button" onClick={() => updateTroubleshoot(item.id, "IN_PROGRESS")}>Take request</button> : null}
                        {item.status === "IN_PROGRESS" ? <button type="button" onClick={() => updateTroubleshoot(item.id, "RESOLVED")}>Mark resolved</button> : null}
                      </div>
                    </div>
                  )) : <div className="manager-review-message">No manager troubleshoot requests.</div>}
                </div>
              </section>
              <section className="manager-card manager-detail">
                <div className="manager-table-header"><h3>Manager identity update</h3><span className="status-pill">Authorized manager only</span></div>
                <p className="manager-subtitle">Use the request's user ID to update the customer's account name, email or password on their behalf.</p>
                <form className="manager-settings-form" onSubmit={managerIdentityUpdate}>
                  <label>User ID<input name="userId" placeholder="Customer user ID" required /></label>
                  <label>Field<select name="field" defaultValue="displayName"><option value="displayName">Account name</option><option value="phone">Phone number</option><option value="email">Email</option><option value="password">Password</option></select></label>
                  <label>New value<input name="value" type="text" placeholder="New value" required /></label>
                  <button type="submit" className="manager-action-button">Update account</button>
                </form>
              </section>
              <section className="manager-card manager-detail">
                <div className="manager-table-header"><h3>Customer Support</h3></div>
                <div className="manager-list-table">
                  {(liveRows["Customer Support"] || tableSeeds["Customer Support"] || []).map((row: ManagerRow) => (
                    <div key={"support-" + (row.id || row.title)} className="manager-row">
                      <div><strong>{row.title}</strong><span>{row.meta}</span></div><div className="manager-row-actions"><em>{row.value}</em></div>
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

              <div className="manager-control-bar">
                <span className="manager-live-status"><span className="manager-live-dot" /> LIVE · auto-sync every 3s</span>
                <div className="manager-control-actions">
                  <button type="button" onClick={() => window.location.reload()}>Hard refresh</button>
                  <button type="button" onClick={managerCreate}>Create new</button>
                  <button type="button" onClick={managerClear}>Clear all</button>
                </div>
              </div>
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
                      {active === "Users & Profiles" && row.id ? (
                        <>
                          <button type="button" onClick={() => managerEdit(row)}>Update</button>
                          <button type="button" onClick={() => managerBlock(row)}>{/blocked/i.test(row.value) ? "Unblock" : "Block"}</button>
                          <button
                            type="button"
                            className="manager-danger-button"
                            onClick={() => deleteCustomer(row.id!, row.title)}
                          >
                            Delete account
                          </button>
                        </>
                      ) : null}
                      {active !== "Users & Profiles" && row.id && !["Payments & Approvals","Withdrawals"].includes(active) ? (
                        <>
                          <button type="button" onClick={() => managerEdit(row)}>Update</button>
                          <button type="button" onClick={() => managerDelete(row)}>Delete</button>
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
