import { NextResponse } from "next/server";
import { requireAuthenticatedRoleAccess } from "../../../lib/aqe/auth";
import { createAuditEntry, persistAuditEntry } from "../../../lib/aqe/audit";
import { persistVerificationDecision } from "../../../lib/aqe/verification";

export async function POST(request: Request) {
  try {
    const body = await request.json().catch(() => ({}));
    const access = await requireAuthenticatedRoleAccess(request, [
      "manager",
      "admin",
    ]);
    if (!access.ok)
      return NextResponse.json(
        { ok: false, reason: access.reason },
        { status: 403 },
      );

    const targetUserId = String(body.targetUserId ?? "").trim();
    if (!targetUserId)
      return NextResponse.json(
        { ok: false, reason: "Target user ID is required." },
        { status: 400 },
      );

    const result = await persistVerificationDecision({
      targetUserId,
      approved: Boolean(body.approved),
      notes: typeof body.notes === "string" ? body.notes : undefined,
    });

    if (!result.ok || !result.verification)
      return NextResponse.json(result, { status: 500 });

    const audit = createAuditEntry({
      actorId: access.session.userId,
      action: "verification_decision",
      targetType: "profile",
      targetId: targetUserId,
      details: result.verification.notes,
      metadata: { approved: Boolean(body.approved) },
    });
    const persistedAudit = await persistAuditEntry(audit);

    return NextResponse.json({
      ok: true,
      verification: result.verification,
      audit: persistedAudit,
    });
  } catch (error) {
    return NextResponse.json(
      {
        ok: false,
        reason:
          error instanceof Error ? error.message : "Verification update failed",
      },
      { status: 400 },
    );
  }
}
