import { NextResponse } from "next/server";
import { createHash, randomBytes, scryptSync, timingSafeEqual } from "node:crypto";
import { resolveAuthenticatedSession, resolveMutationUserId } from "../../../../lib/aqe/auth";
import { createServerSupabaseClient } from "../../../../lib/supabaseServer";

const PIN_LENGTH = 4;
const SESSION_TTL_SECONDS = 60 * 30;

function hashPin(pin: string) {
  const salt = randomBytes(16);
  const hash = scryptSync(pin, salt, 32);
  return salt.toString("hex") + ":" + hash.toString("hex");
}

function verifyPin(pin: string, encoded: string) {
  const [saltHex, hashHex] = String(encoded || "").split(":");
  if (!saltHex || !hashHex) return false;
  try {
    const actual = scryptSync(pin, Buffer.from(saltHex, "hex"), 32);
    const expected = Buffer.from(hashHex, "hex");
    return expected.length === actual.length && timingSafeEqual(actual, expected);
  } catch {
    return false;
  }
}

function sessionHash(token: string) {
  return createHash("sha256").update(token).digest("hex");
}

export async function GET(request: Request) {
  try {
    const session = await resolveAuthenticatedSession(request);
    if (!session.authenticated || !session.userId) {
      return NextResponse.json({ ok: false, reason: "Authentication required." }, { status: 401 });
    }

    const client = createServerSupabaseClient();
    if (!client) return NextResponse.json({ ok: false, reason: "Asset Room is not configured." }, { status: 503 });

    const profile = await client.from("profiles").select("tier").eq("user_id", session.userId).maybeSingle();
    if (profile.data?.tier !== "vip") {
      return NextResponse.json({ ok: false, reason: "VIP membership is required for the Asset Room." }, { status: 403 });
    }

    const room = await client.from("vip_asset_rooms").select("user_id,salary_balance,withdrawn_salary_total,pin_set_at,updated_at").eq("user_id", session.userId).maybeSingle();
    if (room.error) return NextResponse.json({ ok: false, reason: room.error.message }, { status: 500 });

    return NextResponse.json({
      ok: true,
      pinSet: Boolean(room.data?.pin_set_at),
      salaryBalance: Number(room.data?.salary_balance ?? 0),
      withdrawnSalaryTotal: Number(room.data?.withdrawn_salary_total ?? 0),
      updatedAt: room.data?.updated_at ?? null,
    });
  } catch (error) {
    return NextResponse.json({ ok: false, reason: error instanceof Error ? error.message : "Asset Room unavailable." }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    const identity = await resolveMutationUserId(request);
    if (!identity.ok) return NextResponse.json({ ok: false, reason: identity.reason }, { status: 401 });

    const body = await request.json().catch(() => ({}));
    const action = String(body.action ?? "").trim().toLowerCase();
    const pin = String(body.pin ?? "").trim();

    if (!/^\d{4}$/.test(pin)) {
      return NextResponse.json({ ok: false, reason: "Asset Room PIN must be exactly 4 digits." }, { status: 400 });
    }

    const client = createServerSupabaseClient();
    if (!client) return NextResponse.json({ ok: false, reason: "Asset Room is not configured." }, { status: 503 });

    const profile = await client.from("profiles").select("tier").eq("user_id", identity.userId).maybeSingle();
    if (profile.data?.tier !== "vip") {
      return NextResponse.json({ ok: false, reason: "VIP membership is required for the Asset Room." }, { status: 403 });
    }

    const room = await client.from("vip_asset_rooms").select("user_id,pin_hash,pin_set_at").eq("user_id", identity.userId).maybeSingle();
    if (room.error) return NextResponse.json({ ok: false, reason: room.error.message }, { status: 500 });

    if (action === "set_pin") {
      if (room.data?.pin_set_at) {
        return NextResponse.json({ ok: false, reason: "Your Asset Room PIN is already set. Verify the current PIN before changing it." }, { status: 409 });
      }

      const saved = await client.from("vip_asset_rooms").upsert({
        user_id: identity.userId,
        pin_hash: hashPin(pin),
        pin_set_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      }, { onConflict: "user_id" }).select("pin_set_at").single();

      if (saved.error) return NextResponse.json({ ok: false, reason: saved.error.message }, { status: 500 });

      return NextResponse.json({ ok: true, pinSet: true, message: "Your private Asset Room PIN has been created." });
    }

    if (action === "change_pin") {
      const currentPin = String(body.currentPin ?? "").trim();
      if (!/^\d{4}$/.test(currentPin) || !room.data?.pin_hash || !verifyPin(currentPin, room.data.pin_hash)) {
        return NextResponse.json({ ok: false, reason: "Current Asset Room PIN is incorrect." }, { status: 403 });
      }

      const saved = await client.from("vip_asset_rooms").update({
        pin_hash: hashPin(pin),
        pin_set_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      }).eq("user_id", identity.userId).select("pin_set_at").single();

      if (saved.error) return NextResponse.json({ ok: false, reason: saved.error.message }, { status: 500 });
      return NextResponse.json({ ok: true, pinSet: true, message: "Your Asset Room PIN has been changed." });
    }

    if (action === "verify") {
      if (!room.data?.pin_hash || !room.data?.pin_set_at) {
        return NextResponse.json({ ok: false, reason: "Set your Asset Room PIN before opening the room.", code: "PIN_NOT_SET" }, { status: 409 });
      }

      if (!verifyPin(pin, room.data.pin_hash)) {
        return NextResponse.json({ ok: false, reason: "Incorrect Asset Room PIN.", code: "PIN_INVALID" }, { status: 403 });
      }

      const token = randomBytes(32).toString("base64url");
      const expiresAt = new Date(Date.now() + SESSION_TTL_SECONDS * 1000).toISOString();
      const saved = await client.from("vip_asset_room_sessions").insert({
        user_id: identity.userId,
        token_hash: sessionHash(token),
        expires_at: expiresAt,
      }).select("id,expires_at").single();

      if (saved.error) return NextResponse.json({ ok: false, reason: saved.error.message }, { status: 500 });

      const response = NextResponse.json({ ok: true, verified: true, expiresAt });
      response.cookies.set("aqe-asset-room-session", token, {
        httpOnly: true,
        sameSite: "lax",
        secure: process.env.NODE_ENV === "production",
        path: "/",
        maxAge: SESSION_TTL_SECONDS,
      });
      return response;
    }

    return NextResponse.json({ ok: false, reason: "Unsupported Asset Room action." }, { status: 400 });
  } catch (error) {
    return NextResponse.json({ ok: false, reason: error instanceof Error ? error.message : "Asset Room action failed." }, { status: 400 });
  }
}
