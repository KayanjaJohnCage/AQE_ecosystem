import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Install AQE",
  description: "Install AfriQueer Escorts Ecosystem as an app on Android, Windows or Apple devices.",
};

export default function DownloadPage() {
  return (
    <main style={{minHeight:"100vh",background:"#07070b",color:"#fff",padding:"32px",fontFamily:"system-ui,sans-serif"}}>
      <div style={{maxWidth:900,margin:"0 auto"}}>
        <div style={{display:"flex",alignItems:"center",gap:12,marginBottom:28}}>
          <img src="/AQE-Nav&Icon.jpeg" alt="AQE" width={52} height={52} style={{borderRadius:14}} />
          <div><div style={{fontWeight:800,fontSize:22}}>AQE</div><div style={{opacity:.7}}>AfriQueer Escorts Ecosystem</div></div>
        </div>
        <section style={{padding:28,border:"1px solid rgba(255,255,255,.12)",borderRadius:24,background:"rgba(255,255,255,.04)"}}>
          <h1 style={{fontSize:36,margin:"0 0 10px"}}>Install AQE on your device</h1>
          <p style={{opacity:.75,lineHeight:1.7}}>AQE is a Progressive Web App. Installation keeps the ecosystem available like a normal app while using the same secure AQE account and live database.</p>
          <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fit,minmax(240px,1fr))",gap:16,marginTop:24}}>
            <article style={{padding:20,borderRadius:18,background:"rgba(255,255,255,.05)"}}>
              <h2>Android</h2>
              <p style={{opacity:.75}}>Open AQE in Chrome, tap the browser menu, then choose <b>Install app</b> or <b>Add to Home screen</b>.</p>
            </article>
            <article style={{padding:20,borderRadius:18,background:"rgba(255,255,255,.05)"}}>
              <h2>Windows</h2>
              <p style={{opacity:.75}}>Open AQE in a supported desktop browser. Use the install icon in the address bar, or open the browser menu and choose <b>Install AQE</b>.</p>
            </article>
            <article style={{padding:20,borderRadius:18,background:"rgba(255,255,255,.05)"}}>
              <h2>Apple devices</h2>
              <p style={{opacity:.75}}>On iPhone or iPad, open AQE in Safari, tap <b>Share</b>, then choose <b>Add to Home Screen</b>.</p>
            </article>
          </div>
          <div style={{display:"flex",gap:12,flexWrap:"wrap",marginTop:26}}>
            <a href="/customer" style={{display:"inline-block",padding:"12px 18px",borderRadius:12,background:"#d91b67",color:"#fff",textDecoration:"none",fontWeight:700}}>Open AQE</a>
          </div>
        </section>
      </div>
    </main>
  );
}
