import { NextResponse } from "next/server";
import {
  requireAuthenticatedRoleAccess,
  resolveMutationUserId,
} from "../../../lib/aqe/auth";
import {
  createBookingRequest,
  persistBookingRequest,
  transitionBookingStatus,
} from "../../../lib/aqe/booking";
import { createServerSupabaseClient } from "../../../lib/supabaseServer";

type BookingRow = {
  id: string;
  customer_id: string;
  provider_id: string;
  service: string;
  amount: number;
  currency: string;
  status: string;
  notes: string | null;
  created_at: string;
};

export async function GET(request: Request) {
  try {
    const client = createServerSupabaseClient();
    if (!client) {
      return NextResponse.json({ ok: true, source: "demo", bookings: [] });
    }

    const identity = await resolveMutationUserId(request);
    if (!identity.ok) {
      return NextResponse.json(
        { ok: false, reason: identity.reason },
        { status: 401 },
      );
    }

    const { data, error } = await client
      .from("bookings")
      .select("id, customer_id, provider_id, service, amount, currency, status, notes, created_at")
      .eq("customer_id", identity.userId)
      .order("created_at", { ascending: false })
      .limit(50);

    if (error) {
      return NextResponse.json({ ok: false, reason: error.message }, { status: 500 });
    }

    return NextResponse.json({
      ok: true,
      source: "supabase",
      bookings: (data ?? []).map((booking: BookingRow) => ({
        id: booking.id,
        title: booking.service,
        date: new Date(booking.created_at).toLocaleDateString("en-GB", {
          weekday: "short",
          day: "2-digit",
          month: "short",
        }),
        amount: `${booking.currency} ${booking.amount}`,
        status: booking.status,
        providerId: booking.provider_id,
        notes: booking.notes,
      })),
    });
  } catch (error) {
    return NextResponse.json(
      { ok: false, reason: error instanceof Error ? error.message : "Bookings unavailable." },
      { status: 500 },
    );
  }
}

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

export async function PATCH(request: Request) {
  try {
    const access = await requireAuthenticatedRoleAccess(request, ["manager", "admin"]);
    if (!access.ok) {
      return NextResponse.json({ ok: false, reason: access.reason }, { status: 403 });
    }

    const body = await request.json().catch(() => ({}));
    const bookingId = String(body.bookingId ?? "").trim();
    const nextStatus = String(body.status ?? "").trim();
    if (!bookingId || !["accepted", "rejected", "cancelled", "completed", "disputed"].includes(nextStatus)) {
      return NextResponse.json({ ok: false, reason: "Booking ID and valid next status are required." }, { status: 400 });
    }

    const client = createServerSupabaseClient();
    if (!client) {
      return NextResponse.json({ ok: true, saved: false, source: "memory", bookingId, status: nextStatus });
    }

    const current = await client
      .from("bookings")
      .select("id, status")
      .eq("id", bookingId)
      .maybeSingle();
    if (current.error || !current.data) {
      return NextResponse.json({ ok: false, reason: current.error?.message ?? "Booking not found." }, { status: 404 });
    }

    const transition = transitionBookingStatus(current.data.status, nextStatus as any);
    if (!transition.ok) return NextResponse.json(transition, { status: 409 });

    const updated = await client
      .from("bookings")
      .update({ status: nextStatus, updated_at: new Date().toISOString() })
      .eq("id", bookingId)
      .select("id, status, updated_at")
      .single();
    if (updated.error) return NextResponse.json({ ok: false, reason: updated.error.message }, { status: 500 });
    return NextResponse.json({ ok: true, saved: true, source: "supabase", booking: updated.data });
  } catch (error) {
    return NextResponse.json({ ok: false, reason: error instanceof Error ? error.message : "Booking review failed." }, { status: 400 });
  }
}
