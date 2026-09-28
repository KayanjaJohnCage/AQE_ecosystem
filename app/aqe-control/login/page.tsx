"use client";

import { FormEvent, useState } from "react";
import { useRouter } from "next/navigation";

export default function AqeControlLogin() {
  const router = useRouter();
  const [identifier, setIdentifier] = useState("");
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
        body: JSON.stringify({ identifier, password }),
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
        <p>Sign in with the manager account email or phone number and password.</p>
        <form onSubmit={submit}>
          <label>
            Email or phone number
            <input type="text" value={identifier} onChange={(event) => setIdentifier(event.target.value)} placeholder="manager@example.com or 07xx xxx xxx" autoComplete="username" required />
          </label>
          <label>
            Manager password
            <input type="password" autoComplete="current-password" value={password} onChange={(event) => setPassword(event.target.value)} placeholder="Enter manager password" required />
          </label>
          {error ? <div className="aqe-control-error">{error}</div> : null}
          <button type="submit" disabled={busy}>{busy ? "Signing in..." : "Enter manager console"}</button>
        </form>
        <small>Only Supabase accounts assigned the <strong>manager</strong> or <strong>admin</strong> role can enter AQE Control.</small>
      </section>
    </main>
  );
}
