"use client";

import { FormEvent, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { getSupabaseClient } from "../../../lib/supabaseClient";

export default function ResetPasswordPage() {
  const router = useRouter();
  const [password, setPassword] = useState("");
  const [ready, setReady] = useState(false);
  const [message, setMessage] = useState("Opening secure password reset…");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    const supabase = getSupabaseClient();
    if (!supabase) {
      setMessage("Authentication service is not configured.");
      return;
    }
    supabase.auth.getSession().then(({ data }) => {
      if (data.session) {
        setReady(true);
        setMessage("Enter a new password for your account.");
      } else {
        setMessage("This reset link is invalid or has expired. Request a new one from Sign In.");
      }
    });
  }, []);

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (password.length < 8) {
      setMessage("Password must be at least 8 characters.");
      return;
    }
    const supabase = getSupabaseClient();
    if (!supabase) return;
    setBusy(true);
    const { error } = await supabase.auth.updateUser({ password });
    setBusy(false);
    if (error) {
      setMessage(error.message);
      return;
    }
    setMessage("Password updated successfully.");
    window.setTimeout(() => router.replace("/customer"), 900);
  }

  return (
    <main style={{minHeight:"100vh",display:"grid",placeItems:"center",padding:24,background:"#08080d",color:"#fff"}}>
      <section style={{width:"min(460px,100%)",padding:28,borderRadius:22,border:"1px solid rgba(212,175,55,.25)",background:"linear-gradient(145deg,rgba(139,92,246,.12),rgba(212,175,55,.06))"}}>
        <img src="/aqe_logo.png" alt="AfriQueer Escorts Ecosystem" width={72} height={72} style={{objectFit:"contain",borderRadius:16}} />
        <h1 style={{fontSize:26,margin:"14px 0 8px"}}>Reset password</h1>
        <p style={{color:"#b9b9c7",lineHeight:1.55}}>{message}</p>
        {ready ? <form onSubmit={submit}>
          <input type="password" value={password} onChange={(e)=>setPassword(e.target.value)} placeholder="New password" minLength={8} required style={{width:"100%",boxSizing:"border-box",marginTop:16,padding:13,borderRadius:12,border:"1px solid #30303b",background:"#11131a",color:"#fff"}} />
          <button disabled={busy} style={{marginTop:12,padding:"12px 18px",border:0,borderRadius:12,fontWeight:800,cursor:"pointer"}}>{busy ? "Updating…" : "Update password"}</button>
        </form> : null}
      </section>
    </main>
  );
}
