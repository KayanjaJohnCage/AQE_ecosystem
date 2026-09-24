import { NextResponse } from "next/server";
import { requireAuthenticatedRoleAccess } from "../../../../lib/aqe/auth";
import { getMembershipAccess } from "../../../../lib/aqe/membershipAccess";

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

    const membership = await getMembershipAccess(access.session.userId);
    if (!membership) {
      return NextResponse.json(
        { ok: false, reason: "Profile not found." },
        { status: 404 },
      );
    }

    return NextResponse.json({
      ok: true,
      membership,
      qcFeatureAccess: membership.isUpgradedMember ? "free" : "chargeable",
    });
  } catch (error) {
    return NextResponse.json(
      {
        ok: false,
        reason:
          error instanceof Error
            ? error.message
            : "Membership status unavailable.",
      },
      { status: 500 },
    );
  }
}
