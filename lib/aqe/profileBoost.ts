import { createServerSupabaseClient } from "../supabaseServer";

export type ProfileBoostSource = "manager" | "purchase" | "reward" | "task" | "campaign";

export async function grantProfileBoost(input: {
  userId: string;
  source: ProfileBoostSource;
  durationDays: number;
  grantedBy?: string;
  label?: string;
  reason?: string;
  metadata?: Record<string, unknown>;
}) {
  const client = createServerSupabaseClient();
  if (!client) return { ok: false, reason: "Boost service is unavailable." };

  const { data, error } = await client.rpc("grant_profile_boost", {
    p_user_id: input.userId,
    p_source: input.source,
    p_duration_days: input.durationDays,
    p_granted_by: input.grantedBy ?? null,
    p_label: input.label ?? null,
    p_reason: input.reason ?? null,
    p_metadata: input.metadata ?? {},
  });

  if (error) return { ok: false, reason: error.message };
  return { ok: true, boost: data };
}

export function isActiveBoost(expiresAt?: string | null) {
  return Boolean(expiresAt && new Date(expiresAt).getTime() > Date.now());
}
