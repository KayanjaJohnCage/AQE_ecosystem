'use client'

import { useState } from 'react'

export default function SupportPage() {
  const [form, setForm] = useState({
    category: 'QC',
    subject: '',
    message: '',
    priority: 'MEDIUM'
  })
  const [ticket, setTicket] = useState<Record<string, unknown> | null>(null)
  const [loading, setLoading] = useState(false)

  const handleSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    setLoading(true)

    try {
      const response = await fetch('/api/support/tickets', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          userId: 'demo-user',
          category: form.category,
          subject: form.subject,
          message: form.message,
          priority: form.priority
        })
      })

      const data = await response.json()
      setTicket(data)
    } catch (error) {
      setTicket({ ok: false, message: error instanceof Error ? error.message : 'Ticket failed.' })
    } finally {
      setLoading(false)
    }
  }

  return (
    <main style={{ padding: 24, maxWidth: 960, margin: '0 auto' }}>
      <h1>Manager Support Room</h1>
      <p>Open a support ticket for QC, payments, subscriptions, withdrawals, creators, or general issues.</p>

      <form onSubmit={handleSubmit} style={{ background: '#101827', borderRadius: 12, padding: 20, marginTop: 20 }}>
        <div style={{ display: 'grid', gap: 12 }}>
          <label>
            Category
            <select value={form.category} onChange={(event) => setForm({ ...form, category: event.target.value })} style={{ display: 'block', width: '100%', marginTop: 6 }}>
              <option value="QC">QC</option>
              <option value="PAYMENT">Payment</option>
              <option value="WITHDRAWAL">Withdrawal</option>
              <option value="SUBSCRIPTION">Subscription</option>
              <option value="CREATOR">Creator</option>
              <option value="MARKETPLACE">Marketplace</option>
              <option value="REPORT">Report</option>
              <option value="TECHNICAL">Technical</option>
              <option value="OTHER">Other</option>
            </select>
          </label>

          <label>
            Subject
            <input value={form.subject} onChange={(event) => setForm({ ...form, subject: event.target.value })} placeholder="How can we help?" style={{ display: 'block', width: '100%', marginTop: 6 }} />
          </label>

          <label>
            Message
            <textarea value={form.message} onChange={(event) => setForm({ ...form, message: event.target.value })} rows={6} placeholder="Describe your issue" style={{ display: 'block', width: '100%', marginTop: 6 }} />
          </label>

          <label>
            Priority
            <select value={form.priority} onChange={(event) => setForm({ ...form, priority: event.target.value })} style={{ display: 'block', width: '100%', marginTop: 6 }}>
              <option value="LOW">Low</option>
              <option value="MEDIUM">Medium</option>
              <option value="HIGH">High</option>
              <option value="URGENT">Urgent</option>
            </select>
          </label>

          <button type="submit" disabled={loading}>{loading ? 'Submitting...' : 'Submit ticket'}</button>
        </div>
      </form>

      {ticket ? (
        <section style={{ background: '#101827', borderRadius: 12, padding: 20, marginTop: 20 }}>
          <h2>Ticket response</h2>
          <pre style={{ whiteSpace: 'pre-wrap' }}>{JSON.stringify(ticket, null, 2)}</pre>
        </section>
      ) : null}
    </main>
  )
}
