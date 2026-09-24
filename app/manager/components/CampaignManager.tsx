"use client";

import { useEffect, useState } from "react";
import { readStoredSession } from "../../../lib/clientSession";

type Campaign = { id: string; name: string; description?: string; status: string };
type RewardItem = {
  id: string; campaign_id: string; code?: string; name?: string;
  qc_amount: number; cash_amount: number; cash_currency: string;
  boost_days: number; boost_label?: string; usage_limit?: number | null;
  uses_count?: number; quantity?: number | null; claimed_count?: number;
  active: boolean;
};

export default function CampaignManager() {
  const [campaigns, setCampaigns] = useState<Campaign[]>([]);
  const [codes, setCodes] = useState<RewardItem[]>([]);
  const [packages, setPackages] = useState<RewardItem[]>([]);
  const [campaignId, setCampaignId] = useState("");
  const [form, setForm] = useState({
    name: "", description: "", code: "", packageName: "",
    qcAmount: 0, cashAmount: 0, boostDays: 0, boostLabel: "",
    usageLimit: "", quantity: "", status: "draft"
  });
  const [message, setMessage] = useState("");

  const headers = () => {
    const { session, user } = readStoredSession();
    const h: HeadersInit = { "Content-Type": "application/json" };
    if (session.access_token) h.authorization = `Bearer ${session.access_token}`;
    if (user.id) h["x-user-id"] = user.id;
    return h;
  };

  async function load() {
    const response = await fetch("/api/campaigns?manage=1", { headers: headers() });
    const payload = await response.json().catch(() => ({}));
    if (response.ok) {
      setCampaigns(payload.campaigns || []);
      setCodes(payload.codes || []);
      setPackages(payload.packages || []);
      if (!campaignId && payload.campaigns?.[0]) setCampaignId(payload.campaigns[0].id);
    }
  }

  useEffect(() => { void load(); }, []);

  async function createCampaign(event: React.FormEvent) {
    event.preventDefault();
    const response = await fetch("/api/campaigns", {
      method: "POST", headers: headers(),
      body: JSON.stringify({ action: "campaign", name: form.name, description: form.description, status: form.status })
    });
    const payload = await response.json().catch(() => ({}));
    setMessage(payload.ok ? "Campaign created." : payload.reason || "Campaign creation failed.");
    if (payload.ok) { setForm({ ...form, name: "", description: "" }); await load(); if (payload.campaign?.id) setCampaignId(payload.campaign.id); }
  }

  async function createReward(action: "code" | "package") {
    if (!campaignId) { setMessage("Create/select a campaign first."); return; }
    const response = await fetch("/api/campaigns", {
      method: "POST", headers: headers(),
      body: JSON.stringify({
        action, campaignId,
        code: action === "code" ? form.code : undefined,
        name: action === "package" ? form.packageName : undefined,
        qcAmount: form.qcAmount,
        cashAmount: form.cashAmount,
        boostDays: form.boostDays,
        boostLabel: form.boostLabel,
        usageLimit: form.usageLimit,
        quantity: form.quantity,
      })
    });
    const payload = await response.json().catch(() => ({}));
    setMessage(payload.ok ? `${action === "code" ? "Code" : "Gift package"} created.` : payload.reason || "Reward creation failed.");
    if (payload.ok) { setForm({ ...form, code: "", packageName: "" }); await load(); }
  }

  async function toggle(type: "code" | "package", id: string, active: boolean) {
    const response = await fetch("/api/campaigns", {
      method: "PATCH", headers: headers(), body: JSON.stringify({ type, id, active: !active })
    });
    const payload = await response.json().catch(() => ({}));
    setMessage(payload.ok ? "Campaign reward updated." : payload.reason || "Update failed.");
    if (payload.ok) await load();
  }

  return <div className="manager-card manager-detail">
    <div className="manager-table-header"><h3>Campaign Room</h3><span className="status-pill">QC · Cash · Boost</span></div>
    <p className="manager-subtitle">Configure exactly what every campaign code and gift package gives. Every successful redemption creates a receipt for the member.</p>

    <form className="manager-settings-form" onSubmit={createCampaign}>
      <h4>Create campaign</h4>
      <label>Campaign name<input value={form.name} onChange={e => setForm({...form,name:e.target.value})} required /></label>
      <label>Description<textarea rows={2} value={form.description} onChange={e => setForm({...form,description:e.target.value})} /></label>
      <label>Status<select value={form.status} onChange={e => setForm({...form,status:e.target.value})}><option value="draft">Draft</option><option value="active">Active</option><option value="paused">Paused</option></select></label>
      <button className="manager-action-button" type="submit">Create campaign</button>
    </form>

    {campaigns.length ? <label className="manager-settings-form">Campaign<select value={campaignId} onChange={e => setCampaignId(e.target.value)}>{campaigns.map(c => <option key={c.id} value={c.id}>{c.name} · {c.status}</option>)}</select></label> : null}

    <div className="manager-two-column">
      <form className="manager-settings-form" onSubmit={e => { e.preventDefault(); void createReward("code"); }}>
        <h4>Create code</h4>
        <label>Code<input value={form.code} onChange={e => setForm({...form,code:e.target.value.toUpperCase()})} placeholder="AQE100" required /></label>
        <label>QC amount<input type="number" min="0" value={form.qcAmount} onChange={e => setForm({...form,qcAmount:Number(e.target.value)})} /></label>
        <label>Cash amount (UGX)<input type="number" min="0" value={form.cashAmount} onChange={e => setForm({...form,cashAmount:Number(e.target.value)})} /></label>
        <label>Boost time (days)<input type="number" min="0" max="365" value={form.boostDays} onChange={e => setForm({...form,boostDays:Number(e.target.value)})} /></label>
        <label>Boost label<input value={form.boostLabel} onChange={e => setForm({...form,boostLabel:e.target.value})} placeholder="Campaign Winner" /></label>
        <label>Usage limit<input type="number" min="1" value={form.usageLimit} onChange={e => setForm({...form,usageLimit:e.target.value})} placeholder="Unlimited" /></label>
        <button className="manager-action-button" type="submit">Add code</button>
      </form>

      <form className="manager-settings-form" onSubmit={e => { e.preventDefault(); void createReward("package"); }}>
        <h4>Create gift package</h4>
        <label>Package name<input value={form.packageName} onChange={e => setForm({...form,packageName:e.target.value})} placeholder="VIP Love Package" required /></label>
        <label>QC amount<input type="number" min="0" value={form.qcAmount} onChange={e => setForm({...form,qcAmount:Number(e.target.value)})} /></label>
        <label>Cash amount (UGX)<input type="number" min="0" value={form.cashAmount} onChange={e => setForm({...form,cashAmount:Number(e.target.value)})} /></label>
        <label>Boost time (days)<input type="number" min="0" max="365" value={form.boostDays} onChange={e => setForm({...form,boostDays:Number(e.target.value)})} /></label>
        <label>Boost label<input value={form.boostLabel} onChange={e => setForm({...form,boostLabel:e.target.value})} placeholder="Appreciation Boost" /></label>
        <label>Package quantity<input type="number" min="1" value={form.quantity} onChange={e => setForm({...form,quantity:e.target.value})} placeholder="Unlimited" /></label>
        <button className="manager-action-button" type="submit">Add gift package</button>
      </form>
    </div>

    {message ? <div className="manager-review-message">{message}</div> : null}

    <div className="manager-list-table">
      {codes.map(item => <div className="manager-row" key={item.id}><div><strong>{item.code}</strong><span>{item.qc_amount} QC · {item.cash_currency} {Number(item.cash_amount).toLocaleString()} · {item.boost_days} day boost</span></div><div className="manager-row-actions"><em>{item.uses_count || 0}{item.usage_limit ? `/${item.usage_limit}` : ""}</em><button type="button" onClick={() => void toggle("code",item.id,item.active)}>{item.active ? "Disable" : "Enable"}</button></div></div>)}
      {packages.map(item => <div className="manager-row" key={item.id}><div><strong>{item.name}</strong><span>{item.qc_amount} QC · {item.cash_currency} {Number(item.cash_amount).toLocaleString()} · {item.boost_days} day boost</span></div><div className="manager-row-actions"><em>{item.claimed_count || 0}{item.quantity ? `/${item.quantity}` : ""}</em><button type="button" onClick={() => void toggle("package",item.id,item.active)}>{item.active ? "Disable" : "Enable"}</button></div></div>)}
    </div>
  </div>;
}
