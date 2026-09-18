"use client";

import { FormEvent, useEffect, useState } from "react";

function LegacyCustomerPage() {
  const [login, setLogin] = useState({ email: "", password: "" });
  const [register, setRegister] = useState({
    email: "",
    password: "",
    displayName: "",
  });
  const [message, setMessage] = useState("");

  async function handleLogin(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const response = await fetch("/api/auth/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(login),
    });

    const payload = await response.json();
    setMessage(
      payload.ok
        ? "Login request completed."
        : payload.reason || "Login failed.",
    );

    if (payload.session?.access_token) {
      localStorage.setItem("aqe-session", JSON.stringify(payload.session));
      localStorage.setItem(
        "aqe-user",
        JSON.stringify(payload.user ?? { email: login.email }),
      );
    }
  }

  async function handleRegister(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const response = await fetch("/api/auth/register", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(register),
    });

    const payload = await response.json();
    setMessage(
      payload.ok
        ? "Registration request completed."
        : payload.reason || "Registration failed.",
    );
  }

  return (
    <main style={{ padding: 24, maxWidth: 1200, margin: "0 auto" }}>
      <header
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          gap: 16,
          marginBottom: 24,
          flexWrap: "wrap",
        }}
      >
        <div>
          <p
            style={{
              margin: 0,
              color: "#8ecae6",
              textTransform: "uppercase",
              letterSpacing: 1.5,
              fontSize: 12,
            }}
          >
            AQE
          </p>
          <h1 style={{ margin: "8px 0 0" }}>Customer Dashboard</h1>
        </div>
        <button
          type="button"
          style={{ padding: "10px 16px", borderRadius: 10 }}
        >
          Profile
        </button>
      </header>

      <section
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))",
          gap: 16,
        }}
      >
        <div style={{ background: "#101827", borderRadius: 16, padding: 20 }}>
          <div
            style={{
              color: "#94a3b8",
              fontSize: 12,
              textTransform: "uppercase",
            }}
          >
            QC Balance
          </div>
          <div style={{ fontSize: 30, fontWeight: 700, marginTop: 10 }}>
            245
          </div>
        </div>
        <div style={{ background: "#101827", borderRadius: 16, padding: 20 }}>
          <div
            style={{
              color: "#94a3b8",
              fontSize: 12,
              textTransform: "uppercase",
            }}
          >
            Tier
          </div>
          <div style={{ fontSize: 30, fontWeight: 700, marginTop: 10 }}>
            Premium
          </div>
        </div>
        <div style={{ background: "#101827", borderRadius: 16, padding: 20 }}>
          <div
            style={{
              color: "#94a3b8",
              fontSize: 12,
              textTransform: "uppercase",
            }}
          >
            Bookings
          </div>
          <div style={{ fontSize: 30, fontWeight: 700, marginTop: 10 }}>08</div>
        </div>
      </section>

      <section
        style={{
          marginTop: 28,
          display: "grid",
          gridTemplateColumns: "1.4fr 1fr",
          gap: 16,
        }}
      >
        <div style={{ background: "#101827", borderRadius: 16, padding: 20 }}>
          <h2 style={{ marginTop: 0 }}>Explore & activity</h2>
          <ul style={{ margin: 0, paddingLeft: 18, color: "#dfe8f3" }}>
            <li>Profile visibility and posting controls</li>
            <li>Bookings and service requests</li>
            <li>Comment and messaging access</li>
            <li>VIP feature upgrade path</li>
          </ul>
        </div>
        <div style={{ background: "#101827", borderRadius: 16, padding: 20 }}>
          <h2 style={{ marginTop: 0 }}>Quick actions</h2>
          <div style={{ display: "grid", gap: 10 }}>
            <button type="button">Book now</button>
            <button type="button">Comment</button>
            <button type="button">Recharge QC</button>
          </div>
        </div>
      </section>

      <section
        style={{
          marginTop: 28,
          display: "grid",
          gridTemplateColumns: "1fr 1fr",
          gap: 16,
        }}
      >
        <form
          onSubmit={handleLogin}
          style={{ background: "#101827", borderRadius: 16, padding: 20 }}
        >
          <h3 style={{ marginTop: 0 }}>Login</h3>
          <div style={{ display: "grid", gap: 10 }}>
            <input
              value={login.email}
              onChange={(event) =>
                setLogin({ ...login, email: event.target.value })
              }
              placeholder="Email"
              style={{ padding: 10, borderRadius: 8 }}
            />
            <input
              type="password"
              value={login.password}
              onChange={(event) =>
                setLogin({ ...login, password: event.target.value })
              }
              placeholder="Password"
              style={{ padding: 10, borderRadius: 8 }}
            />
            <button type="submit">Sign in</button>
          </div>
        </form>

        <form
          onSubmit={handleRegister}
          style={{ background: "#101827", borderRadius: 16, padding: 20 }}
        >
          <h3 style={{ marginTop: 0 }}>Register</h3>
          <div style={{ display: "grid", gap: 10 }}>
            <input
              value={register.displayName}
              onChange={(event) =>
                setRegister({ ...register, displayName: event.target.value })
              }
              placeholder="Display name"
              style={{ padding: 10, borderRadius: 8 }}
            />
            <input
              value={register.email}
              onChange={(event) =>
                setRegister({ ...register, email: event.target.value })
              }
              placeholder="Email"
              style={{ padding: 10, borderRadius: 8 }}
            />
            <input
              type="password"
              value={register.password}
              onChange={(event) =>
                setRegister({ ...register, password: event.target.value })
              }
              placeholder="Password"
              style={{ padding: 10, borderRadius: 8 }}
            />
            <button type="submit">Create account</button>
          </div>
        </form>
      </section>

      {message ? (
        <p style={{ marginTop: 20, color: "#cbd5e1" }}>{message}</p>
      ) : null}
    </main>
  );
}

export default function CustomerPage() {
  const [data, setData] = useState({ qcBalance: 0, tier: 'basic', bookings: 0, earnings: 0 })
  const [authOpen, setAuthOpen] = useState(false)
  const [authMode, setAuthMode] = useState<'login' | 'register'>('login')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [displayName, setDisplayName] = useState('')
  const [message, setMessage] = useState('')

  useEffect(() => {
    const session = JSON.parse(localStorage.getItem('aqe-session') ?? '{}')
    const user = JSON.parse(localStorage.getItem('aqe-user') ?? '{}')
    const headers: HeadersInit = {}
    if (session.access_token) headers.authorization = `Bearer ${session.access_token}`
    if (user.id) headers['x-user-id'] = user.id
    fetch('/api/dashboard', { headers }).then(async (response) => {
      if (response.ok) {
        const payload = await response.json()
        if (payload.customer) setData(payload.customer)
      }
    }).catch(() => undefined)
  }, [])

  async function submitAuth(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const endpoint = authMode === 'login' ? '/api/auth/login' : '/api/auth/register'
    const body = authMode === 'login' ? { email, password } : { email, password, displayName }
    const response = await fetch(endpoint, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) })
    const payload = await response.json()
    setMessage(payload.ok ? 'Request completed.' : payload.reason || 'Request failed.')
    if (payload.session?.access_token) localStorage.setItem('aqe-session', JSON.stringify(payload.session))
    if (payload.user) localStorage.setItem('aqe-user', JSON.stringify(payload.user))
    if (payload.ok) setAuthOpen(false)
  }

  return (
    <main className="aqe-client" id="app">
      <header className="client-header"><div><div className="client-mark">AQE</div><div className="client-subtitle">AfriQueerEcosystem</div></div><div className="header-actions"><span className="currency-badge">UGX</span><button className="icon-button" type="button" onClick={() => setAuthOpen(true)} aria-label="Open account">◉</button></div></header>
      <section className="client-content">
        <div className="client-hero"><div className="hero-kicker">WELCOME TO YOUR ECOSYSTEM</div><h1>Find your people.<br /><em>Build your world.</em></h1><p>Explore profiles, connect with community, and unlock your next chapter.</p><button className="primary-button" type="button" onClick={() => setAuthOpen(true)}>Explore the ecosystem <span>→</span></button></div>
        <section className="section-block"><div className="section-heading"><div><span className="eyebrow">YOUR DASHBOARD</span><h2>My account</h2></div><button className="text-button" type="button" onClick={() => setAuthOpen(true)}>Sign in</button></div><div className="account-row"><div className="account-avatar">?</div><div><strong>Guest account</strong><span>Sign in to manage your profile</span></div></div><div className="metric-grid"><div className="metric-card"><span>WALLET</span><strong>{data.qcBalance} QC</strong></div><div className="metric-card"><span>TIER</span><strong>{data.tier}</strong></div><div className="metric-card"><span>BOOKINGS</span><strong>{data.bookings}</strong></div><div className="metric-card"><span>EARNINGS</span><strong>UGX {data.earnings}</strong></div></div></section>
        <section className="section-block"><div className="section-heading"><div><span className="eyebrow">DISCOVER</span><h2>Explore AQE</h2></div><button className="text-button" type="button">View all</button></div><div className="explore-grid">{['Directory', 'Bookings', 'Messages', 'Rewards', 'Marketplace', 'VIP room'].map((item, index) => <button className="explore-tile" type="button" key={item}><span>{['⌕', '◫', '✉', '★', '▤', '♢'][index]}</span><strong>{item}</strong></button>)}</div></section>
        <section className="section-block callout"><span className="callout-icon">✦</span><div><span className="eyebrow">VIP ECOSYSTEM</span><h2>Unlock more of AQE</h2><p>Premium tools, private rooms, and deeper connections.</p></div><button type="button" aria-label="Open VIP">→</button></section>
      </section>
      <nav className="client-bottom-nav" aria-label="Primary navigation">{['Home', 'Discover', 'Messages', 'Activity', 'Me'].map((item, index) => <button className={index === 0 ? 'active' : ''} type="button" key={item}><span>{['⌂', '⌕', '✉', '♢', '●'][index]}</span>{item}</button>)}</nav>
      {authOpen ? <div className="auth-overlay" role="dialog" aria-modal="true"><form className="auth-sheet" onSubmit={submitAuth}><button className="close-button" type="button" onClick={() => setAuthOpen(false)} aria-label="Close">×</button><div className="auth-brand">AQE</div><div className="auth-tabs"><button className={authMode === 'login' ? 'active' : ''} type="button" onClick={() => setAuthMode('login')}>SIGN IN</button><button className={authMode === 'register' ? 'active' : ''} type="button" onClick={() => setAuthMode('register')}>REGISTER</button></div><h2>{authMode === 'login' ? 'Welcome back' : 'Join AQE'}</h2><p>{authMode === 'login' ? 'Return to your ecosystem.' : 'Create your account and start exploring.'}</p>{authMode === 'register' ? <input className="auth-input" value={displayName} onChange={(event) => setDisplayName(event.target.value)} placeholder="Display name" required /> : null}<input className="auth-input" value={email} onChange={(event) => setEmail(event.target.value)} placeholder="Email address" type="email" required /><input className="auth-input" value={password} onChange={(event) => setPassword(event.target.value)} placeholder="Password" type="password" required /><button className="primary-button" type="submit">{authMode === 'login' ? 'Sign in' : 'Create account'} <span>→</span></button>{message ? <small className="auth-message">{message}</small> : null}</form></div> : null}
    </main>
  )
}
