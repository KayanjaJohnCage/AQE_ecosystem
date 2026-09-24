import { NextResponse } from "next/server";
import { requireAuthenticatedRoleAccess } from "../../../lib/aqe/auth";
import { createServerSupabaseClient } from "../../../lib/supabaseServer";

export async function GET(request: Request) {
  try {
    const access = await requireAuthenticatedRoleAccess(request, [
      "customer",
      "manager",
      "admin",
    ]);
    if (!access.ok || !access.session.userId) {
      return NextResponse.json(
        { ok: false, reason: access.reason ?? "Authentication required." },
        { status: 401 },
      );
    }

    const client = createServerSupabaseClient();
    if (!client) return NextResponse.json({ ok: false, reason: "Notification service is not configured." }, { status: 503 });
    const url = new URL(request.url);
    const limit = Math.min(
      Math.max(Number(url.searchParams.get("limit") ?? 50), 1),
      100,
    );

    const { data, error } = await client
      .from("notifications")
      .select(
        "id,type,title,body,reference_type,reference_id,metadata,read_at,created_at",
      )
      .eq("user_id", access.session.userId)
      .order("created_at", { ascending: false })
      .limit(limit);

    if (error) {
      return NextResponse.json(
        { ok: false, reason: error.message },
        { status: 500 },
      );
    }

    const unreadCount = (data ?? []).filter((item) => !item.read_at).length;

    return NextResponse.json({
      ok: true,
      source: "supabase",
      notifications: data ?? [],
      unreadCount,
    });
  } catch (error) {
    return NextResponse.json(
      {
        ok: false,
        reason:
          error instanceof Error
            ? error.message
            : "Notifications unavailable.",
      },
      { status: 500 },
    );
  }
}

export async function PATCH(request: Request) {
  try {
    const access = await requireAuthenticatedRoleAccess(request, [
      "customer",
      "manager",
      "admin",
    ]);
    if (!access.ok || !access.session.userId) {
      return NextResponse.json(
        { ok: false, reason: access.reason ?? "Authentication required." },
        { status: 401 },
      );
    }

    const body = await request.json().catch(() => ({}));
    const markAll = body.markAll === true;
    const notificationId =
      typeof body.notificationId === "string"
        ? body.notificationId.trim()
        : "";

    if (!markAll && !notificationId) {
      return NextResponse.json(
        {
          ok: false,
          reason: "notificationId or markAll=true is required.",
        },
        { status: 400 },
      );
    }

    const client = createServerSupabaseClient();
    if (!client) return NextResponse.json({ ok: false, reason: "Notification service is not configured." }, { status: 503 });

    if (markAll) {
      const updated = await client
        .from("notifications")
        .update({ read_at: new Date().toISOString() })
        .eq("user_id", access.session.userId)
        .is("read_at", null)
        .select("id");

      if (updated.error) {
        return NextResponse.json(
          { ok: false, reason: updated.error.message },
          { status: 500 },
        );
      }

      return NextResponse.json({
        ok: true,
        updated: updated.data?.length ?? 0,
      });
    }

    const updated = await client
      .from("notifications")
      .update({ read_at: new Date().toISOString() })
      .eq("id", notificationId)
      .eq("user_id", access.session.userId)
      .select("id,read_at")
      .maybeSingle();

    if (updated.error) {
      return NextResponse.json(
        { ok: false, reason: updated.error.message },
        { status: 500 },
      );
    }

    if (!updated.data) {
      return NextResponse.json(
        { ok: false, reason: "Notification not found." },
        { status: 404 },
      );
    }

    return NextResponse.json({ ok: true, notification: updated.data });
  } catch (error) {
    return NextResponse.json(
      {
        ok: false,
        reason:
          error instanceof Error
            ? error.message
            : "Notification update failed.",
      },
      { status: 500 },
    );
  }
}
