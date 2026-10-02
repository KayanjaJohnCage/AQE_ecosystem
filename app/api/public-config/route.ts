import { NextResponse } from "next/server";

export async function GET() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL || "";
  const key = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || "";
  if (!url || !key) return NextResponse.json({ ok:false, reason:"Supabase browser configuration is not available." }, { status:503 });
  return NextResponse.json({ ok:true, url, key }, { headers: { "Cache-Control":"public, max-age=300" } });
}