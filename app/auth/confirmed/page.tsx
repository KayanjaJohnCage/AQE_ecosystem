"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";

export default function AuthConfirmedPage() {
  const router = useRouter();
  const [status, setStatus] = useState("Verifying your email…");

  useEffect(() => {
    const timer = window.setTimeout(() => setStatus("Your email has been verified. Your account is ready."), 900);
    return () => window.clearTimeout(timer);
  }, []);

  return (
    <main style={{minHeight:"100vh",display:"grid",placeItems:"center",padding:24,background:"#08080d",color:"#fff"}}>
      <section style={{width:"min(520px,100%)",padding:28,borderRadius:22,border:"1px solid rgba(212,175,55,.25)",background:"linear-gradient(145deg,rgba(139,92,246,.12),rgba(212,175,55,.06))",textAlign:"center"}}>
        <img src="/aqe_logo.png" alt="AfriQueer Escorts Ecosystem" width={84} height={84} style={{objectFit:"contain",borderRadius:18,margin:"0 auto 16px"}} />
        <div style={{fontSize:12,letterSpacing:2,textTransform:"uppercase",color:"#d4af37",fontWeight:800}}>AfriQueer Escorts Ecosystem</div>
        <h1 style={{fontSize:28,margin:"12px 0 8px"}}>Email verified</h1>
        <p style={{color:"#b9b9c7",lineHeight:1.6}}>{status}</p>
        <button onClick={() => router.replace("/customer")} style={{marginTop:18,border:0,borderRadius:12,padding:"12px 20px",fontWeight:800,cursor:"pointer"}}>Open customer website</button>
      </section>
    </main>
  );
}
