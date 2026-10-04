export async function POST(request: Request) {
  try {
    const access = await requireAuthenticatedRoleAccess(request, ["manager", "admin"]);
    if (!access.ok) return NextResponse.json({ ok: false, reason: access.reason }, { status: 403 });
    const body = await request.json().catch(() => ({}));
    const email = String(body.email ?? "").trim().toLowerCase();
    const password = String(body.password ?? "");
    const displayName = String(body.displayName ?? body.name ?? "").trim();
    const phone = String(body.phone ?? "").trim();
    if (!email || !password || !displayName || !phone) return NextResponse.json({ ok:false, reason:"Email, password, name and phone are required." },{status:400});
    if (password.length < 8) return NextResponse.json({ok:false,reason:"Password must contain at least 8 characters."},{status:400});
    const client=createServerSupabaseClient();if(!client)return NextResponse.json({ok:false,reason:"Supabase is not configured."},{status:503});
    const created=await client.auth.admin.createUser({email,password,email_confirm:true});
    if(created.error||!created.data.user)return NextResponse.json({ok:false,reason:created.error?.message||"Customer account could not be created."},{status:400});
    const userId=created.data.user.id;
    const profile=await client.from("profiles").insert({
      user_id:userId,display_name:displayName,phone,country:String(body.country||"Uganda"),
      location:String(body.city||"Kampala"),category:String(body.category||"client"),
      tier:"basic",verification_status:"pending",visibility:"public",account_status:"active",
      timezone:"Africa/Kampala"
    }).select("id,user_id,display_name,phone,tier,verification_status,account_status").single();
    if(profile.error){
      await client.auth.admin.deleteUser(userId);
      return NextResponse.json({ok:false,reason:profile.error.message},{status:400});
    }
    await client.from("audit_log").insert({actor_id:access.session.userId,actor_role:access.session.role,action:"CREATE_CUSTOMER",entity_type:"profiles",entity_id:userId,after_state:profile.data,metadata:{source:"manager-user-console"}});
    return NextResponse.json({ok:true,userId,profile:profile.data,message:"Customer account created by Manager."});
  } catch(error){return NextResponse.json({ok:false,reason:error instanceof Error?error.message:"Customer creation failed."},{status:400});}
}

import { NextResponse } from "next/server";
import { requireAuthenticatedRoleAccess } from "../../../../lib/aqe/auth";
import { createServerSupabaseClient } from "../../../../lib/supabaseServer";


export async function GET(request: Request) {
  const access = await requireAuthenticatedRoleAccess(request, ["manager", "admin"]);
  if (!access.ok) return NextResponse.json({ ok: false, reason: access.reason }, { status: 403 });
  const client = createServerSupabaseClient();
  if (!client) return NextResponse.json({ ok: false, reason: "Supabase is not configured." }, { status: 503 });
  const url = new URL(request.url);
  const userId = String(url.searchParams.get("userId") || "").trim();
  if (!userId) return NextResponse.json({ ok: false, reason: "Customer user ID is required." }, { status: 400 });
  const auth = await client.auth.admin.getUserById(userId);
  if (auth.error || !auth.data.user) return NextResponse.json({ ok: false, reason: "Customer account was not found." }, { status: 404 });
  const profile = await client.from("profiles").select("*").eq("user_id", userId).maybeSingle();
  const roles = await client.from("user_roles").select("role_name").eq("user_id", userId);
  return NextResponse.json({ ok: true, user: { id: userId, email: auth.data.user.email || "", phone: auth.data.user.phone || "", created_at: auth.data.user.created_at, last_sign_in_at: auth.data.user.last_sign_in_at, profile: profile.data || null, roles: (roles.data || []).map((x:any)=>x.role_name) } });
}

export async function PATCH(request: Request) {
  const access = await requireAuthenticatedRoleAccess(request, ["manager", "admin"]);
  if (!access.ok) return NextResponse.json({ ok: false, reason: access.reason }, { status: 403 });
  const client = createServerSupabaseClient();
  if (!client) return NextResponse.json({ ok: false, reason: "Supabase is not configured." }, { status: 503 });
  const body = await request.json().catch(() => ({}));
  const userId = String(body.userId || "").trim();
  if (!userId) return NextResponse.json({ ok: false, reason: "Customer user ID is required." }, { status: 400 });
  const roleRows = await client.from("user_roles").select("role_name").eq("user_id", userId);
  if ((roleRows.data || []).some((row:any)=>["manager","admin"].includes(String(row.role_name).toLowerCase()))) {
    return NextResponse.json({ ok: false, reason: "Manager/admin accounts cannot be edited from customer management." }, { status: 403 });
  }
  const profileFields=["display_name","phone","country","location","area","category","services","content_categories","age","gender","pronouns","headline","languages","availability","timezone","visibility","social_platforms","contact_methods","tier","verification_status","account_status","bio"];
  const update:any={};
  for(const key of profileFields) if(body[key] !== undefined) update[key]=body[key];
  if(Object.keys(update).length){
    update.updated_at=new Date().toISOString();
    const result=await client.from("profiles").update(update).eq("user_id",userId).select("*").maybeSingle();
    if(result.error) return NextResponse.json({ok:false,reason:result.error.message},{status:400});
  }
  if(body.email){
    const email=String(body.email).trim().toLowerCase();
    const result=await client.auth.admin.updateUserById(userId,{email,email_confirm:true});
    if(result.error) return NextResponse.json({ok:false,reason:result.error.message},{status:400});
  }
  if(body.password){
    const password=String(body.password);
    if(password.length<8)return NextResponse.json({ok:false,reason:"Password must contain at least 8 characters."},{status:400});
    const result=await client.auth.admin.updateUserById(userId,{password});
    if(result.error)return NextResponse.json({ok:false,reason:result.error.message},{status:400});
  }
  return NextResponse.json({ok:true,message:"Customer account updated successfully."});
}

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

    // Customer deletion is permitted regardless of wallet/payment state. Financial records remain for traceability.

    // Remove customer-facing identity/content records. Immutable financial/audit
    // records are deliberately retained for accounting and traceability.
    const cleanupErrors: string[] = [];
    const mediaPaths = await client.from("profile_media").select("storage_path").eq("owner_user_id", userId);
    if (mediaPaths.data?.length) {
      const storageDelete = await client.storage.from("profile-media").remove(mediaPaths.data.map((row) => row.storage_path).filter(Boolean));
      if (storageDelete.error && !/not found|does not exist/i.test(storageDelete.error.message)) {
        cleanupErrors.push("profile-media storage: " + storageDelete.error.message);
      }
    }
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
    await deleteRows("friend_requests", "sender_id", userId);
    await deleteRows("friend_requests", "recipient_id", userId);
    await deleteRows("announcement_dismissals", "user_id", userId);
    await deleteRows("vip_task_completions", "user_id", userId);
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
