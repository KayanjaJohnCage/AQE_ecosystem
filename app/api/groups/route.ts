import { NextResponse } from "next/server";
import { resolveAuthenticatedSession } from "../../../lib/aqe/auth";
import { createServerSupabaseClient } from "../../../lib/supabaseServer";

export async function GET(request:Request){
  const s=await resolveAuthenticatedSession(request);
  if(!s.authenticated||!s.userId)return NextResponse.json({ok:false,reason:"Authentication required."},{status:401});
  const c=createServerSupabaseClient(); if(!c)return NextResponse.json({ok:false,reason:"Groups service unavailable."},{status:503});
  const {data,error}=await c.from("aqe_group_members").select("group_id,role,joined_at,aqe_groups(id,name,description,status,owner_id,created_at)").eq("user_id",s.userId).order("joined_at",{ascending:false});
  if(error)return NextResponse.json({ok:false,reason:error.message},{status:500});
  return NextResponse.json({ok:true,groups:(data||[]).map((x:any)=>Object.assign({},x.aqe_groups,{role:x.role,joined_at:x.joined_at}))});
}
export async function POST(request:Request){
  try{
    const s=await resolveAuthenticatedSession(request);
    if(!s.authenticated||!s.userId)return NextResponse.json({ok:false,reason:"Authentication required."},{status:401});
    const body=await request.json().catch(()=>({}));
    const c=createServerSupabaseClient();if(!c)return NextResponse.json({ok:false,reason:"Groups service unavailable."},{status:503});
    if(String(body.action||"") === "join"){
      const groupId=String(body.groupId||"").trim();if(!groupId)return NextResponse.json({ok:false,reason:"Group ID is required."},{status:400});
      const row=await c.from("aqe_group_members").insert({group_id:groupId,user_id:s.userId,role:"member"}).select("*").single();
      if(row.error)return NextResponse.json({ok:false,reason:row.error.message},{status:400});
      return NextResponse.json({ok:true,membership:row.data});
    }
    const profile=await c.from("profiles").select("tier,verification_status").eq("user_id",s.userId).maybeSingle();
    if(String(profile.data?.tier||"").toLowerCase()!=="vip"||profile.data?.verification_status!=="approved")return NextResponse.json({ok:false,reason:"Verified VIP membership is required for groups."},{status:403});
    const name=String(body.name||"").trim();if(!name)return NextResponse.json({ok:false,reason:"Group name is required."},{status:400});
    const group=await c.from("aqe_groups").insert({owner_id:s.userId,name,description:String(body.description||"").trim()||null}).select("*").single();
    if(group.error)return NextResponse.json({ok:false,reason:group.error.message},{status:400});
    const member=await c.from("aqe_group_members").insert({group_id:group.data.id,user_id:s.userId,role:"owner"});
    if(member.error){await c.from("aqe_groups").delete().eq("id",group.data.id);return NextResponse.json({ok:false,reason:member.error.message},{status:400});}
    return NextResponse.json({ok:true,group:group.data});
  }catch(error){return NextResponse.json({ok:false,reason:error instanceof Error?error.message:"Group operation failed."},{status:400});}
}
export async function DELETE(request:Request){
  const s=await resolveAuthenticatedSession(request);if(!s.authenticated||!s.userId)return NextResponse.json({ok:false,reason:"Authentication required."},{status:401});
  const id=new URL(request.url).searchParams.get("id");if(!id)return NextResponse.json({ok:false,reason:"Group ID is required."},{status:400});
  const c=createServerSupabaseClient();if(!c)return NextResponse.json({ok:false,reason:"Groups service unavailable."},{status:503});
  const d=await c.from("aqe_groups").delete().eq("id",id).eq("owner_id",s.userId);if(d.error)return NextResponse.json({ok:false,reason:d.error.message},{status:400});
  return NextResponse.json({ok:true});
}