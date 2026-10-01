import { NextResponse } from "next/server";
import { requireAuthenticatedRoleAccess } from "../../../../lib/aqe/auth";
import { createServerSupabaseClient } from "../../../../lib/supabaseServer";

export async function DELETE(request: Request) {
  try {
    const access = await requireAuthenticatedRoleAccess(request, ["customer","manager","admin"]);
    if (!access.ok || !access.session.userId) return NextResponse.json({ ok:false, reason:access.reason ?? "Authentication required." }, {status:401});
    const body = await request.json().catch(() => ({}));
    const mediaId = String(body.mediaId ?? "").trim();
    if (!mediaId) return NextResponse.json({ok:false,reason:"Media ID is required."},{status:400});
    const client = createServerSupabaseClient();
    if (!client) return NextResponse.json({ok:false,reason:"Media service is not configured."},{status:503});

    const current = await client.from("profile_media")
      .select("id,owner_user_id,storage_path,is_profile_photo")
      .eq("id",mediaId).maybeSingle();
    if (current.error || !current.data) return NextResponse.json({ok:false,reason:current.error?.message ?? "Media not found."},{status:404});

    const isManager = access.session.role === "manager" || access.session.role === "admin";
    if (!isManager && current.data.owner_user_id !== access.session.userId) {
      return NextResponse.json({ok:false,reason:"You can only remove your own media."},{status:403});
    }

    const removed = await client.storage.from("profile-media").remove([current.data.storage_path]);
    if (removed.error) return NextResponse.json({ok:false,reason:removed.error.message},{status:500});

    const deleted = await client.from("profile_media").delete().eq("id",mediaId);
    if (deleted.error) return NextResponse.json({ok:false,reason:deleted.error.message},{status:500});

    if (current.data.is_profile_photo) {
      await client.from("profiles").update({profile_photo_id:null,updated_at:new Date().toISOString()}).eq("user_id",current.data.owner_user_id).eq("profile_photo_id",mediaId);
    }

    return NextResponse.json({ok:true,deletedId:mediaId});
  } catch (error) {
    return NextResponse.json({ok:false,reason:error instanceof Error?error.message:"Media deletion failed."},{status:400});
  }
}

export async function PATCH(request: Request) {
  try {
    const access = await requireAuthenticatedRoleAccess(request, ["customer","manager","admin"]);
    if (!access.ok || !access.session.userId) return NextResponse.json({ok:false,reason:access.reason ?? "Authentication required."},{status:401});
    const body=await request.json().catch(()=>({}));
    const mediaId=String(body.mediaId??"").trim();
    const contentAccess=String(body.contentAccess??"").trim();
    if(!mediaId || !["public","subscribers_only"].includes(contentAccess)) return NextResponse.json({ok:false,reason:"Media ID and valid content access are required."},{status:400});
    const client=createServerSupabaseClient();
    if(!client) return NextResponse.json({ok:false,reason:"Media service is not configured."},{status:503});
    const current=await client.from("profile_media").select("id,owner_user_id").eq("id",mediaId).maybeSingle();
    if(current.error||!current.data) return NextResponse.json({ok:false,reason:current.error?.message??"Media not found."},{status:404});
    if(!["manager","admin"].includes(access.session.role) && current.data.owner_user_id!==access.session.userId) return NextResponse.json({ok:false,reason:"You can only edit your own media."},{status:403});
    const updated=await client.from("profile_media").update({content_access:contentAccess,updated_at:new Date().toISOString()}).eq("id",mediaId).select("id,content_access").single();
    if(updated.error) return NextResponse.json({ok:false,reason:updated.error.message},{status:500});
    return NextResponse.json({ok:true,media:updated.data});
  }catch(error){return NextResponse.json({ok:false,reason:error instanceof Error?error.message:"Media update failed."},{status:400});}
}
