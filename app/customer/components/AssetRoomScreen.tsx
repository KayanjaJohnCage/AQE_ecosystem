"use client";

import { useEffect, useState } from "react";

type Props = {
  currency: string;
  onUpgrade: () => void;
  tier: string;
  walletBalance: number;
};

type AssetData = {
  configured: boolean;
  locked: boolean;
  currency: string;
  directInvites: number;
  salaryBalance: number;
  withdrawnSalaryTotal: number;
  walletBalance: number;
  pendingWallet: number;
  netWorth: number;
  salaryWithdrawable: boolean;
  salaryPerInvite?: number;
};

export function AssetRoomScreen({ currency, onUpgrade, tier }: Props) {
  const unlockedTier = tier === "vip";
  const [data, setData] = useState<AssetData | null>(null);
  const [pin, setPin] = useState("");
  const [currentPin, setCurrentPin] = useState("");
  const [newPin, setNewPin] = useState("");
  const [feedback, setFeedback] = useState("");
  const [busy, setBusy] = useState(false);
  const [token, setToken] = useState("");

  const load = async (sessionToken = token) => {
    const response = await fetch("/api/asset-room", {
      headers: sessionToken ? { "x-asset-room-token": sessionToken } : {},
    });
    const payload = await response.json().catch(() => ({}));
    if (response.ok) setData(payload);
    else {
      setFeedback(payload.reason || "Asset Room could not be loaded.");
      setData((previous) => previous ? { ...previous, locked: true } : null);
    }
  };

  useEffect(() => {
    if (!unlockedTier) return;
    const stored = sessionStorage.getItem("aqe-asset-room-token") || "";
    setToken(stored);
    void load(stored);
  }, [unlockedTier]);

  if (!unlockedTier) {
    return (
      <div className="prototype-screen-stack">
        <article className="asset-room-hero">
          <span className="asset-room-lock">LOCKED</span>
          <span className="eyebrow">PRIVATE ASSET ROOM</span>
          <h2>VIP Asset Room</h2>
          <p>Set and protect your VIP assets, salary and net worth inside a private PIN-locked room.</p>
          <button type="button" onClick={onUpgrade}>Upgrade to VIP</button>
        </article>
      </div>
    );
  }

  const unlocked = Boolean(token && data && !data.locked);
  const displayCurrency = data?.currency || currency;
  const salaryPerInvite = Number(data?.salaryPerInvite ?? 10000);

  async function post(action: string, body: Record<string, unknown> = {}) {
    setBusy(true);
    setFeedback("");
    try {
      const response = await fetch("/api/asset-room", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(token ? { "x-asset-room-token": token } : {}),
        },
        body: JSON.stringify({ action, ...body }),
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) {
        setFeedback(payload.reason || "Asset Room action failed.");
        return;
      }
      if (action === "unlock" && payload.token) {
        sessionStorage.setItem("aqe-asset-room-token", payload.token);
        setToken(payload.token);
        await load(payload.token);
        setPin("");
        setFeedback("Asset Room unlocked for 15 minutes.");
      } else if (action === "set_pin") {
        setNewPin("");
        setCurrentPin("");
        setFeedback(payload.message || "Asset Room PIN saved.");
        await load(token);
      } else if (action === "withdraw_salary") {
        setFeedback("VIP salary moved from the Asset Room to your cash wallet.");
        await load(token);
      }
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="prototype-screen-stack">
      <article className="asset-room-hero">
        <span className="asset-room-lock">{unlocked ? "UNLOCKED" : "PIN LOCKED"}</span>
        <span className="eyebrow">PRIVATE VIP ASSET ROOM</span>
        <h2>Your net worth</h2>
        {!data?.configured ? (
          <>
            <p>Set a 4–6 digit PIN before your financial assets can be viewed here.</p>
            <div className="asset-room-pin-form">
              <input inputMode="numeric" maxLength={6} value={newPin} onChange={(e) => setNewPin(e.target.value.replace(/\D/g, ""))} placeholder="Create PIN" type="password" />
              <button type="button" disabled={busy} onClick={() => post("set_pin", { pin: newPin })}>Set PIN</button>
            </div>
          </>
        ) : !unlocked ? (
          <>
            <p>Your Asset Room is protected. Enter your PIN to view net worth and salary.</p>
            <div className="asset-room-pin-form">
              <input inputMode="numeric" maxLength={6} value={pin} onChange={(e) => setPin(e.target.value.replace(/\D/g, ""))} placeholder="Asset Room PIN" type="password" />
              <button type="button" disabled={busy} onClick={() => post("unlock", { pin })}>Unlock</button>
            </div>
          </>
        ) : (
          <>
            <strong>{displayCurrency} {Number(data?.netWorth ?? 0).toLocaleString()}</strong>
            <small>Wallet + pending wallet + VIP salary assets</small>
          </>
        )}
        {feedback ? <div className="asset-room-feedback">{feedback}</div> : null}
      </article>

      {unlocked && data ? (
        <>
          <div className="asset-room-balance-grid">
            <div><span>Cash wallet</span><strong>{displayCurrency} {data.walletBalance.toLocaleString()}</strong></div>
            <div><span>VIP salary</span><strong>{displayCurrency} {data.salaryBalance.toLocaleString()}</strong><small>{displayCurrency} {salaryPerInvite.toLocaleString()} per direct invite</small></div>
            <div><span>Direct invites</span><strong>{data.directInvites}</strong><small>Salary basis</small></div>
          </div>

          <section className="asset-room-salary-card">
            <div>
              <span className="eyebrow">VIP SALARY</span>
              <h3>Monthly invite salary</h3>
              <p>This salary is separate from direct and indirect referral earnings.</p>
            </div>
            <button type="button" disabled={busy || !data.salaryWithdrawable || data.salaryBalance <= 0} onClick={() => post("withdraw_salary")}>
              {data.salaryWithdrawable ? "Withdraw salary to wallet" : "Available from 20th"}
            </button>
          </section>

          <section className="asset-room-pin-card">
            <h3>Change Asset Room PIN</h3>
            <div className="asset-room-pin-form">
              <input inputMode="numeric" maxLength={6} value={currentPin} onChange={(e) => setCurrentPin(e.target.value.replace(/\D/g, ""))} placeholder="Current PIN" type="password" />
              <input inputMode="numeric" maxLength={6} value={newPin} onChange={(e) => setNewPin(e.target.value.replace(/\D/g, ""))} placeholder="New PIN" type="password" />
              <button type="button" disabled={busy} onClick={() => post("set_pin", { currentPin, pin: newPin })}>Change PIN</button>
            </div>
          </section>
        </>
      ) : null}
    </div>
  );
}
