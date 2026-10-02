import { NextResponse } from "next/server";
import { requireAuthenticatedRoleAccess } from "../../../../lib/aqe/auth";
import { createServerSupabaseClient } from "../../../../lib/supabaseServer";

export async function GET(request: Request) {
  const access=await requireAuthenticatedRoleAccess(request,["customer","manager","admin"]);
  if(!access.ok)return NextResponse.json({ok:false,reason:access.reason},{status:401});
  const client=createServerSupabaseClient();if(!client)return NextResponse.json({ok:true,tasks:[]});
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
  const taskId=String(body.taskId??"").trim();
  if(!taskId)return NextResponse.json({ok:false,reason:"Task ID is required."},{status:400});
  const profile=await client.from("profiles").select("tier,verification_status").eq("user_id",access.session.userId).maybeSingle();
  if(profile.data?.tier!=="vip"||profile.data?.verification_status!=="approved")return NextResponse.json({ok:false,reason:"Verified VIP membership is required for VIP tasks."},{status:403});
  const row=await client.from("vip_task_completions").upsert({task_id:taskId,user_id:access.session.userId,status:"completed"},{onConflict:"task_id,user_id"}).select("*").single();
  if(row.error)return NextResponse.json({ok:false,reason:row.error.message},{status:500});
  return NextResponse.json({ok:true,completion:row.data,message:"VIP task marked complete and sent for Manager review."});
}

export async function POST_manager(request: Request) { return NextResponse.json({ok:false},{status:405}); }
