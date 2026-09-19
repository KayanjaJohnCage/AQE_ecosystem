import { NextResponse } from "next/server";
import { normalizeTier, resolveMutationUserId } from "../../../lib/aqe/auth";
import {
  createSubscription,
  persistSubscription,
} from "../../../lib/aqe/subscription";
import { createServerSupabaseClient } from "../../../lib/supabaseServer";

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

    const client = createServerSupabaseClient();
    let tier: "basic" | "premium" | "vip" = "basic";

    if (client) {
      const { data: profile } = await client
        .from("profiles")
        .select("tier")
        .eq("user_id", identity.userId)
        .maybeSingle();
      tier = normalizeTier(profile?.tier ?? "basic") as
        | "basic"
        | "premium"
        | "vip";
    }

    const amount = Number(body.amount ?? 0);
    const currency = String(body.currency ?? "USD")
      .trim()
      .toUpperCase();

    if (
      !Number.isFinite(amount) ||
      amount < 0 ||
      !/^[A-Z]{3}$/.test(currency)
    ) {
      return NextResponse.json(
        {
          ok: false,
          reason: "A valid subscription amount and currency are required.",
        },
        { status: 400 },
      );
    }

    const result = createSubscription({
      userId: identity.userId,
      tier,
      amount,
      currency,
    });

    if (!result.ok || !result.subscription) {
      return NextResponse.json(result, { status: 400 });
    }

    const persisted = await persistSubscription(result.subscription);
    if (!persisted.ok) {
      return NextResponse.json(persisted, { status: 500 });
    }

    return NextResponse.json({ ...persisted, tier });
  } catch (error) {
    return NextResponse.json(
      {
        ok: false,
        reason:
          error instanceof Error
            ? error.message
            : "Subscription creation failed",
      },
      { status: 400 },
    );
  }
}
