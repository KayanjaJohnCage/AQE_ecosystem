import { NextResponse } from "next/server";
import { requireAuthenticatedRoleAccess } from "../../../lib/aqe/auth";
import { createServerSupabaseClient } from "../../../lib/supabaseServer";

export async function POST(request: Request) {
  try {
    const access = await requireAuthenticatedRoleAccess(request, ["manager", "admin"]);
    if (!access.ok || !access.session.userId) return NextResponse.json({ ok:false, reason:access.reason }, {status:403});
    const form = await request.formData();
    const file = form.get("file");
    if (!(file instanceof File)) return NextResponse.json({ok:false,reason:"Image file is required."},{status:400});
    if (!file.type.startsWith("image/")) return NextResponse.json({ok:false,reason:"Only image files are supported."},{status:400});
    if (file.size > 8 * 1024 * 1024) return NextResponse.json({ok:false,reason:"Manager images must be 8 MB or smaller."},{status:400});
    const client=createServerSupabaseClient();
    if(!client) return NextResponse.json({ok:false,reason:"Manager media service is not configured."},{status:503});
    const ext=(file.name.split(".").pop()||"jpg").replace(/[^a-z0-9]/gi,"").toLowerCase()||"jpg";
    const path=`manager/${access.session.userId}/${crypto.randomUUID()}.${ext}`;
    const stored=await client.storage.from("manager-media").upload(path,new Uint8Array(await file.arrayBuffer()),{contentType:file.type,upsert:false});
    if(stored.error)return NextResponse.json({ok:false,reason:stored.error.message},{status:400});
    const url=client.storage.from("manager-media").getPublicUrl(path).data.publicUrl;
    return NextResponse.json({ok:true,url,path});
  } catch(error) {
    return NextResponse.json({ok:false,reason:error instanceof Error?error.message:"Manager media upload failed."},{status:400});
  }
}

export async function DELETE(request: Request) {
  try {
    const access=await requireAuthenticatedRoleAccess(request,["manager","admin"]);
    if(!access.ok)return NextResponse.json({ok:false,reason:access.reason},{status:403});
    const body=await request.json().catch(()=>({}));
    const path=String(body.path??"").trim();
    if(!path||!path.startsWith("manager/"))return NextResponse.json({ok:false,reason:"Manager media path is required."},{status:400});
    const client=createServerSupabaseClient();
    if(!client)return NextResponse.json({ok:false,reason:"Manager media service is not configured."},{status:503});
    const removed=await client.storage.from("manager-media").remove([path]);
    if(removed.error)return NextResponse.json({ok:false,reason:removed.error.message},{status:400});
    return NextResponse.json({ok:true,deleted:true});
  } catch(error) {
    return NextResponse.json({ok:false,reason:error instanceof Error?error.message:"Manager media deletion failed."},{status:400});
  }
}
