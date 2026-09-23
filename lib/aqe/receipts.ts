import { createServerSupabaseClient } from "../supabaseServer";

export async function getUserReceipts(userId: string, limit = 100) {
  const client = createServerSupabaseClient();
  if (!client) return { ok: false as const, reason: "Supabase is not configured." };
  const { data, error } = await client
    .from("transaction_receipts")
    .select("id,receipt_number,user_id,transaction_type,source,reference_id,amount,currency,qc_amount,cash_amount,boost_days,balance_before,balance_after,status,description,metadata,created_at")
    .eq("user_id", userId)
    .order("created_at", { ascending: false })
    .limit(Math.min(Math.max(limit, 1), 200));
  if (error) return { ok: false as const, reason: error.message };
  return { ok: true as const, receipts: data ?? [] };
}
