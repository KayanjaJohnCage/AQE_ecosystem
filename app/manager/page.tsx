"use client";

import { useEffect, useState } from "react";

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

  useEffect(() => {
    const session = JSON.parse(localStorage.getItem("aqe-session") ?? "{}");
    const user = JSON.parse(localStorage.getItem("aqe-user") ?? "{}");
    const headers: HeadersInit = {};
    if (session.access_token)
      headers.authorization = `Bearer ${session.access_token}`;
    if (user.id) headers["x-user-id"] = user.id;
    fetch("/api/dashboard", { headers })
      .then(async (response) => {
        if (response.ok) {
          const payload = await response.json();
          if (payload.manager) setData(payload.manager);
        }
      })
      .catch(() => undefined);
  }, []);

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
            <div className="manager-avatar">AD</div>
            <span>Administrator</span>
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
                  <div className="manager-empty">
                    Live activity appears here as database events are recorded.
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
          ) : (
            <section className="manager-card manager-detail">
              <h3>{active}</h3>
              <p>
                This view is connected to the AQE operational shell. Its records
                will appear as the corresponding Supabase tables receive data.
              </p>
              <div className="manager-metrics">
                <Metric label="BOOKINGS" value={data.bookings} />
                <Metric label="MESSAGES" value={data.messages} />
                <Metric label="PRODUCTS" value={data.products} />
                <Metric label="SUPPORT" value={data.support} />
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
