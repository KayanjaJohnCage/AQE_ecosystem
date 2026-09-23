"use client";

import { useEffect, useState } from "react";
import { readStoredSession } from "../../../lib/clientSession";

type Tier = "basic" | "premium" | "vip";

type Limits = Record<Tier, {
  imagesPerMonth: number;
  videosPerMonth: number;
  maxImageSizeMB: number;
  maxVideoSizeMB: number;
}>;

type ManagerProfile = { userId?: string; name?: string; city?: string; tier?: string };

const defaultLimits: Limits = {
  basic: { imagesPerMonth: 10, videosPerMonth: 2, maxImageSizeMB: 5, maxVideoSizeMB: 75 },
  premium: { imagesPerMonth: 30, videosPerMonth: 10, maxImageSizeMB: 8, maxVideoSizeMB: 100 },
  vip: { imagesPerMonth: 100, videosPerMonth: 30, maxImageSizeMB: 12, maxVideoSizeMB: 150 },
};

export default function ProfileBoostManager() {
  const [limits, setLimits] = useState<Limits>(defaultLimits);
  const [profiles, setProfiles] = useState<ManagerProfile[]>([]);
  const [userId, setUserId] = useState("");
  const [durationDays, setDurationDays] = useState(7);
  const [source, setSource] = useState("manager");
  const [reason, setReason] = useState("");
  const [label, setLabel] = useState("AQE Profile Boost");
  const [feedback, setFeedback] = useState("");
  const [saving, setSaving] = useState(false);

  const headers = () => {
    const { session, user } = readStoredSession();
    const value: HeadersInit = { "Content-Type": "application/json" };
    if (session.access_token) value.authorization = "Bearer " + session.access_token;
    if (user.id) value["x-user-id"] = user.id;
    return value;
  };

  useEffect(() => {
    const h = headers();
    Promise.all([
      fetch("/api/settings").then((r) => r.json()),
      fetch("/api/profiles?limit=100").then((r) => r.json()),
    ]).then(([settingsPayload, profilesPayload]) => {
      if (settingsPayload?.settings?.mediaLimits) setLimits(settingsPayload.settings.mediaLimits);
      if (Array.isArray(profilesPayload?.profiles)) setProfiles(profilesPayload.profiles);
    }).catch(() => setFeedback("Could not load media and boost settings."));
  }, []);

  async function saveLimits() {
    setSaving(true);
    setFeedback("");
    try {
      const response = await fetch("/api/settings", {
        method: "PATCH",
        headers: headers(),
        body: JSON.stringify({ mediaLimits: limits }),
      });
      const payload = await response.json().catch(() => ({}));
      setFeedback(response.ok ? "Media limits saved." : payload.reason || "Could not save media limits.");
    } finally {
      setSaving(false);
    }
  }

  async function grant() {
    if (!userId) {
      setFeedback("Select a profile first.");
      return;
    }
    setSaving(true);
    setFeedback("");
    try {
      const response = await fetch("/api/profile-boosts", {
        method: "POST",
        headers: headers(),
        body: JSON.stringify({ userId, durationDays, source, label, reason }),
      });
      const payload = await response.json().catch(() => ({}));
      setFeedback(response.ok ? "Profile boost granted successfully." : payload.reason || "Could not grant boost.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <section className="manager-panel">
      <div className="manager-section-heading">
        <div>
          <span className="manager-eyebrow">MEDIA & PROFILE VISIBILITY</span>
          <h2>Media Limits & Profile Boosts</h2>
          <p>Control monthly media allowances and give selected members extra visibility.</p>
        </div>
      </div>

      <div className="manager-card-grid">
        {(["basic", "premium", "vip"] as Tier[]).map((tier) => (
          <div className="manager-card" key={tier}>
            <h3>{tier.toUpperCase()}</h3>
            <label>Images / month
              <input type="number" min="0" value={limits[tier].imagesPerMonth}
                onChange={(e) => setLimits((current) => ({ ...current, [tier]: { ...current[tier], imagesPerMonth: Number(e.target.value) } }))} />
            </label>
            <label>Videos / month
              <input type="number" min="0" value={limits[tier].videosPerMonth}
                onChange={(e) => setLimits((current) => ({ ...current, [tier]: { ...current[tier], videosPerMonth: Number(e.target.value) } }))} />
            </label>
            <label>Max image size (MB)
              <input type="number" min="1" step="0.5" value={limits[tier].maxImageSizeMB}
                onChange={(e) => setLimits((current) => ({ ...current, [tier]: { ...current[tier], maxImageSizeMB: Number(e.target.value) } }))} />
            </label>
            <label>Max video size (MB)
              <input type="number" min="1" step="1" value={limits[tier].maxVideoSizeMB}
                onChange={(e) => setLimits((current) => ({ ...current, [tier]: { ...current[tier], maxVideoSizeMB: Number(e.target.value) } }))} />
            </label>
          </div>
        ))}
      </div>

      <button className="primary-button" type="button" disabled={saving} onClick={saveLimits}>
        Save media limits
      </button>

      <div className="manager-card" style={{ marginTop: 24 }}>
        <span className="manager-eyebrow">APPRECIATION & REWARDS</span>
        <h3>Grant a profile boost</h3>
        <p>Boosts are time-based and automatically expire. Reward, task and campaign systems can use the same boost engine.</p>
        <div className="registration-grid">
          <label>Member
            <select className="auth-input" value={userId} onChange={(e) => setUserId(e.target.value)}>
              <option value="">Select member</option>
              {profiles.map((profile) => (
                <option key={profile.userId} value={profile.userId}>
                  {(profile.name || "AQE Member") + " · " + (profile.tier || "basic").toUpperCase() + " · " + (profile.city || "")}
                </option>
              ))}
            </select>
          </label>
          <label>Duration
            <select className="auth-input" value={durationDays} onChange={(e) => setDurationDays(Number(e.target.value))}>
              <option value={1}>Daily · 1 day</option>
              <option value={7}>Weekly · 7 days</option>
              <option value={30}>Monthly · 30 days</option>
            </select>
          </label>
        </div>
        <div className="registration-grid">
          <label>Source
            <select className="auth-input" value={source} onChange={(e) => setSource(e.target.value)}>
              <option value="manager">Manager appreciation</option>
              <option value="reward">Reward</option>
              <option value="task">VIP task</option>
              <option value="campaign">Campaign</option>
              <option value="purchase">Paid boost</option>
            </select>
          </label>
          <label>Label
            <input className="auth-input" value={label} onChange={(e) => setLabel(e.target.value)} />
          </label>
        </div>
        <label>Reason / appreciation note
          <textarea className="auth-input" rows={3} value={reason} onChange={(e) => setReason(e.target.value)} placeholder="Optional message for the member" />
        </label>
        <button className="primary-button" type="button" disabled={saving} onClick={grant}>
          Grant boost
        </button>
      </div>

      {feedback ? <div className="auth-message">{feedback}</div> : null}
    </section>
  );
}
