import { NextResponse } from "next/server";
import {
  requireAuthenticatedRoleAccess,
  resolveMutationUserId,
} from "../../../../lib/aqe/auth";
import { createServerSupabaseClient } from "../../../../lib/supabaseServer";
import { persistSupportTicket } from "../../../../lib/aqe/support";

export async function POST(request: Request) {
  try {
    const body = await request.json().catch(() => ({}));
    const identity = await resolveMutationUserId(
      request,
      typeof body.userId === "string" ? body.userId : undefined,
    );

    if (!identity.ok) {
      return NextResponse.json(
        { ok: false, reason: identity.reason },
        { status: 401 },
      );
    }

    const result = await persistSupportTicket({
      userId: identity.userId,
      category: String(body.category ?? "OTHER") as any,
      subject: String(body.subject ?? "Support request"),
      message: String(body.message ?? "No details provided"),
      priority: String(body.priority ?? "MEDIUM") as any,
    });

    return NextResponse.json(result, { status: result.ok ? 200 : 400 });
  } catch (error) {
    return NextResponse.json(
      {
        ok: false,
        message:
          error instanceof Error
            ? error.message
            : "Support ticket creation failed",
      },
      { status: 400 },
    );
  }
}

export async function GET(request: Request) {
  try {
    const access = await requireAuthenticatedRoleAccess(request, [
      "manager",
      "admin",
    ]);
    if (!access.ok)
      return NextResponse.json(
        { ok: false, reason: access.reason },
        { status: 403 },
      );

    const client = createServerSupabaseClient();
    if (!client)
      return NextResponse.json({ ok: true, source: "demo", tickets: [] });

    const { data, error } = await client
      .from("support_ticket")
      .select(
        "id, user_id, category, subject, priority, status, created_at, updated_at",
      )
      .order("created_at", { ascending: false })
      .limit(50);
    if (error)
      return NextResponse.json(
        { ok: false, reason: error.message },
        { status: 500 },
      );
    return NextResponse.json({
      ok: true,
      source: "supabase",
      tickets: data ?? [],
    });
  } catch (error) {
    return NextResponse.json(
      {
        ok: false,
        reason:
          error instanceof Error ? error.message : "Support queue unavailable.",
      },
      { status: 500 },
    );
  }
}
