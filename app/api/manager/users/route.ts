import { NextResponse } from "next/server";
import { requireAuthenticatedRoleAccess } from "../../../../lib/aqe/auth";
import { createServerSupabaseClient } from "../../../../lib/supabaseServer";

export async function DELETE(request: Request) {
  try {
    const access = await requireAuthenticatedRoleAccess(request, ["manager", "admin"]);
    if (!access.ok) {
      return NextResponse.json({ ok: false, reason: access.reason }, { status: 403 });
    }

    const body = await request.json().catch(() => ({}));
    const userId = String(body.userId ?? "").trim();
    if (!userId) {
      return NextResponse.json({ ok: false, reason: "Customer user ID is required." }, { status: 400 });
    }
    if (userId === access.session.userId) {
      return NextResponse.json({ ok: false, reason: "The manager account cannot delete itself." }, { status: 400 });
    }

    const client = createServerSupabaseClient();
    if (!client) {
      return NextResponse.json({ ok: false, reason: "Supabase is not configured." }, { status: 503 });
    }

    const authUser = await client.auth.admin.getUserById(userId);
    if (authUser.error || !authUser.data.user) {
      return NextResponse.json({ ok: false, reason: "Customer account was not found." }, { status: 404 });
    }

    const roleRows = await client.from("user_roles").select("role_name").eq("user_id", userId);
    if ((roleRows.data ?? []).some((row) => ["manager", "admin"].includes(String(row.role_name).toLowerCase()))) {
      return NextResponse.json({ ok: false, reason: "Manager and admin accounts cannot be deleted from customer management." }, { status: 403 });
    }

    const wallet = await client
      .from("cash_wallet")
      .select("available_balance,pending_balance")
      .eq("user_id", userId)
      .maybeSingle();
    if (wallet.data && Number(wallet.data.available_balance || 0) !== 0 || wallet.data && Number(wallet.data.pending_balance || 0) !== 0) {
      return NextResponse.json({ ok: false, reason: "This account has wallet funds. Withdraw or resolve the balance before deleting the account." }, { status: 409 });
    }

    const pendingPayments = await client
      .from("payment_orders")
      .select("id")
      .eq("user_id", userId)
      .in("status", ["initiated", "pending"])
      .limit(1);
    if (pendingPayments.data?.length) {
      return NextResponse.json({ ok: false, reason: "This account has a pending payment request. Resolve it before deleting the account." }, { status: 409 });
    }

    // Remove customer-facing identity/content records. Immutable financial/audit
    // records are deliberately retained for accounting and traceability.
    const cleanupErrors: string[] = [];
    const deleteRows = async (table: string, column: string, value: string) => {
      const result = await client.from(table).delete().eq(column, value);
      if (result.error) cleanupErrors.push(table + ": " + result.error.message);
    };

    await deleteRows("profile_media", "owner_user_id", userId);
    await deleteRows("profile_boosts", "user_id", userId);
    await deleteRows("notifications", "user_id", userId);
    await deleteRows("direct_messages", "sender_id", userId);
    await deleteRows("direct_messages", "recipient_id", userId);
    await deleteRows("profile_comments", "author_id", userId);
    await deleteRows("profile_comments", "profile_id", userId);
    await deleteRows("vip_content_settings", "vip_user_id", userId);
    await deleteRows("vip_asset_room_sessions", "user_id", userId);
    await deleteRows("vip_asset_rooms", "user_id", userId);
    await deleteRows("vip_content_subscriptions", "subscriber_user_id", userId);
    await deleteRows("vip_content_subscriptions", "vip_user_id", userId);
    await deleteRows("subscriptions", "user_id", userId);
    await deleteRows("bookings", "customer_id", userId);
    await deleteRows("bookings", "provider_id", userId);
    await deleteRows("marketplace_products", "seller_id", userId);
    await deleteRows("campaign_redemptions", "user_id", userId);
    await deleteRows("aqe_prize_claims", "user_id", userId);
    await deleteRows("daily_qc_claims", "user_id", userId);
    await deleteRows("daily_checkin", "user_id", userId);
    await deleteRows("account_troubleshoot_requests", "user_id", userId);
    await deleteRows("user_roles", "user_id", userId);
    await deleteRows("referral_earnings", "beneficiary_user_id", userId);
    await deleteRows("referral_earnings", "referred_user_id", userId);
    await deleteRows("profiles", "user_id", userId);

    if (cleanupErrors.length) {
      return NextResponse.json({
        ok: false,
        reason: "Customer identity cleanup could not be completed.",
        details: cleanupErrors,
      }, { status: 500 });
    }

    const authDelete = await client.auth.admin.deleteUser(userId);
    if (authDelete.error) {
      return NextResponse.json({
        ok: false,
        reason: "Customer profile data was removed, but the Auth account could not be deleted. Retry from Manager Users & Profiles.",
        details: authDelete.error.message,
      }, { status: 500 });
    }

    return NextResponse.json({
      ok: true,
      deletedUserId: userId,
      message: "Customer account deleted. Financial and audit records were retained for traceability.",
    });
  } catch (error) {
    return NextResponse.json({
      ok: false,
      reason: error instanceof Error ? error.message : "Customer deletion failed.",
    }, { status: 400 });
  }
}
