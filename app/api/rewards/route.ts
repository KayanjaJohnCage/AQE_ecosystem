import { NextResponse } from "next/server";
import { resolveAuthenticatedSession } from "../../../lib/aqe/auth";
import { createServerSupabaseClient } from "../../../lib/supabaseServer";

const catalog:any={boost:{qc:500,title:"24h Profile Boost"},raffle:{qc:200,title:"Raffle Ticket"},vip:{qc:2000,title:"1 Week VIP"},cash:{qc:1000,title:"UGX 5,000 Cash"}};
const today=()=>new Date().toISOString().slice(0,10);

export async function GET(request:Request){
  const s=await resolveAuthenticatedSession(request);if(!s.authenticated||!s.userId)return NextResponse.json({ok:false,reason:"Authentication required."},{status:401});
  const c=createServerSupabaseClient();if(!c)return NextResponse.json({ok:false,reason:"Rewards service unavailable."},{status:503});
  const [claims,redemptions,prizes]=await Promise.all([
    c.from("daily_qc_claims").select("*").eq("user_id",s.userId).order("claim_date",{ascending:false}).limit(30),
    c.from("reward_redemptions").select("*").eq("user_id",s.userId).order("created_at",{ascending:false}).limit(100),
    c.from("aqe_prizes").select("*").eq("active",true).order("sort_order",{ascending:true})
  ]);
  return NextResponse.json({ok:true,dailyClaims:claims.data||[],redemptions:redemptions.data||[],prizes:prizes.data||[],catalog});
}

export async function POST(request:Request){
 try{
  const s=await resolveAuthenticatedSession(request);if(!s.authenticated||!s.userId)return NextResponse.json({ok:false,reason:"Authentication required."},{status:401});
  const body=await request.json().catch(()=>({}));const action=String(body.action||"");
  const c=createServerSupabaseClient();if(!c)return NextResponse.json({ok:false,reason:"Rewards service unavailable."},{status:503});
  if(action==="daily"){
    const date=today();const day=new Date(date+"T00:00:00Z").getUTCDay();
    const rule=await c.from("daily_checkin_rewards").select("qc_amount").eq("day_of_week",day).eq("is_active",true).maybeSingle();
    const amount=Number(rule.data?.qc_amount||0);if(amount<=0)return NextResponse.json({ok:false,reason:"Today's reward is not configured by the Manager."},{status:409});
    const claim=await c.from("daily_qc_claims").insert({user_id:s.userId,claim_date:date,amount});
    if(claim.error){if(claim.error.code==="23505")return NextResponse.json({ok:false,reason:"Today's reward has already been claimed."},{status:409});return NextResponse.json({ok:false,reason:claim.error.message},{status:400});}
    const wallet=await c.from("qc_wallet").select("balance").eq("user_id",s.userId).maybeSingle();const before=Number(wallet.data?.balance||0);const after=before+amount;
    const up=await c.from("qc_wallet").upsert({user_id:s.userId,balance:after,updated_at:new Date().toISOString()},{onConflict:"user_id"});
    if(up.error){await c.from("daily_qc_claims").delete().eq("user_id",s.userId).eq("claim_date",date);return NextResponse.json({ok:false,reason:up.error.message},{status:500});}
    const ref="DAILY-"+Date.now();
    await c.from("qc_ledger").insert({user_id:s.userId,transaction_type:"daily_reward",amount,direction:"IN",balance_after:after,reference_type:"daily_qc_claim",reference_id:ref,description:"Daily QC reward",status:"COMPLETED"});
    await c.from("transaction_receipts").insert({receipt_number:"AQE-"+Date.now(),user_id:s.userId,transaction_type:"daily_reward",source:"rewards",reference_id:ref,amount:0,currency:"UGX",qc_amount:amount,balance_before:before,balance_after:after,status:"COMPLETED",description:"Daily QC reward"});
    await c.from("notifications").insert({user_id:s.userId,type:"reward",title:"Daily reward claimed",body:amount+" QC has been added to your QC wallet.",reference_type:"daily_qc_claim",reference_id:ref});
    return NextResponse.json({ok:true,amount,balance:after});
  }
  if(action==="redeem"){
    const key=String(body.rewardKey||"");const reward=catalog[key];if(!reward)return NextResponse.json({ok:false,reason:"Unknown reward."},{status:400});
    const profile=await c.from("profiles").select("tier,verification_status").eq("user_id",s.userId).maybeSingle();
    if(key==="vip"&&String(profile.data?.tier||"").toLowerCase()!=="vip")return NextResponse.json({ok:false,reason:"VIP membership is required for this reward."},{status:403});
    const wallet=await c.from("qc_wallet").select("balance").eq("user_id",s.userId).maybeSingle();const before=Number(wallet.data?.balance||0);if(before<reward.qc)return NextResponse.json({ok:false,reason:"Not enough QC."},{status:409});
    const after=before-reward.qc;const up=await c.from("qc_wallet").update({balance:after,updated_at:new Date().toISOString()}).eq("user_id",s.userId).gte("balance",reward.qc);
    if(up.error)return NextResponse.json({ok:false,reason:up.error.message},{status:500});
    const ref="REWARD-"+Date.now();const red=await c.from("reward_redemptions").insert({user_id:s.userId,reward_key:key,qc_cost:reward.qc,metadata:{title:reward.title}}).select("*").single();
    await c.from("qc_ledger").insert({user_id:s.userId,transaction_type:"reward_redemption",amount:reward.qc,direction:"OUT",balance_after:after,reference_type:"reward_redemption",reference_id:red.data?.id||ref,description:reward.title,status:"COMPLETED"});
    await c.from("transaction_receipts").insert({receipt_number:"AQE-"+Date.now(),user_id:s.userId,transaction_type:"reward_redemption",source:"rewards",reference_id:red.data?.id||ref,amount:0,currency:"UGX",qc_amount:reward.qc,balance_before:before,balance_after:after,status:"COMPLETED",description:reward.title});
    await c.from("notifications").insert({user_id:s.userId,type:"reward",title:"Reward redeemed",body:reward.title+" redeemed for "+reward.qc+" QC."});
    return NextResponse.json({ok:true,reward,balance:after,redemption:red.data});
  }
  return NextResponse.json({ok:false,reason:"Unsupported reward action."},{status:400});
 }catch(error){return NextResponse.json({ok:false,reason:error instanceof Error?error.message:"Reward action failed."},{status:400});}
}