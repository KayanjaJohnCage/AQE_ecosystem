import { NextResponse } from "next/server";
import { resolveAuthenticatedSession } from "../../../lib/aqe/auth";
import { createServerSupabaseClient } from "../../../lib/supabaseServer";
export async function GET(request:Request){
  const s=await resolveAuthenticatedSession(request);if(!s.authenticated||!s.userId)return NextResponse.json({ok:false,reason:"Authentication required."},{status:401});
  const c=createServerSupabaseClient();if(!c)return NextResponse.json({ok:false,reason:"Earnings service unavailable."},{status:503});
  const [creator,referral]=await Promise.all([
    c.from("creator_earnings").select("*").eq("creator_id",s.userId).order("created_at",{ascending:false}).limit(100),
    c.from("referral_earnings").select("*").eq("beneficiary_user_id",s.userId).order("created_at",{ascending:false}).limit(100)
  ]);
  if(creator.error||referral.error)return NextResponse.json({ok:false,reason:creator.error?.message||referral.error?.message},{status:500});
  const creatorRows=creator.data||[],refRows=referral.data||[];
  return NextResponse.json({ok:true,creatorEarnings:creatorRows,referralEarnings:refRows,totalCreator:creatorRows.reduce((n,x)=>n+Number(x.net_amount||0),0),totalReferral:refRows.filter((x:any)=>x.status==="CREDITED").reduce((n,x)=>n+Number(x.amount||0),0),currency:"UGX"});
}