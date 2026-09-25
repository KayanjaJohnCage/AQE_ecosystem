import { NextResponse } from "next/server";
import { requireAuthenticatedRoleAccess } from "../../../../lib/aqe/auth";

export async function GET(request: Request) {
  const access = await requireAuthenticatedRoleAccess(request, ["manager", "admin"]);
  if (!access.ok) return NextResponse.json({ ok: false, reason: access.reason }, { status: 403 });
  return NextResponse.json({ ok: true, role: access.session.role, userId: access.session.userId });
}
