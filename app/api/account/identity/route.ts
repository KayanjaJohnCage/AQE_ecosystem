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
    const phone = typeof body.phone === "string" ? body.phone.trim() : "";
    const email = typeof body.email === "string" ? body.email.trim().toLowerCase() : "";
    const password = typeof body.password === "string" ? body.password : "";
    const authUpdates: { email?: string; password?: string } = {};
    if (email) authUpdates.email = email;
    if (password) {
      if (password.length < 8) return NextResponse.json({ ok:false, reason:"Password must be at least 8 characters." }, { status:400 });
      authUpdates.password = password;
    }
    if (authUpdates.email) {
      const requestedEmail = authUpdates.email.toLowerCase();
      try {
        for (let page = 1; page <= 20; page += 1) {
          const listed = await client.auth.admin.listUsers({ page, perPage: 1000 });
          if (listed.error) break;
          const duplicateEmail = (listed.data.users ?? []).some(
            (user) =>
              user.id !== userId &&
              String(user.email ?? "").trim().toLowerCase() === requestedEmail,
          );
          if (duplicateEmail) {
            return NextResponse.json(
              { ok:false, reason:"That email address is already registered. Use a different email address." },
              { status:409 },
            );
          }
          if ((listed.data.users ?? []).length < 1000) break;
        }
      } catch (emailLookupError) {
        console.warn("[AQE identity] duplicate-email precheck unavailable", emailLookupError);
      }
    }

    if (Object.keys(authUpdates).length) {
      const { error } = await client.auth.admin.updateUserById(userId, authUpdates);
      if (error) {
        if (authUpdates.email && /already.*registered|already.*exists|duplicate/i.test(error.message || "")) {
          return NextResponse.json({ ok:false, reason:"That email address is already registered. Use a different email address." }, { status:409 });
        }
        return NextResponse.json({ ok:false, reason:error.message }, { status:400 });
      }
    }

    if (phone) {
      const existing = await client
        .from("profiles")
        .select("user_id,phone")
        .neq("user_id", userId)
        .not("phone", "is", null)
        .neq("phone", "")
        .limit(1000);
      if (existing.error) return NextResponse.json({ ok:false, reason:existing.error.message }, { status:500 });
      const normalizedPhone = phone.replace(/[^0-9]/g, "");
      const duplicate = (existing.data ?? []).some(
        (row) => normalizedPhone && normalizedPhone === String(row.phone ?? "").replace(/[^0-9]/g, ""),
      );
      if (duplicate) return NextResponse.json({ ok:false, reason:"That phone number is already registered. Use a different phone number." }, { status:409 });
    }

    if (displayName || phone || Object.keys(authUpdates).length) {
      const { error } = await client.from("profiles").update({
        ...(displayName ? { display_name:displayName } : {}),
        ...(phone ? { phone } : {}),
        ...(managerOverride || !next || Date.now() >= next ? { identity_last_changed_at:new Date().toISOString() } : {}),
        updated_at:new Date().toISOString(),
      }).eq("user_id",userId);
      if (error) {
        if (error.code === "23505" && /phone/i.test(error.message || "")) {
          return NextResponse.json({ ok:false, reason:"That phone number is already registered. Use a different phone number." }, { status:409 });
        }
        return NextResponse.json({ ok:false, reason:error.message }, { status:500 });
      }
    }

    return NextResponse.json({ ok:true, saved:true, managerOverride });
  } catch (error) {
    return NextResponse.json({ ok:false, reason:error instanceof Error?error.message:"Account identity update failed." }, { status:400 });
  }
}
