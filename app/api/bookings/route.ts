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
      .select(
        "id, customer_id, provider_id, service, amount, currency, status, notes, created_at",
      )
      .eq("customer_id", identity.userId)
      .order("created_at", { ascending: false })
      .limit(50);

    if (error) {
      return NextResponse.json(
        { ok: false, reason: error.message },
        { status: 500 },
      );
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
      {
        ok: false,
        reason:
          error instanceof Error ? error.message : "Bookings unavailable.",
      },
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

    const client = createServerSupabaseClient();
    if (!client) {
      return NextResponse.json(
        { ok: false, reason: "Booking service is not configured." },
        { status: 503 },
      );
    }

    const membership = await client
      .from("profiles")
      .select("tier,verification_status")
      .eq("user_id", identity.userId)
      .maybeSingle();
    if (membership.error) {
      return NextResponse.json({ ok: false, reason: membership.error.message }, { status: 500 });
    }
    if (!membership.data || membership.data.verification_status !== "approved") {
      return NextResponse.json(
        {
          ok: false,
          reason: "Active membership verification is required before creating booking requests.",
          tier: membership.data?.tier ?? "basic",
          membershipStatus: "pending_payment",
        },
        { status: 403 },
      );
    }
    const providerId = String(body.providerId ?? "").trim();
    const service = String(body.service ?? "").trim();
    const amount = Number(body.amount ?? 0);
    const settingsRow = client
      ? await client
          .from("platform_settings")
          .select("settings")
          .eq("id", 1)
          .maybeSingle()
      : { data: null };
    const configuredCurrency = String(
      settingsRow.data?.settings?.walletCurrency ?? "UGX",
    )
      .trim()
      .toUpperCase();
    const currency = String(body.currency ?? configuredCurrency)
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

    const qcCost = Number(body.qcCost ?? 0);
    if (!Number.isInteger(qcCost) || qcCost < 0) {
      return NextResponse.json({ ok: false, reason: "Invalid QC booking cost." }, { status: 400 });
    }
    let qcBefore = 0;
    let qcAfter = 0;
    if (qcCost > 0) {
      const wallet = await client.from("qc_wallet").select("balance").eq("user_id", identity.userId).maybeSingle();
      qcBefore = Number(wallet.data?.balance ?? 0);
      if (qcBefore < qcCost) {
        return NextResponse.json({ ok: false, reason: "Not enough QC. Recharge QC and try again." }, { status: 409 });
      }
      qcAfter = qcBefore - qcCost;
      const reserved = await client.from("qc_wallet").update({ balance: qcAfter, updated_at: new Date().toISOString() }).eq("user_id", identity.userId).gte("balance", qcCost);
      if (reserved.error) return NextResponse.json({ ok: false, reason: reserved.error.message }, { status: 500 });
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
    if (!persisted.ok && qcCost > 0) {
      await client.from("qc_wallet").update({ balance: qcBefore, updated_at: new Date().toISOString() }).eq("user_id", identity.userId);
      return NextResponse.json(persisted, { status: 500 });
    }
    if (persisted.ok && qcCost > 0) {
      const ref = String(result.booking.id);
      await client.from("qc_ledger").insert({
        user_id: identity.userId, transaction_type: "booking_request", amount: qcCost, direction: "OUT",
        balance_after: qcAfter, reference_type: "booking", reference_id: ref,
        description: "Booking request QC charge", status: "COMPLETED"
      });
      await client.from("transaction_receipts").insert({
        receipt_number: "AQE-" + Date.now(), user_id: identity.userId,
        transaction_type: "booking_request", source: "booking", reference_id: ref,
        amount: 0, currency: "UGX", qc_amount: qcCost, balance_before: qcBefore,
        balance_after: qcAfter, status: "COMPLETED", description: "Booking request QC charge"
      });
    }
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
    const access = await requireAuthenticatedRoleAccess(request, [
      "manager",
      "admin",
    ]);
    if (!access.ok) {
      return NextResponse.json(
        { ok: false, reason: access.reason },
        { status: 403 },
      );
    }

    const body = await request.json().catch(() => ({}));
    const bookingId = String(body.bookingId ?? "").trim();
    const nextStatus = String(body.status ?? "").trim();
    if (
      !bookingId ||
      !["accepted", "rejected", "cancelled", "completed", "disputed"].includes(
        nextStatus,
      )
    ) {
      return NextResponse.json(
        { ok: false, reason: "Booking ID and valid next status are required." },
        { status: 400 },
      );
    }

    const client = createServerSupabaseClient();
    if (!client) {
      return NextResponse.json({
        ok: true,
        saved: false,
        source: "memory",
        bookingId,
        status: nextStatus,
      });
    }

    const current = await client
      .from("bookings")
      .select("id, status")
      .eq("id", bookingId)
      .maybeSingle();
    if (current.error || !current.data) {
      return NextResponse.json(
        { ok: false, reason: current.error?.message ?? "Booking not found." },
        { status: 404 },
      );
    }

    const transition = transitionBookingStatus(
      current.data.status,
      nextStatus as any,
    );
    if (!transition.ok) return NextResponse.json(transition, { status: 409 });

    const updated = await client
      .from("bookings")
      .update({ status: nextStatus, updated_at: new Date().toISOString() })
      .eq("id", bookingId)
      .select("id, status, updated_at")
      .single();
    if (updated.error)
      return NextResponse.json(
        { ok: false, reason: updated.error.message },
        { status: 500 },
      );
    return NextResponse.json({
      ok: true,
      saved: true,
      source: "supabase",
      booking: updated.data,
    });
  } catch (error) {
    return NextResponse.json(
      {
        ok: false,
        reason:
          error instanceof Error ? error.message : "Booking review failed.",
      },
      { status: 400 },
    );
  }
}
