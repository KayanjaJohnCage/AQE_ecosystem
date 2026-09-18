"use client";

import { useEffect, useState } from "react";
import { readStoredSession } from "../../lib/clientSession";

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

const navGroups = [
  {
    title: "Operations",
    items: [
      "Dashboard",
      "Users & Profiles",
      "Profile Media",
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
    { title: "Community room access", meta: "Kigali", value: "Awaiting approval" },
  ],
  "Messages & DM": [
    { title: "Support check-in", meta: "2 new replies", value: "Unresolved" },
    { title: "Collab thread", meta: "Moderator reviewed", value: "Active" },
    { title: "VIP concierge", meta: "Priority queue", value: "Responding" },
  ],
  "Marketplace & Stores": [
    { title: "Premium spotlight bundle", meta: "Vendor: Atelier", value: "Live" },
    { title: "Travel pass", meta: "Vendor: NEO", value: "50 sold" },
    { title: "Community event ticket", meta: "Vendor: AQE", value: "Needs restock" },
  ],
  "Customer Support": [
    { title: "Payment dispute", meta: "High priority", value: "Open" },
    { title: "Verification appeal", meta: "Escalated", value: "In review" },
    { title: "Account issue", meta: "Low priority", value: "Resolved" },
  ],
  "Withdrawals": [
    { title: "VIP payout batch", meta: "UGX 3.1M", value: "Queued" },
    { title: "Creator payout", meta: "UGX 820K", value: "Approved" },
    { title: "Commission transfer", meta: "UGX 480K", value: "Processing" },
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

  useEffect(() => {
    const { session, user } = readStoredSession();
    const headers: HeadersInit = {};
    if (session.access_token) headers.authorization = `Bearer ${session.access_token}`;
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
    ])
      .then(async ([bookingsResponse, messagesResponse, productsResponse, supportResponse, withdrawalsResponse, paymentsResponse]) => {
        const [bookings, messages, products, support, withdrawals, payments] = await Promise.all([
          bookingsResponse.ok ? bookingsResponse.json() : Promise.resolve({}),
          messagesResponse.ok ? messagesResponse.json() : Promise.resolve({}),
          productsResponse.ok ? productsResponse.json() : Promise.resolve({}),
          supportResponse.ok ? supportResponse.json() : Promise.resolve({}),
          withdrawalsResponse.ok ? withdrawalsResponse.json() : Promise.resolve({}),
          paymentsResponse.ok ? paymentsResponse.json() : Promise.resolve({}),
        ]);

        const nextRows: Record<string, ManagerRow[]> = {};
        if (Array.isArray(bookings.bookings) && bookings.bookings.length > 0) {
          nextRows["Bookings & Requests"] = bookings.bookings.map(
            (booking: { title?: string; date?: string; amount?: string; status?: string }) => ({
              id: (booking as { id?: string }).id,
              title: booking.title || "Booking request",
              meta: booking.date || "Date pending",
              value: booking.status || booking.amount || "Pending",
            }),
          );
        }
        if (Array.isArray(messages.messages) && messages.messages.length > 0) {
          nextRows["Messages & DM"] = messages.messages.map(
            (message: { userId?: string; preview?: string; time?: string; read?: boolean }) => ({
              title: message.userId || "Community member",
              meta: message.preview || "No message preview",
              value: message.read ? "Read" : "Unread",
            }),
          );
        }
        if (Array.isArray(products.products) && products.products.length > 0) {
          nextRows["Marketplace & Stores"] = products.products.map(
            (product: { title?: string; seller_id?: string; price?: number; currency?: string; inventory?: number }) => ({
              title: product.title || "Marketplace product",
              meta: `Seller: ${product.seller_id || "AQE"}`,
              value: `${product.currency || "USD"} ${product.price ?? 0} • ${product.inventory ?? 0} left`,
            }),
          );
        }
        if (Array.isArray(support.tickets) && support.tickets.length > 0) {
          nextRows["Customer Support"] = support.tickets.map(
            (ticket: { id?: string; subject?: string; category?: string; priority?: string; status?: string }) => ({
              id: ticket.id,
              title: ticket.subject || "Support ticket",
              meta: `${ticket.category || "OTHER"} • ${ticket.priority || "MEDIUM"}`,
              value: ticket.status || "OPEN",
            }),
          );
        }
        if (Array.isArray(withdrawals.withdrawals) && withdrawals.withdrawals.length > 0) {
          nextRows["Withdrawals"] = withdrawals.withdrawals.map(
            (withdrawal: { id?: string; user_id?: string; amount?: number; status?: string }) => ({
              id: withdrawal.id,
              title: `VIP payout ${withdrawal.user_id || "member"}`,
              meta: `UGX ${withdrawal.amount ?? 0}`,
              value: withdrawal.status || "PENDING",
            }),
          );
        }
        if (Array.isArray(payments.payments) && payments.payments.length > 0) {
          nextRows["Payments & Approvals"] = payments.payments.map(
            (payment: { id?: string; user_id?: string; amount?: number; currency?: string; reference?: string; metadata?: { requestedTier?: string }; status?: string }) => ({
              id: payment.id,
              title: `${payment.currency || "UGX"} ${payment.amount ?? 0} • ${payment.user_id || "member"}`,
              meta: `${payment.reference || "No reference"} • Upgrade: ${(payment.metadata?.requestedTier || "premium").toUpperCase()}`,
              value: payment.status || "pending",
            }),
          );
        }
        setLiveRows(nextRows);
      })
      .catch(() => undefined);

    fetch("/api/payments/receiver")
      .then(async (response) => {
        if (!response.ok) return;
        const payload = await response.json();
        if (payload.receiver) setReceiver(payload.receiver);
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
        : tableSeeds[active] ?? [
            { title: "Operational queue", meta: "Awaiting sync", value: "Ready" },
          ];
  const paymentRows: ManagerRow[] = liveRows["Payments & Approvals"] ?? [];

  async function reviewBooking(bookingId: string, status: "accepted" | "rejected") {
    const { session, user } = readStoredSession();
    const headers: HeadersInit = { "Content-Type": "application/json" };
    if (session.access_token) headers.authorization = `Bearer ${session.access_token}`;
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

  async function reviewWithdrawal(requestId: string, status: "APPROVED" | "REJECTED") {
    const { session, user } = readStoredSession();
    const headers: HeadersInit = { "Content-Type": "application/json" };
    if (session.access_token) headers.authorization = `Bearer ${session.access_token}`;
    if (user.id) headers["x-user-id"] = user.id;
    const response = await fetch("/api/vip/withdrawals", {
      method: "PATCH",
      headers,
      body: JSON.stringify({ requestId, status }),
    });
    const payload = await response.json().catch(() => ({}));
    setReviewMessage(payload.ok ? `Withdrawal ${status.toLowerCase()}.` : payload.reason || "Withdrawal review failed.");
  }

  async function reviewPayment(orderId: string, status: "confirmed" | "rejected") {
    const { session, user } = readStoredSession();
    const headers: HeadersInit = { "Content-Type": "application/json" };
    if (session.access_token) headers.authorization = `Bearer ${session.access_token}`;
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
          ? `Payment confirmed. User upgraded to ${(payload.upgradedTier || "paid").toUpperCase()}.`
          : "Payment rejected."
        : payload.reason || "Payment review failed.",
    );
  }

  async function saveReceiver(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const { session, user } = readStoredSession();
    const headers: HeadersInit = { "Content-Type": "application/json" };
    if (session.access_token) headers.authorization = `Bearer ${session.access_token}`;
    if (user.id) headers["x-user-id"] = user.id;
    const response = await fetch("/api/payments/receiver", {
      method: "PATCH",
      headers,
      body: JSON.stringify(receiver),
    });
    const payload = await response.json().catch(() => ({}));
    setReviewMessage(payload.ok ? "Mukuru receiver details saved." : payload.reason || "Receiver details could not be saved.");
    if (payload.receiver) setReceiver(payload.receiver);
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
                  <span className="manager-nav-icon">{["▣", "♙", "▧", "✓", "◆", "◫", "✉", "▤", "♢"].at(group.items.indexOf(item) % 9)}</span>
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
            <div className="manager-avatar">{managerLabel.slice(0, 2).toUpperCase()}</div>
            <span>{managerLabel}</span>
            <button type="button">⌄</button>
          </div>
        </header>

        <div className="manager-prototype-content">
          <div className="manager-title">{active === "Dashboard" ? "Command Center" : active}</div>
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
          ) : active === "Payments & Approvals" ? (
            <>
              <section className="manager-card manager-detail">
                <div className="manager-table-header">
                  <h3>Mukuru receiver details</h3>
                  <span className="status-pill">Manager controlled</span>
                </div>
                <p className="manager-subtitle">Customers see these details and use them on Mukuru to send payment. They never edit the receiver account.</p>
                <form className="manager-settings-form" onSubmit={saveReceiver}>
                  <label>Receiver name<input value={receiver.receiverName} onChange={(event) => setReceiver({ ...receiver, receiverName: event.target.value })} required /></label>
                  <label>Receiver phone number<input value={receiver.receiverPhone} onChange={(event) => setReceiver({ ...receiver, receiverPhone: event.target.value })} required /></label>
                  <label>Receiver card / account<input value={receiver.receiverCard} onChange={(event) => setReceiver({ ...receiver, receiverCard: event.target.value })} required /></label>
                  <label>Customer instructions<textarea value={receiver.instructions} onChange={(event) => setReceiver({ ...receiver, instructions: event.target.value })} rows={3} /></label>
                  <button type="submit" className="manager-action-button">Save receiver details</button>
                </form>
              </section>
              <section className="manager-card manager-detail">
                <div className="manager-table-header"><h3>Payment approvals</h3></div>
                {reviewMessage ? <div className="manager-review-message">{reviewMessage}</div> : null}
                <div className="manager-list-table">
                  {paymentRows.map((row: ManagerRow) => (
                    <div key={`${active}-${row.id || row.title}`} className="manager-row">
                      <div><strong>{row.title}</strong><span>{row.meta}</span></div>
                      <div className="manager-row-actions"><em>{row.value}</em>{row.id ? <><button type="button" onClick={() => reviewPayment(row.id!, "confirmed")}>Confirm & upgrade</button><button type="button" onClick={() => reviewPayment(row.id!, "rejected")}>Reject</button></> : null}</div>
                    </div>
                  ))}
                </div>
              </section>
            </>
          ) : (
            <section className="manager-card manager-detail">
              <div className="manager-table-header">
                <h3>{active}</h3>
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
                  onClick={() => setReviewMessage(`${active} review queue opened.`)}
                >
                  Review
                </button>
              </div>
              {reviewMessage ? <div className="manager-review-message">{reviewMessage}</div> : null}

              <div className="manager-metrics condensed">
                <Metric label="BOOKINGS" value={data.bookings} />
                <Metric label="MESSAGES" value={data.messages} />
                <Metric label="PRODUCTS" value={data.products} />
                <Metric label="SUPPORT" value={data.support} />
              </div>

              <div className="manager-list-table">
                {rows.map((row: ManagerRow) => (
                  <div key={`${active}-${row.title}`} className="manager-row">
                    <div>
                      <strong>{row.title}</strong>
                      <span>{row.meta}</span>
                    </div>
                    <div className="manager-row-actions">
                      <em>{row.value}</em>
                      {active === "Bookings & Requests" && row.id && /pending/i.test(row.value) ? (
                        <>
                          <button type="button" onClick={() => reviewBooking(row.id!, "accepted")}>Approve</button>
                          <button type="button" onClick={() => reviewBooking(row.id!, "rejected")}>Reject</button>
                        </>
                      ) : null}
                      {active === "Withdrawals" && row.id && /pending/i.test(row.value) ? (
                        <>
                          <button type="button" onClick={() => reviewWithdrawal(row.id!, "APPROVED")}>Approve</button>
                          <button type="button" onClick={() => reviewWithdrawal(row.id!, "REJECTED")}>Reject</button>
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
