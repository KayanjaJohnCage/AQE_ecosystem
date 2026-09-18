"use client";

import { FormEvent, useEffect, useState } from "react";
import { persistStoredSession, readStoredSession } from "../../lib/clientSession";

type CustomerView = "home" | "discover" | "messages" | "bookings" | "me";

type ProfileCard = {
  id?: string;
  userId?: string;
  name: string;
  city: string;
  tag: string;
  status: string;
  tier?: string;
  bio?: string;
};

type MessageRow = {
  user: string;
  preview: string;
  time: string;
};

type BookingRow = {
  title: string;
  date: string;
  amount: string;
  status?: string;
};

type ProductRow = {
  id: string;
  title: string;
  price: number;
  currency: string;
  inventory: number;
};

const profileCards: ProfileCard[] = [
  {
    name: "Nia A.",
    city: "Kampala",
    tag: "Creative Director",
    status: "Open to collab",
  },
  {
    name: "Ayo D.",
    city: "Nairobi",
    tag: "Event Host",
    status: "Available this week",
  },
  {
    name: "Tariq M.",
    city: "Kigali",
    tag: "Wellness Coach",
    status: "Premium member",
  },
];

const messageRows = [
  { user: "Amina", preview: "Your profile is trending this week", time: "2m" },
  { user: "Derrick", preview: "Booked a QC session for Friday", time: "14m" },
  { user: "Sanyu", preview: "Shared a new media drop", time: "1h" },
];

const bookingRows = [
  { title: "Creative strategy call", date: "Thu, 10:00", amount: "UGX 120K" },
  { title: "Brand photo session", date: "Sat, 13:30", amount: "UGX 220K" },
  { title: "Private community room", date: "Sun, 18:00", amount: "UGX 85K" },
];

const productRows: ProductRow[] = [
  { id: "demo-1", title: "Premium spotlight bundle", price: 45, currency: "USD", inventory: 8 },
  { id: "demo-2", title: "Community event ticket", price: 30, currency: "USD", inventory: 24 },
];

export default function CustomerPage() {
  const [data, setData] = useState({
    qcBalance: 0,
    tier: "basic",
    bookings: 0,
    earnings: 0,
  });
  const [authOpen, setAuthOpen] = useState(false);
  const [authMode, setAuthMode] = useState<"login" | "register">("login");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [message, setMessage] = useState("");
  const [view, setView] = useState<CustomerView>("home");
  const [accountName, setAccountName] = useState("Guest account");
  const [accountSubtitle, setAccountSubtitle] = useState(
    "Sign in to manage your profile",
  );
  const [authenticated, setAuthenticated] = useState(false);
  const [selectedProfile, setSelectedProfile] = useState<ProfileCard | null>(
    null,
  );
  const [profiles, setProfiles] = useState<ProfileCard[]>(profileCards);
  const [profileActionMessage, setProfileActionMessage] = useState("");
  const [messages, setMessages] = useState<MessageRow[]>(messageRows);
  const [bookings, setBookings] = useState<BookingRow[]>(bookingRows);
  const [products, setProducts] = useState<ProductRow[]>(productRows);
  const [profileQuery, setProfileQuery] = useState("");
  const [isBooting, setIsBooting] = useState(true);
  const [ageConfirmed, setAgeConfirmed] = useState(false);

  useEffect(() => {
    const timer = window.setTimeout(() => setIsBooting(false), 650);
    setAgeConfirmed(localStorage.getItem("aqe-age-confirmed") === "true");
    return () => window.clearTimeout(timer);
  }, []);

  useEffect(() => {
    const { session, user } = readStoredSession();
    const headers: HeadersInit = {};
    if (session.access_token) headers.authorization = `Bearer ${session.access_token}`;
    if (user.id) headers["x-user-id"] = user.id;
    setAuthenticated(Boolean(session.access_token || user.id));

    if (user.email) {
      setAccountName(
        user.display_name || user.displayName || user.email.split("@")[0],
      );
      setAccountSubtitle(user.email);
    }

    fetch("/api/dashboard", { headers })
      .then(async (response) => {
        if (response.ok) {
          const payload = await response.json();
          if (payload.customer) setData(payload.customer);
        }
      })
      .catch(() => undefined);

    fetch("/api/profiles")
      .then(async (response) => {
        if (!response.ok) return;
        const payload = await response.json();
        if (Array.isArray(payload.profiles) && payload.profiles.length > 0) {
          setProfiles(payload.profiles);
        }
      })
      .catch(() => undefined);

    if (session.access_token || user.id) {
      fetch("/api/messages", { headers })
        .then(async (response) => {
          if (!response.ok) return;
          const payload = await response.json();
          if (Array.isArray(payload.messages) && payload.messages.length > 0) {
            setMessages(
              payload.messages.map((item: { userId?: string; preview?: string; time?: string }) => ({
                user: item.userId || "AQE member",
                preview: item.preview || "New message",
                time: item.time || "Now",
              })),
            );
          }
        })
        .catch(() => undefined);

      fetch("/api/bookings", { headers })
        .then(async (response) => {
          if (!response.ok) return;
          const payload = await response.json();
          if (Array.isArray(payload.bookings) && payload.bookings.length > 0) {
            setBookings(payload.bookings);
          }
        })
        .catch(() => undefined);
    }

    fetch("/api/marketplace/products")
      .then(async (response) => {
        if (!response.ok) return;
        const payload = await response.json();
        if (Array.isArray(payload.products) && payload.products.length > 0) {
          setProducts(payload.products);
        }
      })
      .catch(() => undefined);
  }, []);

  async function submitAuth(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const endpoint = authMode === "login" ? "/api/auth/login" : "/api/auth/register";
    const body =
      authMode === "login"
        ? { email, password }
        : { email, password, displayName };

    const response = await fetch(endpoint, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    const payload = await response.json();
    setMessage(payload.ok ? "Request completed." : payload.reason || "Request failed.");

    persistStoredSession({
      session: payload.session,
      user: payload.user,
    });

    if (payload.user) {
      const nextUser = {
        ...(payload.user as Record<string, unknown>),
        display_name:
          (payload.user as { display_name?: string; displayName?: string; name?: string; email?: string }).display_name ||
          (payload.user as { display_name?: string; displayName?: string; name?: string; email?: string }).displayName ||
          (payload.user as { display_name?: string; displayName?: string; name?: string; email?: string }).name ||
          (payload.user as { display_name?: string; displayName?: string; name?: string; email?: string }).email?.split("@")[0] ||
          displayName ||
          "AQE Member",
      };
      setAccountName(String(nextUser.display_name));
      setAccountSubtitle(
        String(
          (payload.user as { email?: string }).email || "member@aqe.test",
        ),
      );
      setAuthenticated(true);
    }

    if (payload.ok) setAuthOpen(false);
  }

  async function signOut() {
    await fetch("/api/auth/logout", { method: "POST" }).catch(() => undefined);
    localStorage.removeItem("aqe-session");
    localStorage.removeItem("aqe-user");
    setAuthenticated(false);
    setAccountName("Guest account");
    setAccountSubtitle("Sign in to manage your profile");
    setData({ qcBalance: 0, tier: "basic", bookings: 0, earnings: 0 });
  }

  function confirmAge() {
    localStorage.setItem("aqe-age-confirmed", "true");
    setAgeConfirmed(true);
  }

  async function runProfileAction(action: "message" | "booking") {
    if (!selectedProfile?.userId) {
      setProfileActionMessage("This demo profile is not connected to a live account yet.");
      return;
    }

    const { session, user } = readStoredSession();
    const headers: HeadersInit = { "Content-Type": "application/json" };
    if (session.access_token) headers.authorization = `Bearer ${session.access_token}`;
    if (user.id) headers["x-user-id"] = user.id;

    const endpoint = action === "message" ? "/api/messages" : "/api/bookings";
    const body =
      action === "message"
        ? {
            recipientId: selectedProfile.userId,
            body: `Hi ${selectedProfile.name}, I found your profile on AQE.`,
          }
        : {
            providerId: selectedProfile.userId,
            service: `Intro with ${selectedProfile.name}`,
            amount: 0,
            currency: "UGX",
          };

    const response = await fetch(endpoint, {
      method: "POST",
      headers,
      body: JSON.stringify(body),
    });
    const payload = await response.json().catch(() => ({}));
    setProfileActionMessage(
      payload.ok
        ? action === "message"
          ? "Message sent."
          : "Booking request created."
        : payload.reason || "Action could not be completed.",
    );
  }

  const navItems = [
    { label: "Home", icon: "⌂" },
    { label: "Discover", icon: "⌕" },
    { label: "Messages", icon: "✉" },
    { label: "Activity", icon: "◫" },
    { label: "Me", icon: "◉" },
  ] as const;
  const visibleProfiles = profiles.filter((profile) => {
    const query = profileQuery.trim().toLowerCase();
    if (!query) return true;
    return `${profile.name} ${profile.city} ${profile.tag}`
      .toLowerCase()
      .includes(query);
  });

  if (isBooting) {
    return (
      <main className="aqe-entry-state splash-state">
        <div className="splash-mark">AQE</div>
        <p>AfriQueerEcosystem</p>
      </main>
    );
  }

  if (!ageConfirmed) {
    return (
      <main className="aqe-entry-state age-gate-state">
        <div className="age-gate-card">
          <div className="auth-brand">AQE</div>
          <span className="eyebrow">WELCOME TO YOUR ECOSYSTEM</span>
          <h1>A space for adults, community, and connection.</h1>
          <p>
            You must be 18 or older to enter. Please confirm your age to continue.
          </p>
          <button className="primary-button" type="button" onClick={confirmAge}>
            I am 18 or older <span>→</span>
          </button>
          <a className="age-exit-link" href="https://www.google.com">
            Leave this page
          </a>
        </div>
      </main>
    );
  }

  return (
    <main className="aqe-client" id="app">
      <header className="client-header">
        <div>
          <div className="client-mark">AQE</div>
          <div className="client-subtitle">AfriQueerEcosystem</div>
        </div>
        <div className="header-actions">
          <span className="currency-badge">UGX</span>
          <button className="icon-button" type="button" onClick={() => setAuthOpen(true)} aria-label="Open account">
            ◉
          </button>
        </div>
      </header>

      <section className="client-content">
        <div className="client-hero">
          <div className="hero-kicker">WELCOME TO YOUR ECOSYSTEM</div>
          <h1>
            Find your people.
            <br />
            <em>Build your world.</em>
          </h1>
          <p>Explore profiles, connect with community, and unlock your next chapter.</p>
          <button className="primary-button" type="button" onClick={() => setAuthOpen(true)}>
            Explore the ecosystem <span>→</span>
          </button>
        </div>

        <section className="section-block">
          <div className="section-heading">
            <div>
              <span className="eyebrow">YOUR DASHBOARD</span>
              <h2>My account</h2>
            </div>
            <button
              className="text-button"
              type="button"
              onClick={() => (authenticated ? signOut() : setAuthOpen(true))}
            >
              {authenticated ? "Sign out" : "Sign in"}
            </button>
          </div>

          <div className="account-row">
            <div className="account-avatar">{accountName.charAt(0).toUpperCase()}</div>
            <div>
              <strong>{accountName}</strong>
              <span>{accountSubtitle}</span>
            </div>
          </div>

          <div className="metric-grid">
            <div className="metric-card">
              <span>WALLET</span>
              <strong>{data.qcBalance} QC</strong>
            </div>
            <div className="metric-card">
              <span>TIER</span>
              <strong>{data.tier}</strong>
            </div>
            <div className="metric-card">
              <span>BOOKINGS</span>
              <strong>{data.bookings}</strong>
            </div>
            <div className="metric-card">
              <span>EARNINGS</span>
              <strong>UGX {data.earnings}</strong>
            </div>
          </div>
        </section>

        <section className="section-block">
          <div className="section-heading">
            <div>
              <span className="eyebrow">DISCOVER</span>
              <h2>Explore AQE</h2>
            </div>
            <button className="text-button" type="button" onClick={() => setView("discover")}>
              View all
            </button>
          </div>

          {view === "home" && (
            <div className="explore-grid">
              {[
                "Directory",
                "Bookings",
                "Messages",
                "Rewards",
                "Marketplace",
                "VIP room",
              ].map((item, index) => (
                <button
                  className="explore-tile"
                  type="button"
                  key={item}
                  onClick={() => {
                    const routeMap: Record<number, CustomerView> = {
                      0: "discover",
                      1: "bookings",
                      2: "messages",
                      3: "home",
                      4: "home",
                      5: "home",
                    };
                    setView(routeMap[index] ?? "home");
                  }}
                >
                  <span>{["⌕", "◫", "✉", "★", "▤", "♢"][index]}</span>
                  <strong>{item}</strong>
                </button>
              ))}
            </div>
          )}

          {view === "discover" && (
            <div className="stacked-panel-list">
              <input
                className="directory-search"
                value={profileQuery}
                onChange={(event) => setProfileQuery(event.target.value)}
                placeholder="Search people, places, or roles"
                aria-label="Search profiles"
              />
              {visibleProfiles.map((profile) => (
                <article
                  key={profile.name}
                  className="content-panel content-panel-button"
                  onClick={() => setSelectedProfile(profile)}
                  onKeyDown={(event) => {
                    if (event.key === "Enter" || event.key === " ") {
                      event.preventDefault();
                      setSelectedProfile(profile);
                    }
                  }}
                  role="button"
                  tabIndex={0}
                >
                  <div className="mini-avatar">{profile.name.charAt(0)}</div>
                  <div className="panel-copy">
                    <strong>{profile.name}</strong>
                    <span>{profile.tag}</span>
                    <small>{profile.city}</small>
                  </div>
                  <div className="status-pill">{profile.status}</div>
                </article>
              ))}
              {visibleProfiles.length === 0 ? (
                <div className="empty-panel">No profiles match that search.</div>
              ) : null}
            </div>
          )}

          {view === "messages" && (
            <div className="stacked-panel-list">
              {messages.map((messageItem) => (
                <article key={messageItem.user} className="content-panel compact">
                  <div className="mini-avatar alt">{messageItem.user.charAt(0)}</div>
                  <div className="panel-copy">
                    <strong>{messageItem.user}</strong>
                    <span>{messageItem.preview}</span>
                  </div>
                  <small>{messageItem.time}</small>
                </article>
              ))}
            </div>
          )}

          {view === "bookings" && (
            <div className="stacked-panel-list">
              {bookings.map((booking) => (
                <article key={booking.title} className="content-panel compact">
                  <div className="mini-avatar gold">{booking.title.charAt(0)}</div>
                  <div className="panel-copy">
                    <strong>{booking.title}</strong>
                    <span>{booking.date}</span>
                  </div>
                  <small>{booking.amount}</small>
                </article>
              ))}
            </div>
          )}

          {view === "me" && (
            <div className="stacked-panel-list">
              <article className="content-panel">
                <div className="mini-avatar">{accountName.charAt(0).toUpperCase()}</div>
                <div className="panel-copy">
                  <strong>{accountName}</strong>
                  <span>{accountSubtitle}</span>
                </div>
                <div className="status-pill">{data.tier}</div>
              </article>

              <article className="content-panel compact">
                <div className="mini-avatar gold">Q</div>
                <div className="panel-copy">
                  <strong>Wallet</strong>
                  <span>{data.qcBalance} QC balance</span>
                </div>
                <small>UGX {data.earnings}</small>
              </article>

              <article className="content-panel compact">
                <div className="mini-avatar alt">V</div>
                <div className="panel-copy">
                  <strong>VIP access</strong>
                  <span>Upgrades and private rooms</span>
                </div>
                <small>{data.tier}</small>
              </article>
            </div>
          )}

          {view === "home" && (
            <div className="marketplace-preview">
              <div className="section-heading compact-heading">
                <div>
                  <span className="eyebrow">MARKETPLACE</span>
                  <h2>Featured drops</h2>
                </div>
                <span className="marketplace-count">{products.length} live</span>
              </div>
              <div className="marketplace-grid">
                {products.map((product) => (
                  <article className="marketplace-item" key={product.id}>
                    <div className="marketplace-icon">✦</div>
                    <strong>{product.title}</strong>
                    <span>{product.currency} {product.price}</span>
                    <small>{product.inventory} available</small>
                  </article>
                ))}
              </div>
            </div>
          )}
        </section>

        <section className="section-block callout">
          <span className="callout-icon">✦</span>
          <div>
            <span className="eyebrow">VIP ECOSYSTEM</span>
            <h2>Unlock more of AQE</h2>
            <p>Premium tools, private rooms, and deeper connections.</p>
          </div>
          <button type="button" aria-label="Open VIP">→</button>
        </section>
      </section>

      <nav className="client-bottom-nav" aria-label="Primary navigation">
        {navItems.map((item, index) => {
          const nextView: Record<number, CustomerView> = {
            0: "home",
            1: "discover",
            2: "messages",
            3: "bookings",
            4: "me",
          };

          return (
            <button
              className={view === nextView[index] ? "active" : ""}
              type="button"
              key={item.label}
              onClick={() => {
                setView(nextView[index] ?? "home");
              }}
            >
              <span>{item.icon}</span>
              {item.label}
            </button>
          );
        })}
      </nav>

      {selectedProfile ? (
        <div className="profile-overlay" role="dialog" aria-modal="true">
          <div className="profile-sheet">
            <button
              type="button"
              className="close-button"
              aria-label="Close profile"
              onClick={() => setSelectedProfile(null)}
              style={{ position: "absolute", top: 14, right: 14 }}
            >
              ×
            </button>
            <div className="profile-header">
              <div className="mini-avatar large">{selectedProfile.name.charAt(0)}</div>
              <div>
                <div className="eyebrow">PROFILE</div>
                <h2>{selectedProfile.name}</h2>
                <p>{selectedProfile.tag}</p>
              </div>
            </div>

            <div className="profile-chip-row">
              <span className="status-pill">{selectedProfile.status}</span>
              <span className="location-pill">{selectedProfile.city}</span>
            </div>

            <div className="profile-metrics">
              <div>
                <span>Availability</span>
                <strong>Open</strong>
              </div>
              <div>
                <span>Response</span>
                <strong>2h</strong>
              </div>
              <div>
                <span>Tier</span>
                <strong>{selectedProfile.tier || "basic"}</strong>
              </div>
            </div>

            <p className="profile-description">
              {selectedProfile.bio ||
                "Open to meaningful connections and collaborations across East Africa."}
            </p>

            <div className="profile-actions">
              <button
                className="primary-button"
                type="button"
                onClick={() => runProfileAction("message")}
              >
                Message <span>→</span>
              </button>
              <button
                className="secondary-button"
                type="button"
                onClick={() => runProfileAction("booking")}
              >
                Book intro
              </button>
            </div>
            {profileActionMessage ? (
              <span className="auth-message">{profileActionMessage}</span>
            ) : null}
          </div>
        </div>
      ) : null}

      {authOpen ? (
        <div className="auth-overlay" role="dialog" aria-modal="true">
          <div className="auth-sheet">
            <button
              type="button"
              className="close-button"
              aria-label="Close"
              onClick={() => setAuthOpen(false)}
              style={{ position: "absolute", top: 14, right: 14 }}
            >
              ×
            </button>
            <div className="auth-brand">AQE</div>
            <div className="auth-tabs">
              <button type="button" className={authMode === "login" ? "active" : ""} onClick={() => setAuthMode("login")}>
                Login
              </button>
              <button type="button" className={authMode === "register" ? "active" : ""} onClick={() => setAuthMode("register")}>
                Register
              </button>
            </div>
            <h2>{authMode === "login" ? "Welcome back" : "Create account"}</h2>
            <p>
              {authMode === "login"
                ? "Sign in to continue your journey."
                : "Join the ecosystem and start building your presence."}
            </p>
            <form onSubmit={submitAuth}>
              {authMode === "register" ? (
                <input
                  className="auth-input"
                  value={displayName}
                  onChange={(event) => setDisplayName(event.target.value)}
                  placeholder="Display name"
                />
              ) : null}
              <input
                className="auth-input"
                type="email"
                value={email}
                onChange={(event) => setEmail(event.target.value)}
                placeholder="Email"
              />
              <input
                className="auth-input"
                type="password"
                value={password}
                onChange={(event) => setPassword(event.target.value)}
                placeholder="Password"
              />
              <button className="primary-button" type="submit">
                {authMode === "login" ? "Sign in" : "Create account"}
                <span>→</span>
              </button>
            </form>
            {message ? <span className="auth-message">{message}</span> : null}
          </div>
        </div>
      ) : null}
    </main>
  );
}
