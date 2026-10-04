import { NextResponse } from "next/server";
import { requireAuthenticatedRoleAccess } from "../../../lib/aqe/auth";
import { createAnonSupabaseClient, createServerSupabaseClient } from "../../../lib/supabaseServer";

export async function GET(request: Request) {
  let client=createServerSupabaseClient();
  const access=await requireAuthenticatedRoleAccess(request,["customer","manager","admin"]);
  const managerRequested=new URL(request.url).searchParams.get("manager")==="1";
  if(!client && !managerRequested) client=createAnonSupabaseClient();
  if(!client) return NextResponse.json({ok:true,announcements:[]});
  const userId=access.ok?access.session.userId:null;
  const now=new Date().toISOString();
  const managerAccess=managerRequested ? await requireAuthenticatedRoleAccess(request,["manager","admin"]) : null;
  if(managerRequested && !managerAccess?.ok) return NextResponse.json({ok:false,reason:managerAccess?.reason||"Manager access required."},{status:403});
  let {data,error}= managerRequested
    ? await client.from("announcements").select("*").order("created_at",{ascending:false}).limit(100)
    : await client.from("announcements").select("*").eq("published",true)
    .or(`starts_at.is.null,starts_at.lte.${now}`).or(`ends_at.is.null,ends_at.gte.${now}`)
    .order("created_at",{ascending:false}).limit(20);
  if(error && !managerRequested) {
    const fallback=createAnonSupabaseClient();
    if(fallback) {
      const retry=await fallback.from("announcements").select("*").eq("published",true)
        .or(`starts_at.is.null,starts_at.lte.${now}`).or(`ends_at.is.null,ends_at.gte.${now}`)
        .order("created_at",{ascending:false}).limit(20);
      data=retry.data; error=retry.error;
    }
  }
  if(error) return NextResponse.json({ok:false,reason:error.message},{status:500});
  if(managerRequested) return NextResponse.json({ok:true,announcements:data??[]});
  let dismissed=new Set<string>();
  if(userId){
    const d=await client.from("announcement_dismissals").select("announcement_id").eq("user_id",userId);
    dismissed=new Set((d.data??[]).map(x=>x.announcement_id));
  }
  return NextResponse.json({ok:true,announcements:(data??[]).map(x=>({...x,dismissed:dismissed.has(x.id)}))});
}

export async function POST(request: Request) {
  const body=await request.json().catch(()=>({}));
  if(String(body.action||"")==="dismiss"){
    const customer=await requireAuthenticatedRoleAccess(request,["customer","manager","admin"]);
    if(!customer.ok)return NextResponse.json({ok:false,reason:customer.reason},{status:401});
    const client=createServerSupabaseClient();if(!client)return NextResponse.json({ok:false,reason:"Supabase is not configured."},{status:503});
    const id=String(body.id||"").trim();if(!id)return NextResponse.json({ok:false,reason:"Announcement ID is required."},{status:400});
    const row=await client.from("announcement_dismissals").upsert({announcement_id:id,user_id:customer.session.userId},{onConflict:"announcement_id,user_id"}).select("id").single();
    if(row.error)return NextResponse.json({ok:false,reason:row.error.message},{status:500});
    return NextResponse.json({ok:true,message:"Announcement dismissed."});
  }
  const access=await requireAuthenticatedRoleAccess(request,["manager","admin"]);
  if(!access.ok) return NextResponse.json({ok:false,reason:access.reason},{status:403});
  const client=createServerSupabaseClient();if(!client)return NextResponse.json({ok:false,reason:"Supabase is not configured."},{status:503});
  const title=String(body.title??"").trim(), message=String(body.message??"").trim();
  if(!title||!message)return NextResponse.json({ok:false,reason:"Title and message are required."},{status:400});
  const row=await client.from("announcements").insert({title,message,kind:String(body.kind??"general"),priority:String(body.priority??"normal"),image_url:body.imageUrl?String(body.imageUrl):null,published:body.published!==false,starts_at:body.startsAt||null,ends_at:body.endsAt||null,created_by:access.session.userId}).select("*").single();
  if(row.error)return NextResponse.json({ok:false,reason:row.error.message},{status:500});
  return NextResponse.json({ok:true,announcement:row.data,message:"Announcement published successfully."});
}

export async function PATCH(request: Request) {
  const access=await requireAuthenticatedRoleAccess(request,["manager","admin"]);
  if(!access.ok)return NextResponse.json({ok:false,reason:access.reason},{status:403});
  const client=createServerSupabaseClient();if(!client)return NextResponse.json({ok:false,reason:"Supabase is not configured."},{status:503});
  const body=await request.json().catch(()=>({}));const id=String(body.id??"").trim();if(!id)return NextResponse.json({ok:false,reason:"Announcement ID is required."},{status:400});
  const allowed=["title","message","kind","priority","image_url","published","starts_at","ends_at"] as const;
  const update:Record<string,unknown>={updated_at:new Date().toISOString()};
  for(const key of allowed)if(body[key]!==undefined)update[key]=body[key];
  const row=await client.from("announcements").update(update).eq("id",id).select("*").single();
  if(row.error)return NextResponse.json({ok:false,reason:row.error.message},{status:500});
  return NextResponse.json({ok:true,announcement:row.data,message:"Announcement updated."});
}

export async function DELETE(request: Request) {
  const access=await requireAuthenticatedRoleAccess(request,["manager","admin"]);
  if(!access.ok)return NextResponse.json({ok:false,reason:access.reason},{status:403});
  const client=createServerSupabaseClient();if(!client)return NextResponse.json({ok:false,reason:"Supabase is not configured."},{status:503});
  const body=await request.json().catch(()=>({}));const id=String(body.id??"").trim();if(!id)return NextResponse.json({ok:false,reason:"Announcement ID is required."},{status:400});
  const row=await client.from("announcements").delete().eq("id",id).select("id").maybeSingle();
  if(row.error)return NextResponse.json({ok:false,reason:row.error.message},{status:500});
  return NextResponse.json({ok:true,message:"Announcement deleted."});
}
