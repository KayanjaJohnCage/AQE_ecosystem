import { NextResponse } from "next/server";
import { requireAuthenticatedRoleAccess, resolveAuthenticatedSession } from "../../../lib/aqe/auth";
import { createServerSupabaseClient } from "../../../lib/supabaseServer";

export async function GET(request: Request) {
  try {
    const client=createServerSupabaseClient();
    if(!client)return NextResponse.json({ok:false,reason:"Prize service is not configured."},{status:503});
    const session=await resolveAuthenticatedSession(request);
    const userId=session.authenticated?session.userId:null;
    let tier="basic",inviteCount=0;
    if(userId){
      const [{data:profile},{count}]=await Promise.all([
        client.from("profiles").select("tier").eq("user_id",userId).maybeSingle(),
        client.from("profiles").select("user_id",{count:"exact",head:true}).eq("referred_by",userId),
      ]);
      tier=profile?.tier||"basic";inviteCount=count??0;
    }
    const {data:prizes,error}=await client.from("aqe_prizes")
      .select("id,ref_code,title,invite_requirement,tier_scope,reward_type,reward_description,cash_value,image_url,active,sort_order,created_at,updated_at")
      .eq("active",true).order("sort_order",{ascending:true});
    if(error)return NextResponse.json({ok:false,reason:error.message},{status:500});
    const {data:claims}=userId?await client.from("aqe_prize_claims").select("prize_id,mode,status,cash_amount,manager_note,created_at").eq("user_id",userId):{data:[]};
    const claimMap=new Map((claims??[]).map(claim=>[claim.prize_id,claim]));
    return NextResponse.json({ok:true,tier,inviteCount,prizes:(prizes??[]).map(prize=>({
      ...prize,
      eligible:inviteCount>=prize.invite_requirement&&(prize.tier_scope==="all"||tier==="vip"),
      lockedReason:tier!=="vip"&&prize.tier_scope==="vip"?"VIP members only":inviteCount<prize.invite_requirement?String(prize.invite_requirement)+" direct invites required":null,
      claim:claimMap.get(prize.id)??null,
    }))});
  }catch(error){return NextResponse.json({ok:false,reason:error instanceof Error?error.message:"Prizes unavailable."},{status:500});}
}

export async function POST(request: Request) {
  try {
    const access=await requireAuthenticatedRoleAccess(request,["manager","admin"]);
    if(!access.ok)return NextResponse.json({ok:false,reason:access.reason},{status:403});
    const client=createServerSupabaseClient();
    if(!client)return NextResponse.json({ok:false,reason:"Prize service is not configured."},{status:503});

    const contentType=request.headers.get("content-type")||"";
    let body:any={}; let imageFile:File|null=null;
    if(contentType.includes("multipart/form-data")){
      const form=await request.formData();
      form.forEach((value,key)=>{if(value instanceof File){if(key==="image")imageFile=value;}else body[key]=value;});
    }else body=await request.json().catch(()=>({}));

    const action=String(body.action??"create").trim().toLowerCase();
    const id=String(body.id??"").trim();

    if(action==="delete"){
      if(!id)return NextResponse.json({ok:false,reason:"Prize ID is required."},{status:400});
      const current=await client.from("aqe_prizes").select("image_url").eq("id",id).maybeSingle();
      const deleted=await client.from("aqe_prizes").delete().eq("id",id);
      if(deleted.error)return NextResponse.json({ok:false,reason:deleted.error.message},{status:400});
      if(current.data?.image_url){
        try{
          const marker="/storage/v1/object/public/manager-media/";
          const idx=String(current.data.image_url).indexOf(marker);
          if(idx>=0)await client.storage.from("manager-media").remove([decodeURIComponent(String(current.data.image_url).slice(idx+marker.length))]);
        }catch(_){}
      }
      return NextResponse.json({ok:true,deleted:true});
    }

    const payload:any={
      ref_code:String(body.refCode??"").trim().toUpperCase(),
      title:String(body.title??"").trim(),
      invite_requirement:Number(body.inviteRequirement??0),
      tier_scope:body.tierScope==="all"?"all":"vip",
      reward_type:["physical","cash","none"].includes(String(body.rewardType))?String(body.rewardType):"physical",
      reward_description:String(body.rewardDescription??"").trim()||null,
      cash_value:body.cashValue===""||body.cashValue===undefined||body.cashValue===null?null:Number(body.cashValue),
      image_url:String(body.imageUrl??"").trim()||null,
      active:String(body.active??"true")!=="false",
      sort_order:Number(body.sortOrder??0),
      updated_at:new Date().toISOString(),
    };
    if(!payload.ref_code||!payload.title||!Number.isInteger(payload.invite_requirement)||payload.invite_requirement<1)return NextResponse.json({ok:false,reason:"Reference, title and a positive invite requirement are required."},{status:400});
    if(payload.cash_value!==null&&(!Number.isFinite(payload.cash_value)||payload.cash_value<0))return NextResponse.json({ok:false,reason:"Prize cash value must be a non-negative amount."},{status:400});

    if(imageFile){
      if(!imageFile.type.startsWith("image/"))return NextResponse.json({ok:false,reason:"Prize image must be an image file."},{status:400});
      if(imageFile.size>8*1024*1024)return NextResponse.json({ok:false,reason:"Prize images must be 8 MB or smaller."},{status:400});
      const ext=(imageFile.name.split(".").pop()||"jpg").replace(/[^a-z0-9]/gi,"").toLowerCase()||"jpg";
      const path=`manager/prizes/${access.session.userId}/${crypto.randomUUID()}.${ext}`;
      const stored=await client.storage.from("manager-media").upload(path,new Uint8Array(await imageFile.arrayBuffer()),{contentType:imageFile.type,upsert:false});
      if(stored.error)return NextResponse.json({ok:false,reason:stored.error.message},{status:400});
      payload.image_url=client.storage.from("manager-media").getPublicUrl(path).data.publicUrl;
    }

    const result=id
      ? await client.from("aqe_prizes").update(payload).eq("id",id).select().single()
      : await client.from("aqe_prizes").insert(payload).select().single();
    if(result.error){
      if(imageFile&&payload.image_url){try{const marker="/storage/v1/object/public/manager-media/";const idx=String(payload.image_url).indexOf(marker);if(idx>=0)await client.storage.from("manager-media").remove([decodeURIComponent(String(payload.image_url).slice(idx+marker.length))]);}catch(_){}}
      return NextResponse.json({ok:false,reason:result.error.message},{status:400});
    }
    return NextResponse.json({ok:true,prize:result.data});
  }catch(error){return NextResponse.json({ok:false,reason:error instanceof Error?error.message:"Prize save failed."},{status:400});}
}
