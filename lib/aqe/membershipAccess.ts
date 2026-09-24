import { createServerSupabaseClient } from "../supabaseServer";
import { normalizeTier, type AqeTier } from "./auth";

export type MembershipAccess = {
  userId: string;
  tier: AqeTier;
  membershipStatus: "registered" | "upgraded";
  isUpgradedMember: boolean;
};

export async function getMembershipAccess(
  userId: string,
): Promise<MembershipAccess | null> {
  const client = createServerSupabaseClient();
  if (!client) return null;
  const { data, error } = await client
    .from("profiles")
    .select("user_id,tier,membership_status")
    .eq("user_id", userId)
    .maybeSingle();

  if (error) throw new Error(error.message);
  if (!data) return null;

  const membershipStatus =
    data.membership_status === "upgraded" ? "upgraded" : "registered";

  return {
    userId: data.user_id,
    tier: normalizeTier(data.tier),
    membershipStatus,
    isUpgradedMember: membershipStatus === "upgraded",
  };
}
