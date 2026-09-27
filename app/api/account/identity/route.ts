import { NextResponse } from "next/server";
import { requireAuthenticatedRoleAccess, resolveMutationUserId } from "../../../../lib/aqe/auth";
import { createServerSupabaseClient } from "../../../../lib/supabaseServer";

const SEVEN_DAYS = 7 * 24 * 60 * 60 * 1000;

export async function GET(request: Request) {
  try {
    const identity = await resolveMutationUserId(request);
    if (!identity.ok) return NextResponse.json({ ok: false, reason: identity.reason }, { status: 401 });
    const client = createServerSupabaseClient();
    if (!client) return NextResponse.json({ ok: true, canChangeIdentity: true, nextChangeAt: null });
    const { data, error } = await client.from("profiles").select("display_name,identity_last_changed_at").eq("user_id",identity.userId).maybeSingle();
    if (error) return NextResponse.json({ ok:false, reason:error.message }, { status:500 });
    const last = data?.identity_last_changed_at ? new Date(data.identity_last_changed_at).getTime() : 0;
    const next = last ? last + SEVEN_DAYS : 0;
    return NextResponse.json({ ok:true, userId:identity.userId, displayName:data?.display_name||"", canChangeIdentity:!next || Date.now()>=next, nextChangeAt:next ? new Date(next).toISOString() : null });
  } catch (error) {
    return NextResponse.json({ ok:false, reason:error instanceof Error?error.message:"Account identity status failed." }, { status:500 });
  }
}

export async function PATCH(request: Request) {
  try {
    const body = await request.json().catch(() => ({}));
    const requestedTarget = String(body.userId ?? "").trim();
    const manager = await requireAuthenticatedRoleAccess(request, ["manager","admin"]);
    let userId = "";
    let managerOverride = false;
    if (manager.ok && requestedTarget) {
      userId = requestedTarget;
      managerOverride = true;
    } else {
      const identity = await resolveMutationUserId(request);
      if (!identity.ok) return NextResponse.json({ ok:false, reason:identity.reason }, { status:401 });
      userId = identity.userId;
    }

    const client = createServerSupabaseClient();
    if (!client) return NextResponse.json({ ok:false, reason:"Account service is not configured." }, { status:503 });

    const { data: profile } = await client.from("profiles").select("display_name,identity_last_changed_at").eq("user_id",userId).maybeSingle();
    const last = profile?.identity_last_changed_at ? new Date(profile.identity_last_changed_at).getTime() : 0;
    const next = last ? last + SEVEN_DAYS : 0;
    if (!managerOverride && next && Date.now() < next) {
      return NextResponse.json({ ok:false, reason:"Account name, email and password can be changed once every 7 days. Use Manager Troubleshoot for an earlier change at 5 QC.", nextChangeAt:new Date(next).toISOString(), requiresTroubleshoot:true }, { status:409 });
    }

    const displayName = typeof body.displayName === "string" ? body.displayName.trim() : "";
    const email = typeof body.email === "string" ? body.email.trim().toLowerCase() : "";
    const password = typeof body.password === "string" ? body.password : "";
    const authUpdates: Record<string, unknown> = {};
    if (email) authUpdates.email = email;
    if (password) {
      if (password.length < 8) return NextResponse.json({ ok:false, reason:"Password must be at least 8 characters." }, { status:400 });
      authUpdates.password = password;
    }
    if (Object.keys(authUpdates).length) {
      const { error } = await client.auth.admin.updateUserById(userId, authUpdates);
      if (error) return NextResponse.json({ ok:false, reason:error.message }, { status:400 });
    }

    if (displayName || Object.keys(authUpdates).length) {
      const { error } = await client.from("profiles").update({
        ...(displayName ? { display_name:displayName } : {}),
        ...(managerOverride || !next || Date.now() >= next ? { identity_last_changed_at:new Date().toISOString() } : {}),
        updated_at:new Date().toISOString(),
      }).eq("user_id",userId);
      if (error) return NextResponse.json({ ok:false, reason:error.message }, { status:500 });
    }

    return NextResponse.json({ ok:true, saved:true, managerOverride });
  } catch (error) {
    return NextResponse.json({ ok:false, reason:error instanceof Error?error.message:"Account identity update failed." }, { status:400 });
  }
}
