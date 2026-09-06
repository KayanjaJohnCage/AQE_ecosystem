export default function Home() {
  return (
    <main style={{ padding: 24, maxWidth: 1200, margin: '0 auto' }}>
      <h1>AQE Ecosystem</h1>
      <p>Phase 1 foundation — Next.js + TypeScript + Supabase</p>
      <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
        <a href="/customer">Customer UI (shell)</a>
        <a href="/manager">Manager UI (shell)</a>
        <a href="/qc">QC / Rewards</a>
        <a href="/payments">Payments</a>
        <a href="/support">Manager Support</a>
        <a href="/vip">VIP Withdrawal</a>
      </div>
    </main>
  )
}
