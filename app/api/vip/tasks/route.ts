import { NextResponse } from "next/server";
import { requireAuthenticatedRoleAccess } from "../../../../lib/aqe/auth";
import { createServerSupabaseClient } from "../../../../lib/supabaseServer";

export async function GET(request: Request) {
  const access=await requireAuthenticatedRoleAccess(request,["customer","manager","admin"]);
  if(!access.ok)return NextResponse.json({ok:false,reason:access.reason},{status:401});
  const client=createServerSupabaseClient();if(!client)return NextResponse.json({ok:true,tasks:[]});
  const managerRequested=new URL(request.url).searchParams.get("manager")==="1";
  if(managerRequested){
    if(!["manager","admin"].includes(String(access.session.role).toLowerCase()))return NextResponse.json({ok:false,reason:"Manager access required."},{status:403});
    const all=await client.from("vip_tasks").select("*").order("sort_order",{ascending:true}).order("created_at",{ascending:false}).limit(100);
    if(all.error)return NextResponse.json({ok:false,reason:all.error.message},{status:500});
    return NextResponse.json({ok:true,tasks:all.data??[]});
  }
  const now=new Date().toISOString();
  const {data,error}=await client.from("vip_tasks").select("*").eq("active",true)
    .or(`starts_at.is.null,starts_at.lte.${now}`).or(`ends_at.is.null,ends_at.gte.${now}`)
    .order("sort_order",{ascending:true}).order("created_at",{ascending:false});
  if(error)return NextResponse.json({ok:false,reason:error.message},{status:500});
  const completed=await client.from("vip_task_completions").select("task_id,status").eq("user_id",access.session.userId);
  const done=new Map((completed.data??[]).map(x=>[x.task_id,x.status]));
  return NextResponse.json({ok:true,tasks:(data??[]).map(x=>({...x,completionStatus:done.get(x.id)||null}))});
}

export async function POST(request: Request) {
  const access=await requireAuthenticatedRoleAccess(request,["customer","manager","admin"]);
  if(!access.ok)return NextResponse.json({ok:false,reason:access.reason},{status:401});
  const client=createServerSupabaseClient();if(!client)return NextResponse.json({ok:false,reason:"Supabase is not configured."},{status:503});
  const body=await request.json().catch(()=>({}));
  const managerAction=String(body.managerAction||"");
  if(managerAction){
    if(!["manager","admin"].includes(String(access.session.role).toLowerCase()))return NextResponse.json({ok:false,reason:"Manager access required."},{status:403});
    if(managerAction==="create"){
      const title=String(body.title||"").trim();if(!title)return NextResponse.json({ok:false,reason:"Task title is required."},{status:400});
      const startsAt = body.startsAt ? new Date(String(body.startsAt)).toISOString() : null;
      const endsAt = body.endsAt ? new Date(String(body.endsAt)).toISOString() : null;
      if (startsAt && endsAt && new Date(endsAt).getTime() <= new Date(startsAt).getTime()) return NextResponse.json({ok:false,reason:"Task end time must be after the start time."},{status:400});
      const row=await client.from("vip_tasks").insert({
        title,description:String(body.description||""),task_type:String(body.taskType||"general"),
        reward_qc:Number(body.rewardQc||0),reward_cash:Number(body.rewardCash||0),
        active:body.active !== false,starts_at:startsAt,ends_at:endsAt,
        sort_order:Number.isInteger(Number(body.sortOrder)) ? Number(body.sortOrder) : 0,
        created_by:access.session.userId,updated_at:new Date().toISOString()
      }).select("*").single();
      if(row.error)return NextResponse.json({ok:false,reason:row.error.message},{status:500});
      return NextResponse.json({ok:true,task:row.data,message:"VIP task published."});
    }
    if(managerAction==="delete"){
      const id=String(body.id||"").trim();if(!id)return NextResponse.json({ok:false,reason:"Task ID is required."},{status:400});
      const row=await client.from("vip_tasks").delete().eq("id",id).select("id").maybeSingle();
      if(row.error)return NextResponse.json({ok:false,reason:row.error.message},{status:500});
      return NextResponse.json({ok:true,message:"VIP task deleted."});
    }
  }
  const taskId=String(body.taskId??"").trim();
  if(!taskId)return NextResponse.json({ok:false,reason:"Task ID is required."},{status:400});
  const profile=await client.from("profiles").select("tier,verification_status").eq("user_id",access.session.userId).maybeSingle();
  if(profile.data?.tier!=="vip"||profile.data?.verification_status!=="approved")return NextResponse.json({ok:false,reason:"Verified VIP membership is required for VIP tasks."},{status:403});
  const row=await client.from("vip_task_completions").upsert({task_id:taskId,user_id:access.session.userId,status:"completed"},{onConflict:"task_id,user_id"}).select("*").single();
  if(row.error)return NextResponse.json({ok:false,reason:row.error.message},{status:500});
  return NextResponse.json({ok:true,completion:row.data,message:"VIP task marked complete and sent for Manager review."});
}
