import { NextResponse } from "next/server";
export async function GET(){
  let host="";
  try{host=process.env.NEXT_PUBLIC_SUPABASE_URL?new URL(process.env.NEXT_PUBLIC_SUPABASE_URL).host:"";}
  catch{}
  return NextResponse.json({host,hasPublishableKey:Boolean(process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY),hasServiceRole:Boolean(process.env.SUPABASE_SERVICE_ROLE_KEY)});
}