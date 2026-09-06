'use client'

import { useState } from 'react'

export default function PaymentsPage() {
  const [isLoading, setIsLoading] = useState(false)
  const [result, setResult] = useState<Record<string, unknown> | null>(null)

  const handleGatewayTest = async () => {
    setIsLoading(true)
    try {
      const response = await fetch('/api/payments/initialize', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ amount: 100, currency: 'NGN' })
      })

      const data = await response.json()
      setResult(data)
    } catch (error) {
      setResult({ status: 'error', message: error instanceof Error ? error.message : 'Unknown error' })
    } finally {
      setIsLoading(false)
    }
  }

  return (
    <main style={{ padding: 24, maxWidth: 980, margin: '0 auto' }}>
      <h1>Gateway Testing</h1>
      <p>Use this page to validate the payment gateway setup before connecting the production checkout flow.</p>

      <section style={{ background: '#101827', borderRadius: 12, padding: 20, marginTop: 20 }}>
        <h2>Run gateway test</h2>
        <button onClick={handleGatewayTest} disabled={isLoading}>
          {isLoading ? 'Testing...' : 'Test payment gateway'}
        </button>
      </section>

      {result ? (
        <section style={{ background: '#101827', borderRadius: 12, padding: 20, marginTop: 20 }}>
          <h2>Successful payment test payload</h2>
          <pre style={{ whiteSpace: 'pre-wrap', overflowX: 'auto' }}>
            {JSON.stringify(result, null, 2)}
          </pre>
        </section>
      ) : null}
    </main>
  )
}
