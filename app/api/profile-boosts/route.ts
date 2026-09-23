import { NextResponse } from "next/server";
import { requireAuthenticatedRoleAccess, resolveMutationUserId } from "../../../lib/aqe/auth";
import { grantProfileBoost, type ProfileBoostSource } from "../../../lib/aqe/profileBoost";
import { createServerSupabaseClient } from "../../../lib/supabaseServer";

const sources: ProfileBoostSource[] = ["manager", "purchase", "reward", "task", "campaign"];

export async function GET(request: Request) {
  try {
    const identity = await resolveMutationUserId(request);
    if (!identity.ok) return NextResponse.json({ ok: false, reason: identity.reason }, { status: 401 });

    const client = createServerSupabaseClient();
    if (!client) return NextResponse.json({ ok: true, boosts: [] });

    const { data, error } = await client
      .from("profile_boosts")
      .select("id,user_id,source,duration_days,starts_at,expires_at,status,label,reason,created_at")
      .eq("user_id", identity.userId)
      .order("created_at", { ascending: false });

    if (error) return NextResponse.json({ ok: false, reason: error.message }, { status: 500 });

    return NextResponse.json({
      ok: true,
      boosts: (data ?? []).map((boost) => ({
        id: boost.id,
        userId: boost.user_id,
        source: boost.source,
        durationDays: boost.duration_days,
        startsAt: boost.starts_at,
        expiresAt: boost.expires_at,
        status: boost.status,
        label: boost.label,
        reason: boost.reason,
        createdAt: boost.created_at,
      })),
    });
  } catch (error) {
    return NextResponse.json({ ok: false, reason: error instanceof Error ? error.message : "Boosts unavailable." }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    const access = await requireAuthenticatedRoleAccess(request, ["manager", "admin"]);
    if (!access.ok) return NextResponse.json({ ok: false, reason: access.reason }, { status: 403 });

    const body = await request.json().catch(() => ({}));
    const userId = String(body.userId ?? "").trim();
    const source = String(body.source ?? "manager") as ProfileBoostSource;
    const durationDays = Number(body.durationDays);
    const label = String(body.label ?? "AQE Profile Boost").trim();
    const reason = String(body.reason ?? "").trim();

    if (!userId) return NextResponse.json({ ok: false, reason: "A profile user ID is required." }, { status: 400 });
    if (!sources.includes(source)) return NextResponse.json({ ok: false, reason: "Invalid boost source." }, { status: 400 });
    if (!Number.isInteger(durationDays) || durationDays < 1 || durationDays > 365) {
      return NextResponse.json({ ok: false, reason: "Boost duration must be between 1 and 365 days." }, { status: 400 });
    }

    const result = await grantProfileBoost({
      userId,
      source,
      durationDays,
      grantedBy: access.session.userId,
      label,
      reason,
      metadata: { grantedFrom: "manager_console" },
    });

    return NextResponse.json(result, { status: result.ok ? 200 : 400 });
  } catch (error) {
    return NextResponse.json({ ok: false, reason: error instanceof Error ? error.message : "Boost grant failed." }, { status: 400 });
  }
}

export async function PATCH(request: Request) {
  try {
    const access = await requireAuthenticatedRoleAccess(request, ["manager", "admin"]);
    if (!access.ok) return NextResponse.json({ ok: false, reason: access.reason }, { status: 403 });

    const body = await request.json().catch(() => ({}));
    const boostId = String(body.boostId ?? "").trim();
    if (!boostId) return NextResponse.json({ ok: false, reason: "Boost ID is required." }, { status: 400 });

    const client = createServerSupabaseClient();
    if (!client) return NextResponse.json({ ok: false, reason: "Boost service is unavailable." }, { status: 503 });

    const { data, error } = await client
      .from("profile_boosts")
      .update({ status: "revoked", updated_at: new Date().toISOString() })
      .eq("id", boostId)
      .eq("status", "active")
      .select("id,status,expires_at")
      .maybeSingle();

    if (error) return NextResponse.json({ ok: false, reason: error.message }, { status: 400 });
    if (!data) return NextResponse.json({ ok: false, reason: "Active boost not found." }, { status: 404 });

    return NextResponse.json({ ok: true, boost: data });
  } catch (error) {
    return NextResponse.json({ ok: false, reason: error instanceof Error ? error.message : "Boost update failed." }, { status: 400 });
  }
}
