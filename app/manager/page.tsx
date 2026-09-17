import '../../app/globals.css'

const supportQueue = [
  { category: 'QC', count: 4, status: 'OPEN' },
  { category: 'PAYMENT', count: 3, status: 'IN_PROGRESS' },
  { category: 'WITHDRAWAL', count: 2, status: 'WAITING_FOR_USER' },
  { category: 'CREATOR', count: 1, status: 'RESOLVED' }
]

export default function ManagerPage() {
  return (
    <div className="manager-root">
      <aside className="manager-sidebar">
        <h2>Manager</h2>
        <nav>
          <ul>
            <li>Command Center</li>
            <li>Users</li>
            <li>Profiles</li>
            <li>Subscriptions</li>
            <li>Bookings</li>
            <li>Transactions</li>
            <li>Withdrawals</li>
            <li>Moderation</li>
            <li>Audit</li>
          </ul>
        </nav>
      </aside>

      <main className="manager-main">
        <header className="manager-topbar">
          <h1>Manager Console</h1>
        </header>

        <section className="manager-content">
          <p>
            Internal manager console. User support tickets belong in the public <strong>Manager Support Room</strong>, while internal reporting and operational controls remain here.
          </p>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 16, marginTop: 24 }}>
            {supportQueue.map((item) => (
              <div key={item.category} style={{ background: '#0f172a', border: '1px solid #1e293b', borderRadius: 12, padding: 16 }}>
                <div style={{ fontSize: 12, color: '#94a3b8', textTransform: 'uppercase' }}>{item.category}</div>
                <div style={{ fontSize: 28, fontWeight: 700, marginTop: 8 }}>{item.count}</div>
                <div style={{ color: '#cbd5e1', marginTop: 6 }}>{item.status}</div>
              </div>
            ))}
          </div>
        </section>
      </main>
    </div>
  )
}
