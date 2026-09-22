import Link from "next/link";

export default function Home() {
  return (
    <main className="aqe-launch-home">
      <div className="aqe-launch-card">
        <div className="aqe-launch-brand">AQE</div>
        <h1>AfriQueerEcosystem</h1>
        <p>
          The original AQE frontend is now the active customer experience,
          with the current Next.js/Supabase backend connected underneath.
        </p>
        <div className="aqe-launch-actions">
          <Link href="/customer">Enter AQE</Link>
          <Link href="/payments">Payments</Link>
          <Link href="/manager">Manager</Link>
        </div>
      </div>
    </main>
  );
}
