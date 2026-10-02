import { NextResponse } from "next/server";
import { resolveMutationUserId } from "../../../../lib/aqe/auth";
import { createMediaUploadUrl, validateUpload } from "../../../../lib/aqe/mediaUpload";

export async function POST(request: Request) {
  try {
    const identity=await resolveMutationUserId(request);
    if(!identity.ok)return NextResponse.json({ok:false,reason:identity.reason},{status:401});
    const body=await request.json().catch(()=>({}));
    const fileName=String(body.fileName||"").trim(), mimeType=String(body.mimeType||""), kind=body.kind==="video"?"video":"image";
    const sizeBytes=Number(body.sizeBytes||0);
    const valid=validateUpload({kind,mimeType,sizeBytes,fileName});
    if(!valid.ok)return NextResponse.json(valid,{status:400});
    const created=await createMediaUploadUrl({userId:identity.userId,fileName,kind,mimeType,sizeBytes,contentAccess:body.contentAccess==="subscribers_only"?"subscribers_only":"public"});
    if(!created.ok)return NextResponse.json(created,{status:400});
    const endpoint=(process.env.NEXT_PUBLIC_SUPABASE_URL||"").replace(".supabase.co",".storage.supabase.co")+"/storage/v1/upload/resumable";
    return NextResponse.json({...created,endpoint});
  } catch(error){return NextResponse.json({ok:false,reason:error instanceof Error?error.message:"Could not start resumable upload."},{status:400});}
}
