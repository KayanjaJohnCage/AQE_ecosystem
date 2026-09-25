"use client";

import { useEffect, useState } from "react";
import { readStoredSession } from "../../../lib/clientSession";

type Prize = {
  id: string;
  ref_code: string;
  title: string;
  invite_requirement: number;
  tier_scope: string;
  reward_type: string;
  reward_description?: string | null;
  cash_value?: number | null;
  image_url?: string | null;
  active: boolean;
  sort_order: number;
};

type Claim = {
  id: string;
  user_id: string;
  mode: string;
  status: string;
  cash_amount?: number | null;
  aqe_prizes?: { ref_code?: string; title?: string; reward_description?: string | null } | null;
};

export default function PrizeManager() {
  const [prizes, setPrizes] = useState<Prize[]>([]);
  const [claims, setClaims] = useState<Claim[]>([]);
  const [editing, setEditing] = useState<Prize | null>(null);
  const [message, setMessage] = useState("");

  const headers = () => {
    const { session, user } = readStoredSession();
    const value: HeadersInit = { "Content-Type": "application/json" };
    if (session.access_token) value.authorization = "Bearer " + session.access_token;
    if (user.id) value["x-user-id"] = user.id;
    return value;
  };

  const load = async () => {
    const h = headers();
    const [p, c] = await Promise.all([
      fetch("/api/prizes", { headers: h }),
      fetch("/api/prizes/claims", { headers: h }),
    ]);
    const pp = await p.json().catch(() => ({}));
    const cc = await c.json().catch(() => ({}));
    setPrizes(pp.prizes ?? []);
    setClaims(cc.claims ?? []);
  };

  useEffect(() => { void load(); }, []);

  async function save(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!editing) return;
    const response = await fetch("/api/prizes", {
      method: "POST",
      headers: headers(),
      body: JSON.stringify({
        id: editing.id || undefined,
        refCode: editing.ref_code,
        title: editing.title,
        inviteRequirement: editing.invite_requirement,
        tierScope: editing.tier_scope,
        rewardType: editing.reward_type,
        rewardDescription: editing.reward_description,
        cashValue: editing.cash_value ?? null,
        imageUrl: editing.image_url ?? null,
        active: editing.active,
        sortOrder: editing.sort_order,
      }),
    });
    const payload = await response.json().catch(() => ({}));
    setMessage(payload.ok ? "Prize saved." : payload.reason || "Prize save failed.");
    if (payload.ok) { setEditing(null); await load(); }
  }

  async function remove(id: string) {
    const response = await fetch("/api/prizes", {
      method: "POST", headers: headers(), body: JSON.stringify({ action: "delete", id }),
    });
    const payload = await response.json().catch(() => ({}));
    setMessage(payload.ok ? "Prize deleted." : payload.reason || "Prize deletion failed.");
    if (payload.ok) await load();
  }

  async function approveCash(claim: Claim) {
    const amount = window.prompt("Cash value to credit in UGX:", String(claim.cash_amount ?? ""));
    if (!amount) return;
    const response = await fetch("/api/prizes/claims", {
      method: "POST", headers: headers(),
      body: JSON.stringify({ action: "cash_approve", claimId: claim.id, cashAmount: Number(amount) }),
    });
    const payload = await response.json().catch(() => ({}));
    setMessage(payload.ok ? "Prize cash credited to the member wallet." : payload.reason || "Cash approval failed.");
    await load();
  }

  async function fulfill(claim: Claim) {
    const response = await fetch("/api/prizes/claims", {
      method: "POST", headers: headers(),
      body: JSON.stringify({ action: "fulfill", claimId: claim.id }),
    });
    const payload = await response.json().catch(() => ({}));
    setMessage(payload.ok ? "Prize claim marked fulfilled." : payload.reason || "Claim update failed.");
    await load();
  }

  const blank: Prize = { id: "", ref_code: "", title: "", invite_requirement: 1, tier_scope: "vip", reward_type: "physical", reward_description: "", cash_value: null, image_url: "", active: true, sort_order: prizes.length + 1 };

  return (
    <div className="manager-prize-room">
      <section className="manager-card manager-detail">
        <div className="manager-table-header">
          <div><h3>Referral prize catalogue</h3><span>Ref-1 is all-tier; Ref-2+ are VIP-only unless the admin changes the rule.</span></div>
          <button type="button" className="manager-action-button" onClick={() => setEditing(blank)}>Add prize</button>
        </div>

        {editing ? (
          <form className="manager-settings-form" onSubmit={save}>
            <label>Reference<input value={editing.ref_code} onChange={(e) => setEditing({ ...editing, ref_code: e.target.value.toUpperCase() })} required /></label>
            <label>Title<input value={editing.title} onChange={(e) => setEditing({ ...editing, title: e.target.value })} required /></label>
            <label>Invite requirement<input type="number" min="1" value={editing.invite_requirement} onChange={(e) => setEditing({ ...editing, invite_requirement: Number(e.target.value) })} required /></label>
            <label>Tier access<select value={editing.tier_scope} onChange={(e) => setEditing({ ...editing, tier_scope: e.target.value })}><option value="all">All tiers</option><option value="vip">VIP only</option></select></label>
            <label>Reward type<select value={editing.reward_type} onChange={(e) => setEditing({ ...editing, reward_type: e.target.value })}><option value="physical">Physical prize</option><option value="cash">Cash</option><option value="none">Not available</option></select></label>
            <label>Prize description<textarea value={editing.reward_description || ""} onChange={(e) => setEditing({ ...editing, reward_description: e.target.value })} /></label>
            <label>Prize cash value (UGX)<input type="number" min="0" value={editing.cash_value ?? ""} onChange={(e) => setEditing({ ...editing, cash_value: e.target.value === "" ? null : Number(e.target.value) })} /></label>
            <label>Image URL<input value={editing.image_url || ""} onChange={(e) => setEditing({ ...editing, image_url: e.target.value })} placeholder="Supabase/public image URL" /></label>
            <div className="manager-row-actions"><button type="submit">Save prize</button><button type="button" onClick={() => setEditing(null)}>Cancel</button></div>
          </form>
        ) : null}

        <div className="manager-list-table">
          {prizes.map((prize) => (
            <div className="manager-row" key={prize.id}>
              <div><strong>{prize.ref_code} · {prize.reward_description || prize.title}</strong><span>Invite {prize.invite_requirement} · {prize.tier_scope === "vip" ? "VIP" : "All tiers"}{prize.cash_value ? " · UGX " + Number(prize.cash_value).toLocaleString() : ""}</span></div>
              <div className="manager-row-actions"><button type="button" onClick={() => setEditing(prize)}>Edit</button><button type="button" onClick={() => remove(prize.id)}>Delete</button></div>
            </div>
          ))}
        </div>
      </section>

      <section className="manager-card manager-detail">
        <div className="manager-table-header"><h3>Prize requests</h3></div>
        <div className="manager-list-table">
          {claims.map((claim) => (
            <div className="manager-row" key={claim.id}>
              <div><strong>{claim.aqe_prizes?.ref_code || "Prize"} · {claim.aqe_prizes?.reward_description || claim.aqe_prizes?.title || "Reward"}</strong><span>User: {claim.user_id} · {claim.mode} · {claim.status}</span></div>
              <div className="manager-row-actions">
                {claim.mode === "cash" && claim.status === "pending" ? <button type="button" onClick={() => approveCash(claim)}>Approve cash</button> : null}
                {claim.status === "pending" || claim.status === "approved" ? <button type="button" onClick={() => fulfill(claim)}>Mark fulfilled</button> : null}
              </div>
            </div>
          ))}
          {!claims.length ? <div className="empty-panel">No prize requests yet.</div> : null}
        </div>
      </section>
      {message ? <div className="manager-review-message">{message}</div> : null}
    </div>
  );
}
