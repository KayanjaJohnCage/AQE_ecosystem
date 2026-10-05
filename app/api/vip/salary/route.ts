import { NextResponse } from "next/server";
import { requireAuthenticatedRoleAccess, resolveMutationUserId } from "../../../../lib/aqe/auth";
import { createServerSupabaseClient } from "../../../../lib/supabaseServer";

function kampalaParts() {
  const parts = new Intl.DateTimeFormat("en-UG", {
    timeZone: "Africa/Kampala",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(new Date());
  return {
    year: Number(parts.find((part) => part.type === "year")?.value || 0),
    month: String(parts.find((part) => part.type === "month")?.value || "01").padStart(2, "0"),
    day: Number(parts.find((part) => part.type === "day")?.value || 0),
  };
}

function status() {
  const local = kampalaParts();
  return { day: local.day, unlocked: local.day >= 20, period: `${local.year}-${local.month}` };
}

export async function GET(request: Request) {
  const url = new URL(request.url);
  const managerMode = url.searchParams.get("manager") === "1";
  const access = await requireAuthenticatedRoleAccess(request, managerMode ? ["manager","admin"] : ["customer","manager","admin"]);
  if (!access.ok) return NextResponse.json({ok:false,reason:access.reason},{status:403});
  const client = createServerSupabaseClient();
  if (!client) return NextResponse.json({ok:false,reason:"VIP salary service is unavailable."},{status:503});

  if (managerMode) {
    const rows = await client.from("vip_salary_withdrawals").select("*").order("created_at",{ascending:false}).limit(100);
    if (rows.error) return NextResponse.json({ok:false,reason:rows.error.message},{status:500});
    return NextResponse.json({ok:true,requests:rows.data||[]});
  }

  const profile = await client.from("profiles").select("tier,verification_status").eq("user_id",access.session.userId).maybeSingle();
  if (profile.error || !profile.data) return NextResponse.json({ok:false,reason:"Profile not found."},{status:404});
  if (String(profile.data.tier).toLowerCase() !== "vip") return NextResponse.json({ok:false,reason:"VIP membership is required."},{status:403});

  const s = status();
  const period = s.period;
  let room = await client.from("vip_asset_rooms").select("salary_balance,withdrawn_salary_total").eq("user_id",access.session.userId).maybeSingle();
  if (room.error) return NextResponse.json({ok:false,reason:room.error.message},{status:500});

  const refs = await client.from("profiles")
    .select("user_id,verification_status")
    .eq("referred_by",access.session.userId)
    .eq("tier","vip");
  if (refs.error) return NextResponse.json({ok:false,reason:refs.error.message},{status:500});
  const directVipReferralCount = (refs.data||[]).filter(
    (r:any)=>String(r.verification_status||"").toLowerCase()==="approved"
  ).length;
  const accrued = directVipReferralCount * 10000;

  if (s.unlocked) {
    const existingPayment = await client.from("vip_salary_payments")
      .select("id,amount,invite_count")
      .eq("user_id",access.session.userId)
      .eq("period",period)
      .maybeSingle();
    if (existingPayment.error) return NextResponse.json({ok:false,reason:existingPayment.error.message},{status:500});

    const previousAmount = Number(existingPayment.data?.amount||0);
    const delta = Math.max(0,accrued-previousAmount);

    const saved = await client.from("vip_salary_payments").upsert({
      user_id:access.session.userId,
      period,
      invite_count:directVipReferralCount,
      salary_per_invite:10000,
      amount:accrued,
      currency:"UGX",
      status:"credited"
    },{onConflict:"user_id,period"}).select("id").maybeSingle();
    if (saved.error) return NextResponse.json({ok:false,reason:saved.error.message},{status:500});

    if (delta>0) {
      const current = Number(room.data?.salary_balance??0);
      const updated = await client.from("vip_asset_rooms")
        .update({
          salary_balance:current+delta,
          updated_at:new Date().toISOString()
        })
        .eq("user_id",access.session.userId)
        .eq("salary_balance",current);
      if (updated.error) return NextResponse.json({ok:false,reason:updated.error.message},{status:500});
      room = await client.from("vip_asset_rooms")
        .select("salary_balance,withdrawn_salary_total")
        .eq("user_id",access.session.userId)
        .maybeSingle();
    }
  }

  const salaryBalance = Number(room.data?.salary_balance??0);
  const withdrawn = Number(room.data?.withdrawn_salary_total??0);

  return NextResponse.json({
    ok:true,
    salary:salaryBalance,
    accrued,
    directVipReferralCount,
    salaryPerVipReferral:10000,
    withdrawn,
unlockDay:20,
    unlocked:s.unlocked,currentDay:s.day,
    message:s.unlocked ? "VIP salary is credited for this month. Withdrawals are open." : "VIP salary withdrawal is locked until the 20th."
  });
}

export async function POST(request: Request) {
  const access = await requireAuthenticatedRoleAccess(request, ["customer"]);
  if (!access.ok) return NextResponse.json({ok:false,reason:access.reason},{status:403});
  const s=status();
  if (!s.unlocked) return NextResponse.json({ok:false,reason:"VIP salary withdrawal is locked until the 20th."},{status:409});
  const body=await request.json().catch(()=>({}));
  const amount=Number(body.amount??0), recipientName=String(body.recipientName??"").trim(), recipientAccount=String(body.recipientAccount??"").trim();
  if(!Number.isFinite(amount)||amount<=0)return NextResponse.json({ok:false,reason:"Enter a valid VIP salary withdrawal amount."},{status:400});
  if(!recipientName||!recipientAccount)return NextResponse.json({ok:false,reason:"Recipient name and phone/card number are required."},{status:400});
  const client=createServerSupabaseClient();if(!client)return NextResponse.json({ok:false,reason:"VIP salary service is unavailable."},{status:503});
  const profile=await client.from("profiles").select("tier").eq("user_id",access.session.userId).maybeSingle();
  if(String(profile.data?.tier||"").toLowerCase()!=="vip")return NextResponse.json({ok:false,reason:"VIP membership is required."},{status:403});
  const room=await client.from("vip_asset_rooms").select("salary_balance,withdrawn_salary_total").eq("user_id",access.session.userId).maybeSingle();
  const balance=Number(room.data?.salary_balance??0);
  if(balance<amount)return NextResponse.json({ok:false,reason:"Insufficient VIP salary balance."},{status:409});
  const inserted=await client.from("vip_salary_withdrawals").insert({
    user_id:access.session.userId,amount,currency:"UGX",recipient_name:recipientName,
    recipient_account:recipientAccount,payment_method:String(body.paymentMethod??"MOBILE_MONEY"),status:"PENDING"
  }).select("*").single();
  if(inserted.error)return NextResponse.json({ok:false,reason:inserted.error.message},{status:500});
  const updated=await client.from("vip_asset_rooms").update({
    salary_balance:balance-amount,withdrawn_salary_total:Number(room.data?.withdrawn_salary_total??0)+amount,updated_at:new Date().toISOString()
  }).eq("user_id",access.session.userId).eq("salary_balance",balance);
  if(updated.error || !updated.data){
    await client.from("vip_salary_withdrawals").delete().eq("id",inserted.data.id);
    return NextResponse.json({ok:false,reason:updated.error?.message||"Salary balance changed. Please retry."},{status:409});
  }
  await client.from("notifications").insert({
    user_id:access.session.userId,type:"vip_salary_withdrawal",title:"VIP salary withdrawal submitted",
    body:"Your VIP salary withdrawal request was sent to Manager Support.",reference_type:"vip_salary_withdrawal",
    reference_id:inserted.data.id,metadata:{amount},created_at:new Date().toISOString()
  });
  return NextResponse.json({ok:true,saved:true,request:inserted.data,message:"VIP salary withdrawal request submitted successfully."});
}

export async function PATCH(request: Request) {
  const access=await requireAuthenticatedRoleAccess(request,["manager","admin"]);
  if(!access.ok)return NextResponse.json({ok:false,reason:access.reason},{status:403});
  const body=await request.json().catch(()=>({})),id=String(body.requestId??"").trim(),next=String(body.status??"").toUpperCase();
  if(!id||!["APPROVED","REJECTED","PAID"].includes(next))return NextResponse.json({ok:false,reason:"Valid salary withdrawal request and status are required."},{status:400});
  const client=createServerSupabaseClient();if(!client)return NextResponse.json({ok:false,reason:"VIP salary service is unavailable."},{status:503});
  const current=await client.from("vip_salary_withdrawals").select("*").eq("id",id).maybeSingle();
  if(current.error||!current.data)return NextResponse.json({ok:false,reason:"Salary withdrawal request not found."},{status:404});
  if(["REJECTED","PAID"].includes(String(current.data.status).toUpperCase()))return NextResponse.json({ok:false,reason:"This salary withdrawal is already closed."},{status:409});
  const updated=await client.from("vip_salary_withdrawals").update({status:next,updated_at:new Date().toISOString()}).eq("id",id).select("*").single();
  if(updated.error)return NextResponse.json({ok:false,reason:updated.error.message},{status:500});
  if(next==="REJECTED"){
    const room=await client.from("vip_asset_rooms").select("salary_balance,withdrawn_salary_total").eq("user_id",current.data.user_id).maybeSingle();
    const bal=Number(room.data?.salary_balance??0);
    const withdrawn=Math.max(0,Number(room.data?.withdrawn_salary_total??0)-Number(current.data.amount||0));
    await client.from("vip_asset_rooms").update({salary_balance:bal+Number(current.data.amount||0),withdrawn_salary_total:withdrawn,updated_at:new Date().toISOString()})
      .eq("user_id",current.data.user_id);
  }
  await client.from("notifications").insert({
    user_id:current.data.user_id,type:"vip_salary_withdrawal",title:"VIP salary withdrawal updated",
    body:"Your VIP salary withdrawal is now "+next+".",reference_type:"vip_salary_withdrawal",
    reference_id:id,metadata:{status:next},created_at:new Date().toISOString()
  });
  return NextResponse.json({ok:true,saved:true,request:updated.data,message:"VIP salary withdrawal "+next.toLowerCase()+"."});
}