"use client";

import { useEffect, useState } from "react";
import { readStoredSession } from "../../lib/clientSession";

type Prize = {
  id: string;
  ref_code: string;
  title: string;
  invite_requirement: number;
  tier_scope: "all" | "vip";
  reward_type: "physical" | "cash" | "none";
  reward_description?: string | null;
  cash_value?: number | null;
  image_url?: string | null;
  eligible: boolean;
  lockedReason?: string | null;
  claim?: { mode: string; status: string; cash_amount?: number | null } | null;
};

export function PrizesScreen() {
  const [prizes, setPrizes] = useState<Prize[]>([]);
  const [tier, setTier] = useState("basic");
  const [inviteCount, setInviteCount] = useState(0);
  const [feedback, setFeedback] = useState("");
  const [busy, setBusy] = useState("");

  const load = async () => {
    const { session, user } = readStoredSession();
    const headers: HeadersInit = {};
    if (session.access_token) headers.authorization = "Bearer " + session.access_token;
    if (user.id) headers["x-user-id"] = user.id;
    const response = await fetch("/api/prizes", { headers });
    const payload = await response.json().catch(() => ({}));
    if (response.ok) {
      setPrizes(payload.prizes ?? []);
      setTier(payload.tier ?? "basic");
      setInviteCount(Number(payload.inviteCount ?? 0));
    } else setFeedback(payload.reason || "Prize room unavailable.");
  };

  useEffect(() => { void load(); }, []);

  async function claim(prizeId: string, mode: "physical" | "cash") {
    setBusy(prizeId + mode);
    setFeedback("");
    try {
      const { session, user } = readStoredSession();
      const headers: HeadersInit = { "Content-Type": "application/json" };
      if (session.access_token) headers.authorization = "Bearer " + session.access_token;
      if (user.id) headers["x-user-id"] = user.id;
      const response = await fetch("/api/prizes/claims", {
        method: "POST", headers,
        body: JSON.stringify({ prizeId, mode }),
      });
      const payload = await response.json().catch(() => ({}));
      setFeedback(response.ok ? (mode === "cash" ? "Cash conversion request sent to the manager." : "Prize request sent to the manager.") : (payload.reason || "Prize request failed."));
      if (response.ok) await load();
    } finally { setBusy(""); }
  }

  return (
    <section className="aqe-prizes-room">
      <div className="section-heading">
        <div>
          <span className="eyebrow">REFERRAL PRIZES</span>
          <h2>Unlock your rewards</h2>
        </div>
        <span className="status-pill">{inviteCount} direct invites</span>
      </div>
      <p className="screen-intro">Ref-1 is available across all tier levels. Ref-2 and above are VIP-only. If you prefer not to take a physical prize, request a cash conversion and the manager will set the applicable prize value.</p>

      <div className="aqe-prize-grid">
        {prizes.map((prize) => {
          const claimed = Boolean(prize.claim);
          return (
            <article key={prize.id} className={`aqe-prize-card ${prize.eligible ? "eligible" : "locked"}`}>
              <div className="aqe-prize-image">
                {prize.image_url ? <img src={prize.image_url} alt={prize.reward_description || prize.title} /> : <span><i className="fas fa-gift" /></span>}
                {prize.tier_scope === "vip" ? <b>VIP</b> : <b>ALL TIERS</b>}
              </div>
              <div className="aqe-prize-body">
                <span className="eyebrow">{prize.ref_code}</span>
                <h3>{prize.reward_description || prize.title}</h3>
                <strong>Invite {prize.invite_requirement} members</strong>
                {!prize.eligible ? <small><i className="fas fa-lock" /> {prize.lockedReason}</small> : null}
                {prize.eligible && prize.reward_type === "none" ? <small>Not available</small> : null}
                {claimed ? (
                  <div className="aqe-prize-claim-status">Request: {prize.claim?.status} {prize.claim?.cash_amount ? `• UGX ${Number(prize.claim.cash_amount).toLocaleString()}` : ""}</div>
                ) : prize.eligible && prize.reward_type !== "none" ? (
                  <div className="aqe-prize-actions">
                    <button type="button" disabled={busy === prize.id + "physical"} onClick={() => claim(prize.id, "physical")}>Request prize</button>
                    <button type="button" disabled={busy === prize.id + "cash"} onClick={() => claim(prize.id, "cash")}>Request cash</button>
                  </div>
                ) : null}
              </div>
            </article>
          );
        })}
      </div>
      {feedback ? <div className="manager-review-message">{feedback}</div> : null}
      {!prizes.length ? <div className="empty-panel">No active prizes are configured yet.</div> : null}
    </section>
  );
}
