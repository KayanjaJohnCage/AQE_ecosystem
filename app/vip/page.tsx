"use client";

import { useState } from "react";
import { createVipWithdrawalRequest } from "../../lib/aqe/vip";
import { readStoredSession } from "../../lib/clientSession";

const schedule = [
  { dayOfWeek: 1, isWithdrawalDay: true },
  { dayOfWeek: 3, isWithdrawalDay: true },
  { dayOfWeek: 5, isWithdrawalDay: true },
];

export default function VipPage() {
  const [result, setResult] = useState<Record<string, unknown> | null>(null);
  const [loading, setLoading] = useState(false);

  const handleRequest = async () => {
    setLoading(true);
    try {
      const { session, user } = readStoredSession();
      const headers: HeadersInit = { "Content-Type": "application/json" };
      if (session.access_token)
        headers.authorization = `Bearer ${session.access_token}`;
      if (user.id) headers["x-user-id"] = user.id;
      const response = await fetch("/api/vip/withdrawals", {
        method: "POST",
        headers,
        body: JSON.stringify({ amount: 500, schedule }),
      });

      const data = await response.json();
      setResult(data);
    } catch (error) {
      setResult({
        ok: false,
        message: error instanceof Error ? error.message : "Request failed.",
      });
    } finally {
      setLoading(false);
    }
  };

  return (
    <main style={{ padding: 24, maxWidth: 960, margin: "0 auto" }}>
      <h1>VIP Withdrawal</h1>
      <p>
        VIP withdrawals are available only on the configured three-day weekly
        schedule.
      </p>

      <section
        style={{
          background: "#101827",
          borderRadius: 12,
          padding: 20,
          marginTop: 20,
        }}
      >
        <h2>Current schedule</h2>
        <p>Mon, Wed, Fri</p>
        <button onClick={handleRequest} disabled={loading}>
          {loading ? "Checking..." : "Request withdrawal"}
        </button>
      </section>

      {result ? (
        <section
          style={{
            background: "#101827",
            borderRadius: 12,
            padding: 20,
            marginTop: 20,
          }}
        >
          <h2>Withdrawal result</h2>
          <pre style={{ whiteSpace: "pre-wrap" }}>
            {JSON.stringify(result, null, 2)}
          </pre>
        </section>
      ) : null}
    </main>
  );
}
