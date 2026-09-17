import { NextResponse } from "next/server";
import { createPaymentStateTransition } from "../../../../lib/aqe/financial";

export async function POST(request: Request) {
  try {
    const body = await request.json().catch(() => ({}));
    const currentState = String(body.currentState ?? "initiated");
    const nextState = String(body.nextState ?? "pending");

    const transition = createPaymentStateTransition({
      currentState: currentState as any,
      nextState: nextState as any,
    });

    if (!transition.ok) {
      return NextResponse.json(
        { ok: false, reason: transition.reason },
        { status: 400 },
      );
    }

    return NextResponse.json({
      ok: true,
      currentState,
      nextState,
      status: "pending",
      message: "Manager direct payment request accepted and queued for review.",
    });
  } catch (error) {
    return NextResponse.json(
      {
        ok: false,
        reason:
          error instanceof Error
            ? error.message
            : "Manager direct payment failed",
      },
      { status: 400 },
    );
  }
}
