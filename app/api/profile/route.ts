import { NextResponse } from "next/server";
import { resolveMutationUserId } from "../../../lib/aqe/auth";
import {
  createProfileRecord,
  persistProfileRecord,
  sanitizeProfilePayload,
} from "../../../lib/aqe/profile";

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

    const sanitized = sanitizeProfilePayload(body);
    const tier = "basic";

    const result = createProfileRecord({
      userId: identity.userId,
      displayName: sanitized.displayName || "AQE User",
      tier,
      verificationStatus: "pending",
    });

    if (!result.ok || !result.profile) {
      return NextResponse.json(
        { ok: false, reason: result.reason },
        { status: 400 },
      );
    }

    const persisted = await persistProfileRecord(result.profile);

    return NextResponse.json({
      ok: true,
      profile: persisted.profile ?? result.profile,
      saved: persisted.saved,
      source: persisted.source,
    });
  } catch (error) {
    return NextResponse.json(
      {
        ok: false,
        reason:
          error instanceof Error ? error.message : "Profile creation failed",
      },
      { status: 400 },
    );
  }
}
