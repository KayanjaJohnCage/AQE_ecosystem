import { NextResponse } from "next/server";
import { requireAuthenticatedRoleAccess } from "../../../../lib/aqe/auth";
import { createServerSupabaseClient } from "../../../../lib/supabaseServer";

export async function GET(request: Request) {
  const access=await requireAuthenticatedRoleAccess(request,["customer","manager","admin"]);
  if(!access.ok)return NextResponse.json({ok:false,reason:access.reason},{status:401});
  const client=createServerSupabaseClient();if(!client)return NextResponse.json({ok:true,salary:0,unlockDay:20,unlocked:new Date().getUTCDate()>=20});
  const profile=await client.from("profiles").select("tier,verification_status").eq("user_id",access.session.userId).maybeSingle();
  if(profile.data?.tier!=="vip")return NextResponse.json({ok:false,reason:"VIP membership is required."},{status:403});
  const now=new Date(), monthStart=new Date(Date.UTC(now.getUTCFullYear(),now.getUTCMonth(),1)).toISOString(), nextMonth=new Date(Date.UTC(now.getUTCFullYear(),now.getUTCMonth()+1,1)).toISOString();
  const rows=await client.from("vip_salary_payments").select("*").eq("user_id",access.session.userId).gte("created_at",monthStart).lt("created_at",nextMonth).order("created_at",{ascending:false});
  if(rows.error)return NextResponse.json({ok:false,reason:rows.error.message},{status:500});
  const salary=(rows.data||[]).reduce((n:any,x:any)=>n+Number(x.amount||0),0);
  return NextResponse.json({ok:true,salary,unlockDay:20,unlocked:now.getUTCDate()>=20,month:monthStart,records:rows.data||[]});
}
