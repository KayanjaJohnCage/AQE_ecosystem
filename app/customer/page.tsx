"use client";

import { FormEvent, useEffect, useState } from "react";
import {
  persistStoredSession,
  readStoredSession,
} from "../../lib/clientSession";

type CustomerView =
  | "home"
  | "discover"
  | "messages"
  | "bookings"
  | "me"
  | "wallet"
  | "premium"
  | "vip"
  | "rewards"
  | "referrals"
  | "raffle"
  | "settings";

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
  {
    id: "demo-1",
    title: "Premium spotlight bundle",
    price: 45,
    currency: "USD",
    inventory: 8,
  },
  {
    id: "demo-2",
    title: "Community event ticket",
    price: 30,
    currency: "USD",
    inventory: 24,
  },
];

export default function CustomerPage() {
  const [data, setData] = useState({
    walletBalance: 0,
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
  const [phone, setPhone] = useState("");
  const [age, setAge] = useState("");
  const [country, setCountry] = useState("Uganda");
  const [city, setCity] = useState("");
  const [profileCategory, setProfileCategory] = useState("client");
  const [bio, setBio] = useState("");
  const [contactPreference, setContactPreference] = useState("in_app");
  const [registrationTier, setRegistrationTier] = useState<"basic" | "premium" | "vip">("basic");
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
  const [platformSettings, setPlatformSettings] = useState({
    walletCurrency: "UGX",
    qcExchangeRate: 1000,
    about: "",
    contact: "",
  });
  const [referral, setReferral] = useState({
    referralCode: "",
    referralLink: "",
    directCount: 0,
    indirectCount: 0,
    directEarnings: 0,
    indirectEarnings: 0,
    currency: "UGX",
  });
  const [referralCode, setReferralCode] = useState("");
  const [profileQuery, setProfileQuery] = useState("");
  const [homeFilter, setHomeFilter] = useState("All");
  const [isBooting, setIsBooting] = useState(true);
  const [ageConfirmed, setAgeConfirmed] = useState(false);
  const [birthDay, setBirthDay] = useState("");
  const [birthMonth, setBirthMonth] = useState("");
  const [birthYear, setBirthYear] = useState("");
  const [ageError, setAgeError] = useState("");

  useEffect(() => {
    setReferralCode(
      new URLSearchParams(window.location.search).get("ref") || "",
    );
    const timer = window.setTimeout(() => setIsBooting(false), 650);
    setAgeConfirmed(localStorage.getItem("aqe-age-confirmed") === "true");
    return () => window.clearTimeout(timer);
  }, []);

  useEffect(() => {
    const { session, user } = readStoredSession();
    const headers: HeadersInit = {};
    if (session.access_token)
      headers.authorization = `Bearer ${session.access_token}`;
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

    fetch("/api/settings")
      .then(async (response) => {
        if (!response.ok) return;
        const payload = await response.json();
        if (payload.settings) setPlatformSettings(payload.settings);
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
      fetch("/api/referrals", { headers })
        .then(async (response) => {
          if (!response.ok) return;
          const payload = await response.json();
          if (payload.ok) setReferral(payload);
        })
        .catch(() => undefined);

      fetch("/api/messages", { headers })
        .then(async (response) => {
          if (!response.ok) return;
          const payload = await response.json();
          if (Array.isArray(payload.messages) && payload.messages.length > 0) {
            setMessages(
              payload.messages.map(
                (item: {
                  userId?: string;
                  preview?: string;
                  time?: string;
                }) => ({
                  user: item.userId || "AQE member",
                  preview: item.preview || "New message",
                  time: item.time || "Now",
                }),
              ),
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
    const endpoint =
      authMode === "login" ? "/api/auth/login" : "/api/auth/register";
    const body =
      authMode === "login"
        ? { email, password }
        : {
            email,
            password,
            displayName,
            phone,
            age: Number(age),
            country,
            city,
            category: profileCategory,
            bio,
            contactPreference,
            requestedTier: registrationTier,
            referralCode,
          };

    const response = await fetch(endpoint, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    const payload = await response.json();
    setMessage(
      payload.ok
        ? payload.upgradeRequired
          ? `${payload.requestedTier?.toUpperCase() || "PAID"} selected. Complete payment before the upgrade activates.`
          : "Basic account created."
        : payload.reason || "Request failed.",
    );

    persistStoredSession({
      session: payload.session,
      user: payload.user,
    });

    if (payload.user) {
      const nextUser = {
        ...(payload.user as Record<string, unknown>),
        display_name:
          (
            payload.user as {
              display_name?: string;
              displayName?: string;
              name?: string;
              email?: string;
            }
          ).display_name ||
          (
            payload.user as {
              display_name?: string;
              displayName?: string;
              name?: string;
              email?: string;
            }
          ).displayName ||
          (
            payload.user as {
              display_name?: string;
              displayName?: string;
              name?: string;
              email?: string;
            }
          ).name ||
          (
            payload.user as {
              display_name?: string;
              displayName?: string;
              name?: string;
              email?: string;
            }
          ).email?.split("@")[0] ||
          displayName ||
          "AQE Member",
      };
      setAccountName(String(nextUser.display_name));
      setAccountSubtitle(
        String((payload.user as { email?: string }).email || "member@aqe.test"),
      );
      setAuthenticated(true);
      if (payload.upgradeRequired) {
        setAccountSubtitle(
          `${payload.requestedTier?.toUpperCase() || "PAID"} selected · payment required`,
        );
      }
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
    setData({
      walletBalance: 0,
      qcBalance: 0,
      tier: "basic",
      bookings: 0,
      earnings: 0,
    });
  }

  function confirmAge() {
    const birthDate = new Date(
      Number(birthYear),
      Number(birthMonth) - 1,
      Number(birthDay),
    );
    const today = new Date();
    let calculatedAge = today.getFullYear() - birthDate.getFullYear();
    const beforeBirthday =
      today.getMonth() < birthDate.getMonth() ||
      (today.getMonth() === birthDate.getMonth() &&
        today.getDate() < birthDate.getDate());
    if (beforeBirthday) calculatedAge -= 1;
    if (!birthDay || !birthMonth || !birthYear || calculatedAge < 18) {
      setAgeError("You must be 18 or older to enter AQE.");
      return;
    }
    setAgeError("");
    localStorage.setItem("aqe-age-confirmed", "true");
    setAgeConfirmed(true);
  }

  async function runProfileAction(action: "message" | "booking") {
    if (!selectedProfile?.userId) {
      setProfileActionMessage(
        "This demo profile is not connected to a live account yet.",
      );
      return;
    }

    const { session, user } = readStoredSession();
    const headers: HeadersInit = { "Content-Type": "application/json" };
    if (session.access_token)
      headers.authorization = `Bearer ${session.access_token}`;
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
  const featuredProfiles = profiles.filter((profile) => {
    if (homeFilter === "All") return true;
    const haystack = `${profile.name} ${profile.city} ${profile.tag} ${profile.status} ${profile.tier}`.toLowerCase();
    return haystack.includes(homeFilter.toLowerCase());
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
            You must be 18 or older to enter. Please confirm your age to
            continue.
          </p>
          <div className="age-gate-actions">
            <button className="primary-button" type="button" onClick={confirmAge}>
              I am 18 or older <span>→</span>
            </button>
          <div className="age-date-grid">
            <select value={birthDay} onChange={(event) => setBirthDay(event.target.value)} aria-label="Birth day">
              <option value="">Day</option>
              {Array.from({ length: 31 }, (_, index) => <option key={index + 1} value={index + 1}>{index + 1}</option>)}
            </select>
            <select value={birthMonth} onChange={(event) => setBirthMonth(event.target.value)} aria-label="Birth month">
              <option value="">Month</option>
              {Array.from({ length: 12 }, (_, index) => <option key={index + 1} value={index + 1}>{index + 1}</option>)}
            </select>
            <select value={birthYear} onChange={(event) => setBirthYear(event.target.value)} aria-label="Birth year">
              <option value="">Year</option>
              {Array.from({ length: 83 }, (_, index) => { const year = new Date().getFullYear() - 18 - index; return <option key={year} value={year}>{year}</option>; })}
            </select>
          </div>
          {ageError ? <span className="age-error">{ageError}</span> : null}
          </div>
          <a className="age-exit-link" href="https://www.google.com">
            Leave this page
          </a>
        </div>
      </main>
    );
  }

  return (
    <main className="aqe-client" id="app">
      <aside className="client-desktop-nav" aria-label="AQE ecosystem navigation">
        <div className="client-desktop-brand">AQE ECOSYSTEM</div>
        <span className="client-desktop-label">Discover</span>
        {[
          ["Home", "⌂", "home"],
          ["Explore", "⌕", "discover"],
          ["Shop", "▤", "home"],
          ["Messages", "✉", "messages"],
          ["Bookings", "◫", "bookings"],
          ["Wallet", "₣", "wallet"],
        ].map(([label, icon, target]) => (
          <button
            type="button"
            key={label}
            className={view === target ? "active" : ""}
            onClick={() => setView(target as CustomerView)}
          >
            <span>{icon}</span>{label}
          </button>
        ))}
        <span className="client-desktop-label">Account</span>
        <button type="button" className={view === "me" ? "active" : ""} onClick={() => setView("me")}><span>◉</span>My profile</button>
        <button type="button" className={view === "premium" ? "active" : ""} onClick={() => setView("premium")}><span>★</span>Premium Hub</button>
        <button type="button" className={view === "vip" ? "active" : ""} onClick={() => setView("vip")}><span>♢</span>VIP Hub</button>
        <button type="button" className={view === "rewards" ? "active" : ""} onClick={() => setView("rewards")}><span>✦</span>Rewards</button>
        <button type="button" className={view === "referrals" ? "active" : ""} onClick={() => setView("referrals")}><span>♟</span>My Team</button>
        <button type="button" className={view === "raffle" ? "active" : ""} onClick={() => setView("raffle")}><span>🎟</span>Raffle</button>
        <button type="button" className={view === "settings" ? "active" : ""} onClick={() => setView("settings")}><span>⚙</span>Settings</button>
      </aside>
      <header className="client-header">
        <div>
          <div className="client-mark">AQE</div>
          <div className="client-subtitle">AfriQueerEcosystem</div>
        </div>
        <div className="header-actions">
          <span className="currency-badge">UGX</span>
          <button
            className="icon-button"
            type="button"
            onClick={() => setAuthOpen(true)}
            aria-label="Open account"
          >
            ◉
          </button>
        </div>
      </header>

      <section className="client-content">
        <div className="client-hero">
          <div className="hero-kicker">VERIFIED PROFESSIONALS · SECURE PAYMENTS · DISCREET EXPERIENCE</div>
          <h1>
            Discover
            <br />
            <em>Independence</em>
          </h1>
          <p>
            Verified professionals. Secure payments. Discreet experience.
          </p>
          <button
            className="primary-button"
            type="button"
            onClick={() => setAuthOpen(true)}
          >
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
            <div className="account-avatar">
              {accountName.charAt(0).toUpperCase()}
            </div>
            <div>
              <strong>{accountName}</strong>
              <span>{accountSubtitle}</span>
            </div>
          </div>

          <div className="metric-grid">
            <div className="metric-card">
              <span>WALLET CASH</span>
              <strong>{platformSettings.walletCurrency} {data.walletBalance || 0}</strong>
            </div>
            <div className="metric-card">
              <span>QC CREDITS</span>
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
              <span>EARNINGS CASH</span>
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
            <button
              className="text-button"
              type="button"
              onClick={() => setView("discover")}
            >
              View all
            </button>
          </div>

          {view === "home" && (
            <>
            <div className="prototype-filter-pills">
              {["All", "Available", "VIP", "Premium", "Kampala", "Entebbe", "Female", "Male", "Lesbian"].map((filter) => (
                <button type="button" className={homeFilter === filter ? "active" : ""} key={filter} onClick={() => setHomeFilter(filter)}>{filter}</button>
              ))}
            </div>
            <div className="featured-heading"><h2>Featured Profiles</h2><button type="button" onClick={() => setView("discover")}>See All →</button></div>
            <div className="prototype-profile-grid">
              {featuredProfiles.slice(0, 4).map((profile) => (
                <button type="button" className="prototype-profile-card" key={profile.name} onClick={() => setSelectedProfile(profile)}>
                  <div className="prototype-profile-image"><div className="prototype-profile-avatar">{profile.name.charAt(0)}</div><span>{profile.city} · 22</span><b>✓ Verified</b></div>
                  <strong>{profile.name}</strong><small>{profile.tag} · {profile.city}</small><div><em>{profile.status}</em><label>{(profile.tier || "basic").toUpperCase()}</label></div>
                </button>
              ))}
            </div>
            {featuredProfiles.length === 0 ? <div className="empty-panel">No featured profiles match this filter.</div> : null}
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
                      3: "rewards",
                      4: "home",
                      5: "vip",
                    };
                    setView(routeMap[index] ?? "home");
                  }}
                >
                  <span>{["⌕", "◫", "✉", "★", "▤", "♢"][index]}</span>
                  <strong>{item}</strong>
                </button>
              ))}
            </div>
            </>
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
                <div className="empty-panel">
                  No profiles match that search.
                </div>
              ) : null}
            </div>
          )}

          {view === "messages" && (
            <div className="stacked-panel-list">
              {messages.map((messageItem) => (
                <article
                  key={messageItem.user}
                  className="content-panel compact"
                >
                  <div className="mini-avatar alt">
                    {messageItem.user.charAt(0)}
                  </div>
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
                  <div className="mini-avatar gold">
                    {booking.title.charAt(0)}
                  </div>
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
                <div className="mini-avatar">
                  {accountName.charAt(0).toUpperCase()}
                </div>
                <div className="panel-copy">
                  <strong>{accountName}</strong>
                  <span>{accountSubtitle}</span>
                </div>
                <div className="status-pill">{data.tier}</div>
              </article>

              <button className="content-panel compact content-panel-button" type="button" onClick={() => setView("wallet")}>
                <div className="mini-avatar gold">Q</div>
                <div className="panel-copy">
                  <strong>Wallet</strong>
                  <span>{data.qcBalance} QC balance</span>
                </div>
                <small>UGX {data.earnings}</small>
              </button>

              <button className="content-panel compact content-panel-button" type="button" onClick={() => setView("vip")}>
                <div className="mini-avatar alt">V</div>
                <div className="panel-copy">
                  <strong>VIP access</strong>
                  <span>Upgrades and private rooms</span>
                </div>
                <small>{data.tier}</small>
              </button>

              <button className="content-panel compact content-panel-button" type="button" onClick={() => setView("referrals")}>
                <div className="mini-avatar">R</div>
                <div className="panel-copy">
                  <strong>Referral earnings</strong>
                  <span>{referral.directCount} direct • {referral.indirectCount} indirect</span>
                </div>
                <small>{referral.currency} {(referral.directEarnings + referral.indirectEarnings).toLocaleString()}</small>
              </button>
            </div>
          )}

          {view === "wallet" && (
            <div className="prototype-screen-stack">
              <article className="prototype-hero-card wallet-hero">
                <span className="eyebrow">AQE MONEY ACCOUNT</span>
                <h2>Wallet cash</h2>
                <strong>{platformSettings.walletCurrency} {data.walletBalance.toLocaleString()}</strong>
                <p>Cash deposits and referral earnings are separate from QC credits.</p>
              </article>
              <div className="prototype-action-grid">
                <button type="button" onClick={() => { window.location.href = "/payments"; }}>Deposit cash <span>→</span></button>
                <button type="button" onClick={() => setView("referrals")}>View earnings <span>→</span></button>
                <button type="button" onClick={() => { window.location.href = "/qc"; }}>Recharge QC <span>→</span></button>
              </div>
              <article className="content-panel compact"><div className="mini-avatar gold">Q</div><div className="panel-copy"><strong>QC balance</strong><span>Usage credits, not cash</span></div><small>{data.qcBalance} QC</small></article>
            </div>
          )}

          {view === "premium" && (
            <div className="prototype-screen-stack">
              <article className="prototype-hero-card premium-hero"><span className="eyebrow">PREMIUM HUB</span><h2>Build your independent profile.</h2><p>Premium unlocks profile tools, messaging, comments, and daily chat allowance.</p><button type="button" onClick={() => { window.location.href = "/payments"; }}>Upgrade to Premium <span>→</span></button></article>
              <div className="feature-list"><div><strong>Independent profile</strong><span>Present your work and services.</span></div><div><strong>Profile media</strong><span>Upload and manage your public profile.</span></div><div><strong>Daily chat allowance</strong><span>Connect with the AQE community.</span></div></div>
            </div>
          )}

          {view === "vip" && (
            <div className="prototype-screen-stack">
              <article className="prototype-hero-card vip-hero"><span className="eyebrow">VIP ECOSYSTEM</span><h2>Everything in one private room.</h2><p>Unlock asset room, store, groups, referral earnings, rewards, and VIP booking tools.</p><button type="button" onClick={() => { window.location.href = "/payments"; }}>Upgrade to VIP <span>→</span></button></article>
              <div className="prototype-action-grid"><button type="button" onClick={() => setView("referrals")}>My team <span>→</span></button><button type="button" onClick={() => setView("rewards")}>VIP rewards <span>→</span></button><button type="button" onClick={() => { window.location.href = "/vip"; }}>Withdrawals <span>→</span></button></div>
            </div>
          )}

          {view === "rewards" && (
            <div className="prototype-screen-stack"><div className="section-heading"><div><span className="eyebrow">VIP ECOSYSTEM</span><h2>Rewards</h2></div><span className="status-pill">{data.qcBalance} QC</span></div><div className="feature-list"><div><strong>Daily claim</strong><span>Collect your daily QC reward.</span><button type="button" onClick={() => { window.location.href = "/qc"; }}>Claim QC</button></div><div><strong>1 Week VIP</strong><span>Redeem rewards after eligibility.</span><button type="button" onClick={() => setView("vip")}>View VIP</button></div><div><strong>Raffle</strong><span>Use QC for the active draw.</span><button type="button" onClick={() => setView("raffle")}>Open raffle</button></div></div></div>
          )}

          {view === "referrals" && (
            <div className="prototype-screen-stack"><article className="prototype-hero-card referral-hero"><span className="eyebrow">MY TEAM / REFERRALS</span><h2>{referral.currency} {(referral.directEarnings + referral.indirectEarnings).toLocaleString()}</h2><p>Real earnings credited after referred-member payment confirmation.</p>{referral.referralLink ? <button type="button" onClick={() => navigator.clipboard.writeText(`${window.location.origin}${referral.referralLink}`)}>Copy referral link <span>→</span></button> : <small>Sign in to receive your unique referral link.</small>}</article><div className="metric-grid"><div className="metric-card"><span>DIRECT</span><strong>{referral.directCount}</strong></div><div className="metric-card"><span>INDIRECT</span><strong>{referral.indirectCount}</strong></div><div className="metric-card"><span>DIRECT EARNINGS</span><strong>{referral.currency} {referral.directEarnings.toLocaleString()}</strong></div><div className="metric-card"><span>INDIRECT EARNINGS</span><strong>{referral.currency} {referral.indirectEarnings.toLocaleString()}</strong></div></div></div>
          )}

          {view === "raffle" && (
            <div className="prototype-screen-stack"><article className="prototype-hero-card raffle-hero"><span className="eyebrow">RAFFLE</span><h2>Join the next draw.</h2><p>Tickets use QC credits. Your cash wallet is never used for raffle entry.</p><button type="button" onClick={() => { window.location.href = "/qc"; }}>View QC and rewards <span>→</span></button></article><div className="feature-list"><div><strong>Ticket price</strong><span>Manager-controlled QC amount</span></div><div><strong>Eligibility</strong><span>Available to eligible AQE members.</span></div></div></div>
          )}

          {view === "settings" && (
            <div className="prototype-screen-stack"><article className="content-panel"><div className="mini-avatar">{accountName.charAt(0).toUpperCase()}</div><div className="panel-copy"><strong>{accountName}</strong><span>{accountSubtitle}</span></div><button type="button" className="text-button" onClick={signOut}>Sign out</button></article><div className="feature-list"><div><strong>About AQE</strong><span>{platformSettings.about || "Community, profiles, bookings, and trusted creator tools."}</span></div><div><strong>Contact</strong><span>{platformSettings.contact || "Contact an AQE manager for support."}</span></div><div><strong>Privacy and safety</strong><span>Account, payment, and age-gate controls are active.</span></div></div></div>
          )}

          {view === "home" && (
            <div className="marketplace-preview">
              <div className="section-heading compact-heading">
                <div>
                  <span className="eyebrow">MARKETPLACE</span>
                  <h2>Featured drops</h2>
                </div>
                <span className="marketplace-count">
                  {products.length} live
                </span>
              </div>
              <div className="marketplace-grid">
                {products.map((product) => (
                  <article className="marketplace-item" key={product.id}>
                    <div className="marketplace-icon">✦</div>
                    <strong>{product.title}</strong>
                    <span>
                      {product.currency} {product.price}
                    </span>
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
          <button type="button" aria-label="Open VIP">
            →
          </button>
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
              <div className="mini-avatar large">
                {selectedProfile.name.charAt(0)}
              </div>
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
              <button
                type="button"
                className={authMode === "login" ? "active" : ""}
                onClick={() => setAuthMode("login")}
              >
                Login
              </button>
              <button
                type="button"
                className={authMode === "register" ? "active" : ""}
                onClick={() => setAuthMode("register")}
              >
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
                <div className="registration-fields">
                  <input
                    className="auth-input"
                    value={displayName}
                    onChange={(event) => setDisplayName(event.target.value)}
                    placeholder="Full display name"
                    required
                  />
                  <div className="registration-grid">
                    <input
                      className="auth-input"
                      value={phone}
                      onChange={(event) => setPhone(event.target.value)}
                      placeholder="Phone number"
                      required
                    />
                    <input
                      className="auth-input"
                      type="number"
                      min="18"
                      value={age}
                      onChange={(event) => setAge(event.target.value)}
                      placeholder="Age 18+"
                      required
                    />
                  </div>
                  <div className="registration-grid">
                    <input
                      className="auth-input"
                      value={country}
                      onChange={(event) => setCountry(event.target.value)}
                      placeholder="Country"
                      required
                    />
                    <input
                      className="auth-input"
                      value={city}
                      onChange={(event) => setCity(event.target.value)}
                      placeholder="City / region"
                      required
                    />
                  </div>
                  <select
                    className="auth-input"
                    value={profileCategory}
                    onChange={(event) => setProfileCategory(event.target.value)}
                  >
                    <option value="client">Client account</option>
                    <option value="independent">Independent profile</option>
                  </select>
                  <div className="registration-tier-block">
                    <div className="registration-field-label">Membership tier</div>
                    <div className="registration-tier-grid">
                      {[
                        ["basic", "Basic", "Public exploration and account access"],
                        ["premium", "Premium", "Independent profile and messaging"],
                        ["vip", "VIP", "Full ecosystem, store, groups and rewards"],
                      ].map(([value, label, description]) => (
                        <button
                          type="button"
                          key={value}
                          className={registrationTier === value ? "registration-tier active" : "registration-tier"}
                          onClick={() => setRegistrationTier(value as "basic" | "premium" | "vip")}
                        >
                          <strong>{label}</strong>
                          <span>{description}</span>
                          {value !== "basic" ? <small>Payment required after registration</small> : <small>Selected by default</small>}
                        </button>
                      ))}
                    </div>
                  </div>
                  <textarea
                    className="auth-input registration-bio"
                    value={bio}
                    onChange={(event) => setBio(event.target.value)}
                    placeholder="About you, your interests, or your professional presence"
                    rows={3}
                  />
                  <select
                    className="auth-input"
                    value={contactPreference}
                    onChange={(event) => setContactPreference(event.target.value)}
                  >
                    <option value="in_app">AQE messages</option>
                    <option value="phone">Phone</option>
                    <option value="whatsapp">WhatsApp</option>
                    <option value="email">Email</option>
                  </select>
                  <input
                    className="auth-input"
                    value={referralCode}
                    onChange={(event) => setReferralCode(event.target.value.toUpperCase())}
                    placeholder="Referral code (optional)"
                  />
                  <label className="registration-consent">
                    <input type="checkbox" required />
                    <span>I confirm I am 18+ and agree to the AQE terms and privacy policy.</span>
                  </label>
                </div>
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
