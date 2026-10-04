import { NextResponse } from "next/server";
import { resolveMutationUserId } from "../../../../lib/aqe/auth";
import { createServerSupabaseClient } from "../../../../lib/supabaseServer";

export async function GET(request: Request) {
  try {
    const identity=await resolveMutationUserId(request);
    if(!identity.ok)return NextResponse.json({ok:false,reason:identity.reason},{status:401});
    const client=createServerSupabaseClient();
    if(!client)return NextResponse.json({ok:true,source:"memory",media:[]});
    const {data,error}=await client.from("profile_media")
      .select("id,owner_user_id,storage_path,media_type,mime_type,file_size,visibility,moderation_status,is_profile_photo,content_access,created_at")
      .eq("owner_user_id",identity.userId)
      .order("created_at",{ascending:false}).limit(100);
    if(error)return NextResponse.json({ok:false,reason:error.message},{status:500});
    const media=[];
    for(const item of data??[]){
      const signed=await client.storage.from("profile-media").createSignedUrl(item.storage_path,3600);
      media.push({...item,url:signed.data?.signedUrl||""});
    }
    return NextResponse.json({ok:true,source:"supabase",media});
  }catch(error){
    return NextResponse.json({ok:false,reason:error instanceof Error?error.message:"Media lookup failed."},{status:400});
  }
}
