import { NextResponse } from "next/server";
import { resolveMutationUserId } from "../../../lib/aqe/auth";
import { chargeChatQcFromDatabase } from "../../../lib/aqe/qc";
import {
  persistDirectMessage,
  validateCommunityText,
} from "../../../lib/aqe/community";
import { createServerSupabaseClient } from "../../../lib/supabaseServer";

type MessageRow = {
  id: string;
  sender_id: string;
  recipient_id: string;
  body: string;
  created_at: string;
  read_at: string | null;
};

export async function GET(request: Request) {
  try {
    const client = createServerSupabaseClient();
    if (!client) {
      return NextResponse.json({ ok: true, source: "demo", messages: [] });
    }

    const identity = await resolveMutationUserId(request);
    if (!identity.ok) {
      return NextResponse.json(
        { ok: false, reason: identity.reason },
        { status: 401 },
      );
    }

    const { data, error } = await client
      .from("direct_messages")
      .select("id, sender_id, recipient_id, body, created_at, read_at")
      .or(`sender_id.eq.${identity.userId},recipient_id.eq.${identity.userId}`)
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
      messages: (data ?? []).map((message: MessageRow) => ({
        id: message.id,
        userId:
          message.sender_id === identity.userId
            ? message.recipient_id
            : message.sender_id,
        preview: message.body,
        time: new Date(message.created_at).toLocaleTimeString([], {
          hour: "2-digit",
          minute: "2-digit",
        }),
        read: Boolean(message.read_at),
      })),
    });
  } catch (error) {
    return NextResponse.json(
      {
        ok: false,
        reason:
          error instanceof Error ? error.message : "Messages unavailable.",
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
      typeof body.senderId === "string" ? body.senderId : undefined,
    );
    if (!identity.ok)
      return NextResponse.json(
        { ok: false, reason: identity.reason },
        { status: 401 },
      );

    const recipientId = String(body.recipientId ?? "").trim();
    const text = validateCommunityText(body.body, "Message");
    if (!recipientId || recipientId === identity.userId || !text.ok) {
      const reason =
        recipientId === identity.userId
          ? "A message recipient must be different from the sender."
          : recipientId
            ? text.reason
            : "Recipient ID is required.";
      return NextResponse.json({ ok: false, reason }, { status: 400 });
    }

    // The server is the source of truth for chat charging. The client cannot
    // bypass QC by calling the message endpoint directly.
    const supabaseConfigured = Boolean(
      process.env.NEXT_PUBLIC_SUPABASE_URL &&
      process.env.SUPABASE_SERVICE_ROLE_KEY,
    );

    if (supabaseConfigured) {
      const charge = await chargeChatQcFromDatabase(identity.userId, 1);
      if (!charge.ok) {
        return NextResponse.json(
          { ok: false, reason: charge.reason ?? "Chat charge failed.", ...charge },
          { status: 402 },
        );
      }
    }

    const result = await persistDirectMessage({
      senderId: identity.userId,
      recipientId,
      body: text.text,
    });
    return NextResponse.json(result, { status: result.ok ? 200 : 500 });
  } catch (error) {
    return NextResponse.json(
      {
        ok: false,
        reason:
          error instanceof Error ? error.message : "Message creation failed",
      },
      { status: 400 },
    );
  }
}
