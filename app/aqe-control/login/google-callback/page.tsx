"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { getSupabaseClient } from "../../../../lib/supabaseClient";

export default function ManagerGoogleCallback() {
  const router = useRouter();
  const [message, setMessage] = useState("Verifying the authorized AQE Google account...");

  useEffect(() => {
    let active = true;
    async function verify() {
      const supabase = getSupabaseClient();
      if (!supabase) {
        router.replace("/aqe-control/login?error=Google%20authentication%20is%20not%20configured.");
        return;
      }
      const { data, error } = await supabase.auth.getSession();
      if (error || !data.session) {
        router.replace("/aqe-control/login?error=Google%20authentication%20failed.");
        return;
      }
      const response = await fetch("/api/auth/manager-google/verify", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ accessToken: data.session.access_token }),
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok || !payload.ok) {
        await supabase.auth.signOut();
        router.replace(`/aqe-control/login?error=${encodeURIComponent(payload.reason || "This Google account is not authorized for AQE Manager Control.")}`);
        return;
      }
      if (active) {
        setMessage("Google account verified. Enter the manager password.");
        router.replace("/aqe-control/login?google=verified");
        router.refresh();
      }
    }
    void verify();
    return () => { active = false; };
  }, [router]);

  return (
    <main className="aqe-control-login">
      <section className="aqe-control-login-card">
        <span className="eyebrow">AQE CONTROL</span>
        <h1>Google verification</h1>
        <p>{message}</p>
      </section>
    </main>
  );
}
