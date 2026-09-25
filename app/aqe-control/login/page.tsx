"use client";

import { FormEvent, useState } from "react";
import { useRouter } from "next/navigation";

export default function AqeControlLogin() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function submit(event: FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError("");
    try {
      const response = await fetch("/api/auth/manager-login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, password }),
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok || !payload.ok) {
        setError(payload.reason || "Manager authentication failed.");
        return;
      }
      router.replace("/aqe-control");
      router.refresh();
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Manager authentication failed.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="aqe-control-login">
      <section className="aqe-control-login-card">
        <span className="eyebrow">AQE CONTROL</span>
        <h1>Manager sign in</h1>
        <p>This is a restricted AQE management console. Customer accounts cannot access it.</p>
        <form onSubmit={submit}>
          <label>
            AQE manager email
            <input type="email" autoComplete="username" value={email} onChange={(e) => setEmail(e.target.value)} required />
          </label>
          <label>
            Password
            <input type="password" autoComplete="current-password" value={password} onChange={(e) => setPassword(e.target.value)} required />
          </label>
          {error ? <div className="aqe-control-error">{error}</div> : null}
          <button type="submit" disabled={busy}>{busy ? "Signing in..." : "Enter manager console"}</button>
        </form>
      </section>
    </main>
  );
}
