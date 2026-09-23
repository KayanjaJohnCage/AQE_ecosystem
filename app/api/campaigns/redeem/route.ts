import { NextResponse } from "next/server";
import { resolveAuthenticatedSession } from "../../../lib/aqe/auth";
import { createServerSupabaseClient } from "../../../lib/supabaseServer";

export async function POST(request: Request) {
  try {
    const session = await resolveAuthenticatedSession(request);
    if (!session.authenticated || !session.userId) return NextResponse.json({ ok: false, reason: "Authentication required." }, { status: 401 });
    const body = await request.json().catch(() => ({}));
    const client = createServerSupabaseClient();
    if (!client) return NextResponse.json({ ok: false, reason: "Campaign rewards are unavailable." }, { status: 503 });

    let result;
    if (body.code) {
      result = await client.rpc("redeem_campaign_code", { p_user_id: session.userId, p_code: String(body.code) });
    } else if (body.packageId) {
      result = await client.rpc("redeem_campaign_package", { p_user_id: session.userId, p_package_id: String(body.packageId) });
    } else {
      return NextResponse.json({ ok: false, reason: "Enter a campaign code or select a gift package." }, { status: 400 });
    }
    if (result.error) return NextResponse.json({ ok: false, reason: result.error.message }, { status: 400 });
    return NextResponse.json(result.data);
  } catch (error) {
    return NextResponse.json({ ok: false, reason: error instanceof Error ? error.message : "Campaign redemption failed." }, { status: 500 });
  }
}
