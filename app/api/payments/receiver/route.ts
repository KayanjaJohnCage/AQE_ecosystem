import { NextResponse } from "next/server";
import { requireAuthenticatedRoleAccess } from "../../../../lib/aqe/auth";
import { createServerSupabaseClient } from "../../../../lib/supabaseServer";

type ReceiverDetails = {
  receiverName: string;
  receiverPhone: string;
  receiverCard: string;
  instructions: string;
  updatedAt?: string;
};

function envReceiver(): ReceiverDetails {
  return {
    receiverName: process.env.MUKURU_RECEIVER_NAME || "AQE Payments Receiver",
    receiverPhone: process.env.MUKURU_RECEIVER_PHONE || "Configure receiver phone",
    receiverCard: process.env.MUKURU_RECEIVER_CARD || "Configure receiver card",
    instructions:
      process.env.MUKURU_PAYMENT_INSTRUCTIONS ||
      "Use the receiver details below on the Mukuru Send Money page. Include your AQE payment reference.",
  };
}

export async function GET() {
  try {
    const client = createServerSupabaseClient();
    if (!client) {
      return NextResponse.json({ ok: true, source: "environment", receiver: envReceiver() });
    }

    const { data, error } = await client
      .from("payment_receiver_settings")
      .select("receiver_name, receiver_phone, receiver_card, instructions, updated_at")
      .eq("id", 1)
      .maybeSingle();

    if (error || !data) {
      return NextResponse.json({ ok: true, source: "environment", receiver: envReceiver() });
    }

    return NextResponse.json({
      ok: true,
      source: "supabase",
      receiver: {
        receiverName: data.receiver_name,
        receiverPhone: data.receiver_phone,
        receiverCard: data.receiver_card,
        instructions: data.instructions,
        updatedAt: data.updated_at,
      },
    });
  } catch (error) {
    return NextResponse.json(
      { ok: false, reason: error instanceof Error ? error.message : "Receiver details unavailable." },
      { status: 500 },
    );
  }
}

export async function PATCH(request: Request) {
  try {
    const access = await requireAuthenticatedRoleAccess(request, ["manager", "admin"]);
    if (!access.ok) return NextResponse.json({ ok: false, reason: access.reason }, { status: 403 });

    const body = await request.json().catch(() => ({}));
    const receiverName = String(body.receiverName ?? "").trim();
    const receiverPhone = String(body.receiverPhone ?? "").trim();
    const receiverCard = String(body.receiverCard ?? "").trim();
    const instructions = String(body.instructions ?? "").trim();
    if (!receiverName || !receiverPhone || !receiverCard) {
      return NextResponse.json(
        { ok: false, reason: "Receiver name, phone number, and card details are required." },
        { status: 400 },
      );
    }

    const receiver = { receiverName, receiverPhone, receiverCard, instructions };
    const client = createServerSupabaseClient();
    if (!client) {
      return NextResponse.json({ ok: true, saved: false, source: "environment", receiver });
    }

    const { data, error } = await client
      .from("payment_receiver_settings")
      .upsert(
        {
          id: 1,
          receiver_name: receiverName,
          receiver_phone: receiverPhone,
          receiver_card: receiverCard,
          instructions,
          updated_by: access.session.userId,
          updated_at: new Date().toISOString(),
        },
        { onConflict: "id" },
      )
      .select("receiver_name, receiver_phone, receiver_card, instructions, updated_at")
      .single();

    if (error || !data) {
      return NextResponse.json({ ok: false, reason: error?.message ?? "Receiver details could not be saved." }, { status: 500 });
    }

    return NextResponse.json({
      ok: true,
      saved: true,
      source: "supabase",
      receiver: {
        receiverName: data.receiver_name,
        receiverPhone: data.receiver_phone,
        receiverCard: data.receiver_card,
        instructions: data.instructions,
        updatedAt: data.updated_at,
      },
    });
  } catch (error) {
    return NextResponse.json(
      { ok: false, reason: error instanceof Error ? error.message : "Receiver details update failed." },
      { status: 400 },
    );
  }
}
