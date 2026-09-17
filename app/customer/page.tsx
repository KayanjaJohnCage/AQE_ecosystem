'use client'

import { useState } from 'react'

export default function CustomerPage() {
  const [login, setLogin] = useState({ email: '', password: '' })
  const [register, setRegister] = useState({ email: '', password: '', displayName: '' })
  const [message, setMessage] = useState('')

  async function handleLogin(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const response = await fetch('/api/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(login)
    })

    const payload = await response.json()
    setMessage(payload.ok ? 'Login request completed.' : payload.reason || 'Login failed.')

    if (payload.session?.access_token) {
      localStorage.setItem('aqe-session', JSON.stringify(payload.session))
      localStorage.setItem('aqe-user', JSON.stringify(payload.user ?? { email: login.email }))
    }
  }

  async function handleRegister(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const response = await fetch('/api/auth/register', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(register)
    })

    const payload = await response.json()
    setMessage(payload.ok ? 'Registration request completed.' : payload.reason || 'Registration failed.')
  }

  return (
    <main style={{ padding: 24, maxWidth: 1200, margin: '0 auto' }}>
      <header style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 16, marginBottom: 24, flexWrap: 'wrap' }}>
        <div>
          <p style={{ margin: 0, color: '#8ecae6', textTransform: 'uppercase', letterSpacing: 1.5, fontSize: 12 }}>AQE</p>
          <h1 style={{ margin: '8px 0 0' }}>Customer Dashboard</h1>
        </div>
        <button type="button" style={{ padding: '10px 16px', borderRadius: 10 }}>Profile</button>
      </header>

      <section style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 16 }}>
        <div style={{ background: '#101827', borderRadius: 16, padding: 20 }}>
          <div style={{ color: '#94a3b8', fontSize: 12, textTransform: 'uppercase' }}>QC Balance</div>
          <div style={{ fontSize: 30, fontWeight: 700, marginTop: 10 }}>245</div>
        </div>
        <div style={{ background: '#101827', borderRadius: 16, padding: 20 }}>
          <div style={{ color: '#94a3b8', fontSize: 12, textTransform: 'uppercase' }}>Tier</div>
          <div style={{ fontSize: 30, fontWeight: 700, marginTop: 10 }}>Premium</div>
        </div>
        <div style={{ background: '#101827', borderRadius: 16, padding: 20 }}>
          <div style={{ color: '#94a3b8', fontSize: 12, textTransform: 'uppercase' }}>Bookings</div>
          <div style={{ fontSize: 30, fontWeight: 700, marginTop: 10 }}>08</div>
        </div>
      </section>

      <section style={{ marginTop: 28, display: 'grid', gridTemplateColumns: '1.4fr 1fr', gap: 16 }}>
        <div style={{ background: '#101827', borderRadius: 16, padding: 20 }}>
          <h2 style={{ marginTop: 0 }}>Explore & activity</h2>
          <ul style={{ margin: 0, paddingLeft: 18, color: '#dfe8f3' }}>
            <li>Profile visibility and posting controls</li>
            <li>Bookings and service requests</li>
            <li>Comment and messaging access</li>
            <li>VIP feature upgrade path</li>
          </ul>
        </div>
        <div style={{ background: '#101827', borderRadius: 16, padding: 20 }}>
          <h2 style={{ marginTop: 0 }}>Quick actions</h2>
          <div style={{ display: 'grid', gap: 10 }}>
            <button type="button">Book now</button>
            <button type="button">Comment</button>
            <button type="button">Recharge QC</button>
          </div>
        </div>
      </section>

      <section style={{ marginTop: 28, display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
        <form onSubmit={handleLogin} style={{ background: '#101827', borderRadius: 16, padding: 20 }}>
          <h3 style={{ marginTop: 0 }}>Login</h3>
          <div style={{ display: 'grid', gap: 10 }}>
            <input value={login.email} onChange={(event) => setLogin({ ...login, email: event.target.value })} placeholder="Email" style={{ padding: 10, borderRadius: 8 }} />
            <input type="password" value={login.password} onChange={(event) => setLogin({ ...login, password: event.target.value })} placeholder="Password" style={{ padding: 10, borderRadius: 8 }} />
            <button type="submit">Sign in</button>
          </div>
        </form>

        <form onSubmit={handleRegister} style={{ background: '#101827', borderRadius: 16, padding: 20 }}>
          <h3 style={{ marginTop: 0 }}>Register</h3>
          <div style={{ display: 'grid', gap: 10 }}>
            <input value={register.displayName} onChange={(event) => setRegister({ ...register, displayName: event.target.value })} placeholder="Display name" style={{ padding: 10, borderRadius: 8 }} />
            <input value={register.email} onChange={(event) => setRegister({ ...register, email: event.target.value })} placeholder="Email" style={{ padding: 10, borderRadius: 8 }} />
            <input type="password" value={register.password} onChange={(event) => setRegister({ ...register, password: event.target.value })} placeholder="Password" style={{ padding: 10, borderRadius: 8 }} />
            <button type="submit">Create account</button>
          </div>
        </form>
      </section>

      {message ? <p style={{ marginTop: 20, color: '#cbd5e1' }}>{message}</p> : null}
    </main>
  )
}
