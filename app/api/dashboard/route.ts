import { NextResponse } from "next/server";
import { resolveAuthenticatedSession } from "../../../lib/aqe/auth";
import { createServerSupabaseClient } from "../../../lib/supabaseServer";

async function countRows(
  client: NonNullable<ReturnType<typeof createServerSupabaseClient>>,
  table: string,
  column?: string,
  value?: string,
) {
  let query = client.from(table).select("*", { count: "exact", head: true });
  if (column && value) query = query.eq(column, value);
  const result = await query;
  return result.count ?? 0;
}

export async function GET(request: Request) {
  try {
    const session = await resolveAuthenticatedSession(request);
    const client = createServerSupabaseClient();

    if (!client) {
      return NextResponse.json({
        ok: true,
        source: "demo",
        customer: { qcBalance: 0, tier: "basic", bookings: 0, earnings: 0 },
        manager: {
          users: 0,
          vip: 0,
          media: 0,
          transactions: 0,
          bookings: 0,
          messages: 0,
          products: 0,
          support: 0,
          withdrawals: 0,
        },
      });
    }

    if (!session.authenticated || !session.userId) {
      return NextResponse.json(
        { ok: false, reason: "Authentication required." },
        { status: 401 },
      );
    }

    const profile = await client
      .from("profiles")
      .select("tier")
      .eq("user_id", session.userId)
      .maybeSingle();
    const wallet = await client
      .from("qc_wallet")
      .select("balance")
      .eq("user_id", session.userId)
      .maybeSingle();
    const customerBookings = await countRows(
      client,
      "bookings",
      "customer_id",
      session.userId,
    );

    if (session.role === "manager" || session.role === "admin") {
      const [
        users,
        vip,
        media,
        transactions,
        bookings,
        messages,
        products,
        support,
        withdrawals,
      ] = await Promise.all([
        countRows(client, "profiles"),
        countRows(client, "profiles", "tier", "vip"),
        countRows(client, "profile_media"),
        countRows(client, "payment_orders"),
        countRows(client, "bookings"),
        countRows(client, "direct_messages"),
        countRows(client, "marketplace_products"),
        countRows(client, "support_ticket", "status", "OPEN"),
        countRows(client, "vip_withdrawal_requests", "status", "PENDING"),
      ]);

      return NextResponse.json({
        ok: true,
        source: "supabase",
        customer: {
          qcBalance: wallet.data?.balance ?? 0,
          tier: profile.data?.tier ?? "basic",
          bookings: customerBookings,
          earnings: 0,
        },
        manager: {
          users,
          vip,
          media,
          transactions,
          bookings,
          messages,
          products,
          support,
          withdrawals,
        },
      });
    }

    return NextResponse.json({
      ok: true,
      source: "supabase",
      customer: {
        qcBalance: wallet.data?.balance ?? 0,
        tier: profile.data?.tier ?? "basic",
        bookings: customerBookings,
        earnings: 0,
      },
      manager: null,
    });
  } catch (error) {
    return NextResponse.json(
      {
        ok: false,
        reason:
          error instanceof Error
            ? error.message
            : "Dashboard data unavailable.",
      },
      { status: 500 },
    );
  }
}
