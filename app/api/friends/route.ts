import { NextResponse } from "next/server";
import { requireAuthenticatedRoleAccess, resolveMutationUserId } from "../../../lib/aqe/auth";
import { createServerSupabaseClient } from "../../../lib/supabaseServer";

async function auth(request: Request) {
  return requireAuthenticatedRoleAccess(request, ["customer","manager","admin"]);
}

export async function GET(request: Request) {
  const access = await auth(request);
  if (!access.ok) return NextResponse.json({ok:false,reason:access.reason},{status:401});
  const client=createServerSupabaseClient();
  if(!client) return NextResponse.json({ok:false,reason:"Friend service is not configured."},{status:503});
  const {data,error}=await client.from("friend_requests").select("*")
    .or(`sender_id.eq.${access.session.userId},recipient_id.eq.${access.session.userId}`)
    .order("created_at",{ascending:false}).limit(100);
  if(error) return NextResponse.json({ok:false,reason:error.message},{status:500});
  return NextResponse.json({ok:true,requests:data??[]});
}

export async function POST(request: Request) {
  const identity=await resolveMutationUserId(request);
  if(!identity.ok) return NextResponse.json({ok:false,reason:identity.reason},{status:401});
  const body=await request.json().catch(()=>({}));
  const recipientId=String(body.recipientId??"").trim();
  if(!recipientId||recipientId===identity.userId) return NextResponse.json({ok:false,reason:"Choose another registered user."},{status:400});
  const client=createServerSupabaseClient();
  if(!client) return NextResponse.json({ok:false,reason:"Friend service is not configured."},{status:503});
  const target=await client.from("profiles").select("user_id,display_name,verification_status,visibility").eq("user_id",recipientId).maybeSingle();
  if(target.error||!target.data) return NextResponse.json({ok:false,reason:"That user is not registered."},{status:404});
  if(target.data.visibility!=="public") return NextResponse.json({ok:false,reason:"That profile is not accepting public requests."},{status:403});
  const existing=await client.from("friend_requests").select("id,status,sender_id,recipient_id").or(`and(sender_id.eq.${identity.userId},recipient_id.eq.${recipientId}),and(sender_id.eq.${recipientId},recipient_id.eq.${identity.userId})`).order("created_at",{ascending:false}).limit(1).maybeSingle();
  if(existing.data){
    if(existing.data.status==="pending") return NextResponse.json({ok:false,reason:"Friend request already sent."},{status:409});
    if(existing.data.status==="accepted") return NextResponse.json({ok:false,reason:"You are already friends."},{status:409});
  }
  const inserted=await client.from("friend_requests").insert({sender_id:identity.userId,recipient_id:recipientId,status:"pending"}).select("*").single();
  if(inserted.error) return NextResponse.json({ok:false,reason:inserted.error.message},{status:500});
  await client.from("notifications").insert({user_id:recipientId,type:"friend_request",title:"New friend request",body:"You received a new friend request on AQE.",reference_type:"friend_request",reference_id:inserted.data.id,dedupe_key:`friend-request:${inserted.data.id}`,metadata:{sender_id:identity.userId}});
  return NextResponse.json({ok:true,request:inserted.data,message:"Friend request sent successfully."});
}

export async function PATCH(request: Request) {
  const access=await auth(request);
  if(!access.ok) return NextResponse.json({ok:false,reason:access.reason},{status:401});
  const body=await request.json().catch(()=>({}));
  const id=String(body.id??"").trim(), status=String(body.status??"").toLowerCase();
  if(!id||!["accepted","rejected","cancelled"].includes(status)) return NextResponse.json({ok:false,reason:"Request ID and valid status are required."},{status:400});
  const client=createServerSupabaseClient();
  if(!client) return NextResponse.json({ok:false,reason:"Friend service is not configured."},{status:503});
  const row=await client.from("friend_requests").select("*").eq("id",id).maybeSingle();
  if(row.error||!row.data) return NextResponse.json({ok:false,reason:"Friend request not found."},{status:404});
  const uid=access.session.userId;
  const allowed=(status==="cancelled"&&row.data.sender_id===uid)||(status!=="cancelled"&&row.data.recipient_id===uid);
  if(!allowed) return NextResponse.json({ok:false,reason:"You cannot change this request."},{status:403});
  const updated=await client.from("friend_requests").update({status,updated_at:new Date().toISOString()}).eq("id",id).select("*").single();
  if(updated.error) return NextResponse.json({ok:false,reason:updated.error.message},{status:500});
  if(status==="accepted") await client.from("notifications").insert({user_id:row.data.sender_id,type:"friend_request",title:"Friend request accepted",body:"Your AQE friend request was accepted.",reference_type:"friend_request",reference_id:id,metadata:{}});
  return NextResponse.json({ok:true,request:updated.data,message:`Friend request ${status}.`});
}
