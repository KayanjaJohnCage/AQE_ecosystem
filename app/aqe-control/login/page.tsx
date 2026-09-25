"use client";

import { FormEvent, useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { getSupabaseClient } from "../../../lib/supabaseClient";

export default function AqeControlLogin() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [googleEmail, setGoogleEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [googleBusy, setGoogleBusy] = useState(false);
  const [error, setError] = useState("");
  const [googleVerified, setGoogleVerified] = useState(false);

  useEffect(() => {
    const verified = searchParams.get("google") === "verified";
    setGoogleVerified(verified);
    if (searchParams.get("error")) setError(searchParams.get("error") || "Google verification failed.");

    fetch("/api/auth/manager-google/status", { cache: "no-store" })
      .then(async (response) => {
        const payload = await response.json().catch(() => ({}));
        if (response.ok && payload.verified) {
          setGoogleVerified(true);
          setGoogleEmail(String(payload.email || ""));
        }
      })
      .catch(() => undefined);
  }, [searchParams]);

  async function continueWithGoogle() {
    setGoogleBusy(true);
    setError("");
    const supabase = getSupabaseClient();
    if (!supabase) {
      setError("Google manager authentication is not configured.");
      setGoogleBusy(false);
      return;
    }
    const redirectTo = `${window.location.origin}/aqe-control/login/google-callback`;
    const { data, error: oauthError } = await supabase.auth.signInWithOAuth({
      provider: "google",
      options: { redirectTo, queryParams: { prompt: "select_account" } },
    });
    if (oauthError || !data.url) {
      setError(oauthError?.message || "Unable to start Google verification.");
      setGoogleBusy(false);
      return;
    }
    window.location.assign(data.url);
  }

  async function submit(event: FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError("");
    try {
      const response = await fetch("/api/auth/manager-login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ password }),
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
        <p>Manager Control requires both the authorized AQE Google account and the private manager password.</p>
        <button type="button" onClick={continueWithGoogle} disabled={googleBusy} className="aqe-google-login-button">
          <i className="fab fa-google" />
          {googleBusy ? "Verifying Google account..." : googleVerified ? "Google account verified" : "Continue with Google"}
        </button>
        <div className="aqe-auth-divider"><span>THEN ENTER MANAGER PASSWORD</span></div>
        <form onSubmit={submit}>
          <label>
            Authorized Google account
            <input type="email" value={googleEmail} placeholder="Verify with Google first" readOnly autoComplete="username" />
          </label>
          <label>
            Manager password
            <input type="password" autoComplete="current-password" value={password} onChange={(e) => setPassword(e.target.value)} required />
          </label>
          {error ? <div className="aqe-control-error">{error}</div> : null}
          <button type="submit" disabled={busy || !googleVerified}>{busy ? "Signing in..." : "Enter manager console"}</button>
        </form>
        <small>Being signed in to the authorized Google account on this device does not bypass the manager password.</small>
      </section>
    </main>
  );
}
