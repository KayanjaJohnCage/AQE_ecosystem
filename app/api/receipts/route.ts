import { NextResponse } from "next/server";
import { resolveAuthenticatedSession, requireAuthenticatedRoleAccess } from "../../../lib/aqe/auth";
import { getUserReceipts } from "../../../lib/aqe/receipts";
import { createServerSupabaseClient } from "../../../lib/supabaseServer";

export async function GET(request: Request) {
  try {
    const session = await resolveAuthenticatedSession(request);
    if (!session.authenticated || !session.userId) {
      return NextResponse.json({ ok: false, reason: "Authentication required." }, { status: 401 });
    }
    const url = new URL(request.url);
    const requestedUserId = url.searchParams.get("userId");
    const client = createServerSupabaseClient();

    if (requestedUserId && requestedUserId !== session.userId) {
      const access = await requireAuthenticatedRoleAccess(request, ["manager", "admin"]);
      if (!access.ok) return NextResponse.json({ ok: false, reason: access.reason }, { status: 403 });
    }

    const result = await getUserReceipts(requestedUserId || session.userId, Number(url.searchParams.get("limit") || 100));
    if (!result.ok) return NextResponse.json(result, { status: 503 });

    return NextResponse.json({ ok: true, source: client ? "supabase" : "unavailable", receipts: result.receipts });
  } catch (error) {
    return NextResponse.json({ ok: false, reason: error instanceof Error ? error.message : "Receipts unavailable." }, { status: 500 });
  }
}
