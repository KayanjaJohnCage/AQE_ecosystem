import { NextResponse } from "next/server";
import { requireAuthenticatedRoleAccess } from "../../../../lib/aqe/auth";
import { createServerSupabaseClient } from "../../../../lib/supabaseServer";

type ReceiverDetails = {
  id?: string;
  receiverName: string;
  receiverPhone: string;
  receiverCard: string;
  network?: string;
  instructions: string;
  status?: "available" | "busy" | "inactive";
  updatedAt?: string;
};

function envReceiver(): ReceiverDetails {
  return {
    receiverName: process.env.MUKURU_RECEIVER_NAME || "AQE Payments Receiver",
    receiverPhone: process.env.MUKURU_RECEIVER_PHONE || "Configure receiver phone",
    receiverCard: process.env.MUKURU_RECEIVER_CARD || "Configure receiver card",
    network: "Mukuru",
    instructions: process.env.MUKURU_PAYMENT_INSTRUCTIONS || "Use the receiver details below on the Mukuru Send Money page. Include your AQE payment reference.",
    status: "available",
  };
}

function isConfigured(receiver: ReceiverDetails) {
  const values = [receiver.receiverName, receiver.receiverPhone, receiver.receiverCard];
  return values.every((value) => value && !String(value).toLowerCase().includes("configure receiver"));
}

function mapRow(row: any): ReceiverDetails {
  return {
    id: row.id,
    receiverName: row.receiver_name,
    receiverPhone: row.receiver_phone,
    receiverCard: row.receiver_card,
    network: row.network || "Mukuru",
    instructions: row.instructions || "",
    status: row.status || "available",
    updatedAt: row.updated_at,
  };
}

export async function GET() {
  try {
    const client = createServerSupabaseClient();
    if (!client) {
      const receiver = envReceiver();
      return NextResponse.json({ ok:true, source:"environment", receiver, receivers:[receiver] });
    }

    const { data, error } = await client.from("payment_receivers")
      .select("id,receiver_name,receiver_phone,receiver_card,network,instructions,status,updated_at")
      .in("status", ["available","busy"])
      .order("created_at", { ascending:false });

    if (!error && data?.length) {
      const receivers = data.map(mapRow).filter(isConfigured);
      const receiver = receivers.find(x => x.status === "available") || receivers[0];
      if (receiver) return NextResponse.json({ok:true,source:"supabase",receiver,receivers});
      return NextResponse.json({ok:true,source:"supabase",configured:false,receiver:null,receivers:[]});
    }

    const legacy = await client.from("payment_receiver_settings")
      .select("receiver_name,receiver_phone,receiver_card,instructions,updated_at")
      .eq("id",1).maybeSingle();

    if (!legacy.error && legacy.data) {
      const receiver: ReceiverDetails = {
        receiverName: legacy.data.receiver_name,
        receiverPhone: legacy.data.receiver_phone,
        receiverCard: legacy.data.receiver_card,
        network:"Mukuru",
        instructions:legacy.data.instructions,
        status:"available",
        updatedAt:legacy.data.updated_at,
      };
      if (isConfigured(receiver)) return NextResponse.json({ok:true,source:"legacy",receiver,receivers:[receiver]});
    }

    const receiver=envReceiver();
    if (isConfigured(receiver)) return NextResponse.json({ok:true,source:"environment",receiver,receivers:[receiver]});
    return NextResponse.json({ok:true,source:"none",configured:false,receiver:null,receivers:[]});
  } catch(error) {
    return NextResponse.json({ok:false,reason:error instanceof Error?error.message:"Receiver details unavailable."},{status:500});
  }
}

export async function POST(request: Request) {
  try {
    const access=await requireAuthenticatedRoleAccess(request,["manager","admin"]);
    if(!access.ok)return NextResponse.json({ok:false,reason:access.reason},{status:403});
    const body=await request.json().catch(()=>({}));
    const receiverName=String(body.receiverName??"").trim();
    const receiverPhone=String(body.receiverPhone??"").trim();
    const receiverCard=String(body.receiverCard??"").trim();
    const network=String(body.network??"Mukuru").trim()||"Mukuru";
    const instructions=String(body.instructions??"").trim();
    const status=["available","busy","inactive"].includes(String(body.status))?String(body.status):"available";
    if(!receiverName||!receiverPhone||!receiverCard)return NextResponse.json({ok:false,reason:"Receiver name, phone number and card/account details are required."},{status:400});
    const client=createServerSupabaseClient();
    if(!client)return NextResponse.json({ok:false,reason:"Receiver service is not configured."},{status:503});
    const result=await client.from("payment_receivers").insert({
      receiver_name:receiverName,receiver_phone:receiverPhone,receiver_card:receiverCard,
      network,instructions,status,created_by:access.session.userId,updated_at:new Date().toISOString()
    }).select("id,receiver_name,receiver_phone,receiver_card,network,instructions,status,updated_at").single();
    if(result.error)return NextResponse.json({ok:false,reason:result.error.message},{status:500});
    return NextResponse.json({ok:true,saved:true,receiver:mapRow(result.data)});
  } catch(error) {
    return NextResponse.json({ok:false,reason:error instanceof Error?error.message:"Receiver creation failed."},{status:400});
  }
}

export async function PATCH(request: Request) {
  try {
    const access=await requireAuthenticatedRoleAccess(request,["manager","admin"]);
    if(!access.ok)return NextResponse.json({ok:false,reason:access.reason},{status:403});
    const body=await request.json().catch(()=>({}));
    const id=String(body.id??"").trim();
    const receiverName=String(body.receiverName??"").trim();
    const receiverPhone=String(body.receiverPhone??"").trim();
    const receiverCard=String(body.receiverCard??"").trim();
    const network=String(body.network??"Mukuru").trim()||"Mukuru";
    const instructions=String(body.instructions??"").trim();
    const status=["available","busy","inactive"].includes(String(body.status))?String(body.status):"available";
    if(!id)return NextResponse.json({ok:false,reason:"Receiver ID is required."},{status:400});
    if(!receiverName||!receiverPhone||!receiverCard)return NextResponse.json({ok:false,reason:"Receiver name, phone number and card/account details are required."},{status:400});
    const client=createServerSupabaseClient();
    if(!client)return NextResponse.json({ok:false,reason:"Receiver service is not configured."},{status:503});
    const result=await client.from("payment_receivers").update({
      receiver_name:receiverName,receiver_phone:receiverPhone,receiver_card:receiverCard,
      network,instructions,status,updated_at:new Date().toISOString()
    }).eq("id",id).select("id,receiver_name,receiver_phone,receiver_card,network,instructions,status,updated_at").single();
    if(result.error)return NextResponse.json({ok:false,reason:result.error.message},{status:500});
    return NextResponse.json({ok:true,saved:true,receiver:mapRow(result.data)});
  } catch(error) {
    return NextResponse.json({ok:false,reason:error instanceof Error?error.message:"Receiver update failed."},{status:400});
  }
}

export async function DELETE(request: Request) {
  try {
    const access=await requireAuthenticatedRoleAccess(request,["manager","admin"]);
    if(!access.ok)return NextResponse.json({ok:false,reason:access.reason},{status:403});
    const body=await request.json().catch(()=>({}));
    const id=String(body.id??"").trim();
    if(!id)return NextResponse.json({ok:false,reason:"Receiver ID is required."},{status:400});
    const client=createServerSupabaseClient();
    if(!client)return NextResponse.json({ok:false,reason:"Receiver service is not configured."},{status:503});
    const existing=await client.from("payment_receivers").select("id").eq("id",id).maybeSingle();
    if(existing.error||!existing.data)return NextResponse.json({ok:false,reason:existing.error?.message||"Receiver not found."},{status:404});
    const deleted=await client.from("payment_receivers").delete().eq("id",id);
    if(deleted.error)return NextResponse.json({ok:false,reason:deleted.error.message},{status:500});
    return NextResponse.json({ok:true,deleted:true,id});
  } catch(error) {
    return NextResponse.json({ok:false,reason:error instanceof Error?error.message:"Receiver deletion failed."},{status:400});
  }
}
