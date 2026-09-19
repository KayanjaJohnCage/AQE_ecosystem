import { NextResponse } from "next/server";
import { requireAuthenticatedRoleAccess } from "../../../lib/aqe/auth";
import { createServerSupabaseClient } from "../../../lib/supabaseServer";

export type AqePlatformSettings = {
  tierPrices: { basic: number; premium: number; vip: number };
  renewalPrices: { basic: number; premium: number; vip: number };
  walletCurrency: string;
  qcExchangeRate: number;
  about: string;
  contact: string;
};

const defaults: AqePlatformSettings = {
  tierPrices: { basic: 125000, premium: 250000, vip: 500000 },
  renewalPrices: { basic: 2500, premium: 5000, vip: 8500 },
  walletCurrency: "UGX",
  qcExchangeRate: 1000,
  about: "AQE is a community ecosystem for connection, profiles, bookings, and trusted creator tools.",
  contact: "Contact an AQE manager for payment and account support.",
};

function normalizeSettings(value: Partial<AqePlatformSettings>): AqePlatformSettings {
  const tierPrices = value.tierPrices || {};
  const renewalPrices = value.renewalPrices || {};
  return {
    tierPrices: {
      basic: Number(tierPrices.basic) > 0 ? Number(tierPrices.basic) : defaults.tierPrices.basic,
      premium: Number(tierPrices.premium) > 0 ? Number(tierPrices.premium) : defaults.tierPrices.premium,
      vip: Number(tierPrices.vip) > 0 ? Number(tierPrices.vip) : defaults.tierPrices.vip,
    },
    renewalPrices: {
      basic: Number(renewalPrices.basic) > 0 ? Number(renewalPrices.basic) : defaults.renewalPrices.basic,
      premium: Number(renewalPrices.premium) > 0 ? Number(renewalPrices.premium) : defaults.renewalPrices.premium,
      vip: Number(renewalPrices.vip) > 0 ? Number(renewalPrices.vip) : defaults.renewalPrices.vip,
    },
    walletCurrency: String(value.walletCurrency || defaults.walletCurrency).toUpperCase(),
    qcExchangeRate: Number(value.qcExchangeRate) > 0 ? Number(value.qcExchangeRate) : defaults.qcExchangeRate,
    about: String(value.about || defaults.about),
    contact: String(value.contact || defaults.contact),
  };
}

export async function GET() {
  try {
    const client = createServerSupabaseClient();
    if (!client) return NextResponse.json({ ok: true, source: "defaults", settings: defaults });
    const { data, error } = await client.from("platform_settings").select("settings").eq("id", 1).maybeSingle();
    if (error || !data?.settings) return NextResponse.json({ ok: true, source: "defaults", settings: defaults });
    return NextResponse.json({ ok: true, source: "supabase", settings: normalizeSettings(data.settings) });
  } catch (error) {
    return NextResponse.json({ ok: false, reason: error instanceof Error ? error.message : "Settings unavailable." }, { status: 500 });
  }
}

export async function PATCH(request: Request) {
  try {
    const access = await requireAuthenticatedRoleAccess(request, ["manager", "admin"]);
    if (!access.ok) return NextResponse.json({ ok: false, reason: access.reason }, { status: 403 });
    const settings = normalizeSettings(await request.json().catch(() => ({})));
    const client = createServerSupabaseClient();
    if (!client) return NextResponse.json({ ok: true, saved: false, source: "defaults", settings });
    const { error } = await client.from("platform_settings").upsert({
      id: 1,
      settings,
      updated_by: access.session.userId,
      updated_at: new Date().toISOString(),
    }, { onConflict: "id" });
    if (error) return NextResponse.json({ ok: false, reason: error.message }, { status: 500 });
    return NextResponse.json({ ok: true, saved: true, source: "supabase", settings });
  } catch (error) {
    return NextResponse.json({ ok: false, reason: error instanceof Error ? error.message : "Settings update failed." }, { status: 400 });
  }
}
