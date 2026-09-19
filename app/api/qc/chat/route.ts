import { NextResponse } from "next/server";
import { normalizeTier, resolveMutationUserId } from "../../../../lib/aqe/auth";
import {
  chargeChatQcFromDatabase,
  chargeChatQcServer,
} from "../../../../lib/aqe/qc";

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

    if (
      process.env.NEXT_PUBLIC_SUPABASE_URL &&
      process.env.SUPABASE_SERVICE_ROLE_KEY
    ) {
      const databaseResult = await chargeChatQcFromDatabase(
        identity.userId,
        Number(body.messageCount ?? 1),
      );

      if (!databaseResult.ok) {
        return NextResponse.json(databaseResult, { status: 402 });
      }

      return NextResponse.json({
        ...databaseResult,
        status: "sent",
        source: "supabase",
      });
    }

    const tier = normalizeTier(
      typeof body.tier === "string" ? body.tier : "basic",
    );
    const dailyUsed = Number(body.dailyUsed ?? 0);
    const globalBalance = Number(body.globalBalance ?? 0);
    const messageCount = Number(body.messageCount ?? 1);

    const result = await chargeChatQcServer({
      tier,
      dailyUsed,
      globalBalance,
      messageCount,
      ledger: [],
    });

    if (!result.ok) {
      return NextResponse.json(
        {
          ok: false,
          status: "rejected",
          reason: result.reason,
          remainingGlobalBalance: result.remainingGlobalBalance,
        },
        { status: 402 },
      );
    }

    return NextResponse.json({
      ok: true,
      status: "sent",
      charged: result.charged,
      remainingDailyAllowance: result.remainingDailyAllowance,
      remainingGlobalBalance: result.remainingGlobalBalance,
      ledger: result.ledger,
    });
  } catch (error) {
    return NextResponse.json(
      {
        ok: false,
        reason:
          error instanceof Error ? error.message : "Unknown QC charge error",
      },
      { status: 400 },
    );
  }
}
