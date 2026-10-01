import { NextResponse } from "next/server";
import { resolveMutationUserId } from "../../../../lib/aqe/auth";
import { getAqeEntitlements } from "../../../../lib/aqe/access";
import { createServerSupabaseClient } from "../../../../lib/supabaseServer";

export async function GET(request: Request) {
  const identity = await resolveMutationUserId(request);
  if (!identity.ok) return NextResponse.json({ ok:false, reason:identity.reason }, {status:401});
  const client = createServerSupabaseClient();
  if (!client) return NextResponse.json({ok:true,source:"memory",...getAqeEntitlements("free")});
  const {data,error}=await client.from("profiles").select("tier,verification_status").eq("user_id",identity.userId).maybeSingle();
  if(error) return NextResponse.json({ok:false,reason:error.message},{status:500});
  const tier = data?.verification_status === "approved" ? data?.tier : "free";
  return NextResponse.json({ok:true,source:"supabase",...getAqeEntitlements(tier)});
}
