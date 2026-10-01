import { NextResponse } from "next/server";
import { resolveMutationUserId } from "../../../../lib/aqe/auth";
import { createServerSupabaseClient } from "../../../../lib/supabaseServer";

export async function POST(request: Request) {
  try {
    const identity = await resolveMutationUserId(request);
    if (!identity.ok) {
      return NextResponse.json({ ok: false, reason: identity.reason }, { status: 401 });
    }

    const body = await request.json().catch(() => ({}));
    const recipientPhone = String(body.recipientPhone ?? body.phone ?? "").trim();
    const amount = Number(body.amount ?? 0);
    const note = String(body.note ?? "").trim();

    if (!recipientPhone || !Number.isFinite(amount) || amount <= 0) {
      return NextResponse.json(
        { ok: false, reason: "Recipient phone number and a valid transfer amount are required." },
        { status: 400 },
      );
    }

    const client = createServerSupabaseClient();
    if (!client) {
      return NextResponse.json({ ok: false, reason: "Wallet transfer service is not configured." }, { status: 503 });
    }

    const result = await client.rpc("transfer_cash_wallet_atomic", {
      p_sender_user_id: identity.userId,
      p_recipient_phone: recipientPhone,
      p_amount: amount,
      p_note: note,
    });

    if (result.error) {
      return NextResponse.json({ ok: false, reason: result.error.message }, { status: 400 });
    }

    return NextResponse.json({
      ok: true,
      transfer: result.data,
      message: "Wallet transfer completed successfully.",
    });
  } catch (error) {
    return NextResponse.json(
      { ok: false, reason: error instanceof Error ? error.message : "Wallet transfer failed." },
      { status: 400 },
    );
  }
}
