import { createServerSupabaseClient } from "../supabaseServer";

export type VerificationStatus =
  | "pending"
  | "approved"
  | "rejected"
  | "resubmission_required";

export function decideVerification({
  approved,
  notes,
}: {
  approved: boolean;
  notes?: string;
}) {
  if (approved) {
    return {
      ok: true,
      status: "approved" as VerificationStatus,
      notes: notes ?? "Verification approved.",
    };
  }

  return {
    ok: true,
    status: "rejected" as VerificationStatus,
    notes:
      notes ?? "Verification rejected. Please resubmit required documents.",
  };
}

export async function persistVerificationDecision({
  targetUserId,
  approved,
  notes,
}: {
  targetUserId: string;
  approved: boolean;
  notes?: string;
}) {
  const client = createServerSupabaseClient();
  const decision = decideVerification({ approved, notes });

  if (!client)
    return { ok: true, saved: false, source: "memory", verification: decision };

  const { data, error } = await client
    .from("profiles")
    .update({
      verification_status: decision.status,
      updated_at: new Date().toISOString(),
    })
    .eq("user_id", targetUserId)
    .select("user_id, verification_status, updated_at")
    .single();

  if (error || !data) {
    return {
      ok: false,
      saved: false,
      source: "supabase",
      reason: error?.message ?? "Verification decision could not be saved.",
    };
  }

  return {
    ok: true,
    saved: true,
    source: "supabase",
    verification: { ...decision, profile: data },
  };
}
