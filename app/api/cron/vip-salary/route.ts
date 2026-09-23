import { NextResponse } from "next/server";
import { createServerSupabaseClient } from "../../../../lib/supabaseServer";

export async function GET(request: Request) {
  const secret = process.env.CRON_SECRET;
  const authorization = request.headers.get("authorization") || "";
  if (!secret || authorization !== `Bearer ${secret}`) {
    return NextResponse.json({ ok: false, reason: "Unauthorized." }, { status: 401 });
  }

  const client = createServerSupabaseClient();
  if (!client) return NextResponse.json({ ok: false, reason: "Supabase is not configured." }, { status: 503 });

  const { data: settingsRow } = await client.from("platform_settings").select("settings").eq("id",1).maybeSingle();
  const settings = settingsRow?.settings ?? {};
  const salaryDay = Number(settings.pricing?.vipSalaryDay ?? 20);
  const salary = Number(settings.pricing?.vipSalary ?? 10000);
  const currency = String(settings.walletCurrency ?? "UGX").toUpperCase();

  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone: "Africa/Kampala", year: "numeric", month: "2-digit", day: "2-digit"
  }).formatToParts(new Date());
  const get = (type: string) => parts.find(p => p.type === type)?.value || "";
  const day = Number(get("day"));
  const period = `${get("year")}-${get("month")}`;
  if (day !== salaryDay) {
    return NextResponse.json({ ok: true, issued: 0, skipped: true, reason: `Today is not the configured VIP salary day (${salaryDay}).` });
  }

  const { data: vipProfiles, error } = await client.from("profiles").select("user_id").eq("tier","vip");
  if (error) return NextResponse.json({ ok: false, reason: error.message }, { status: 500 });

  let issued = 0;
  const results = [];
  for (const profile of vipProfiles ?? []) {
    const result = await client.rpc("issue_vip_salary", {
      p_user_id: profile.user_id, p_salary: salary, p_currency: currency, p_period: period
    });
    if (!result.error) {
      results.push(result.data);
      if (!result.data?.alreadyPaid) issued += 1;
    }
  }

  return NextResponse.json({ ok: true, issued, totalVip: vipProfiles?.length ?? 0, period, results });
}
