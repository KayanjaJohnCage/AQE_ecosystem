'use client'

import { useState } from 'react'
import { readStoredSession } from '../../lib/clientSession'

export default function QcPage() {
  const [isLoading, setIsLoading] = useState(false)
  const [result, setResult] = useState<{ ok?: boolean; amount?: number; balanceAfter?: number; mode?: string; message?: string; reason?: string } | null>(null)

  const handleClaim = async () => {
    setIsLoading(true)
    try {
      const { session, user } = readStoredSession()
      const headers: HeadersInit = { 'Content-Type': 'application/json' }
      if (session.access_token) headers.authorization = `Bearer ${session.access_token}`
      if (user.id) headers['x-user-id'] = user.id
      const response = await fetch('/api/qc/daily-claim', {
        method: 'POST',
        headers,
        body: JSON.stringify({})
      })

      const data = await response.json()
      setResult(data)
    } catch (error) {
      setResult({
        ok: false,
        reason: error instanceof Error ? error.message : 'Unknown error'
      })
    } finally {
      setIsLoading(false)
    }
  }

  return (
    <main style={{ padding: 24, maxWidth: 960, margin: '0 auto' }}>
      <h1>AQE QC / Rewards</h1>
      <p>Collect QC, complete your daily reward, and test the payment flow.</p>

      <section style={{ background: '#101827', borderRadius: 12, padding: 20, marginTop: 20 }}>
        <h2>Daily Claim</h2>
        <p>Daily reward: 5 QC</p>
        <button onClick={handleClaim} disabled={isLoading} style={{ marginTop: 12 }}>
          {isLoading ? 'Claiming...' : 'Claim 5 QC'}
        </button>
        {result ? (
          <div style={{ marginTop: 12 }}>
            <p><strong>Result:</strong> {result.ok ? 'success' : 'blocked'}</p>
            {result.amount ? <p><strong>Amount:</strong> {result.amount} QC</p> : null}
            {result.balanceAfter ? <p><strong>New balance:</strong> {result.balanceAfter} QC</p> : null}
            {result.reason ? <p>{result.reason}</p> : null}
            {result.message ? <p>{result.message}</p> : null}
          </div>
        ) : null}
      </section>

      <section style={{ background: '#101827', borderRadius: 12, padding: 20, marginTop: 20 }}>
        <h2>Weekly Attendance</h2>
        <ul>
          <li>Mon: 0.20 QC</li>
          <li>Tue: 0.25 QC</li>
          <li>Wed: 0.30 QC</li>
          <li>Thu: 0.35 QC</li>
          <li>Fri: 0.40 QC</li>
          <li>Sat: 0.45 QC</li>
          <li>Sun: 0.00 QC</li>
        </ul>
      </section>
    </main>
  )
}
