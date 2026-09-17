import { NextResponse } from "next/server";
import { resolveMutationUserId } from "../../../lib/aqe/auth";
import {
  createBookingRequest,
  persistBookingRequest,
} from "../../../lib/aqe/booking";

export async function POST(request: Request) {
  try {
    const body = await request.json().catch(() => ({}));
    const identity = await resolveMutationUserId(
      request,
      typeof body.customerId === "string" ? body.customerId : undefined,
    );

    if (!identity.ok)
      return NextResponse.json(
        { ok: false, reason: identity.reason },
        { status: 401 },
      );

    const providerId = String(body.providerId ?? "").trim();
    const service = String(body.service ?? "").trim();
    const amount = Number(body.amount ?? 0);
    const currency = String(body.currency ?? "USD")
      .trim()
      .toUpperCase();

    if (!providerId || !service || !/^[A-Z]{3}$/.test(currency)) {
      return NextResponse.json(
        {
          ok: false,
          reason: "Provider, service, and valid currency are required.",
        },
        { status: 400 },
      );
    }

    const result = createBookingRequest({
      customerId: identity.userId,
      providerId,
      service,
      amount,
      currency,
      notes: typeof body.notes === "string" ? body.notes.trim() : undefined,
    });

    if (!result.ok || !result.booking)
      return NextResponse.json(result, { status: 400 });

    const persisted = await persistBookingRequest(result.booking);
    return NextResponse.json(persisted, { status: persisted.ok ? 200 : 500 });
  } catch (error) {
    return NextResponse.json(
      {
        ok: false,
        reason:
          error instanceof Error ? error.message : "Booking creation failed",
      },
      { status: 400 },
    );
  }
}
