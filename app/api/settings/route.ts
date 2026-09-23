import { NextResponse } from "next/server";
import { requireAuthenticatedRoleAccess } from "../../../lib/aqe/auth";
import { createServerSupabaseClient } from "../../../lib/supabaseServer";

export type AqePlatformSettings = {
  tierPrices: { basic: number; premium: number; vip: number };
  renewalPrices: { basic: number; premium: number; vip: number };
  walletCurrency: string;
  qcExchangeRate: number;
  referralRates: { direct: number; indirect: number };
  about: string;
  contact: string;
  withdrawal: {
    serviceChargeRate: number;
    serviceChargeLabel: string;
  };
  pricing: {
    originalTierPrices: { basic: number; premium: number; vip: number };
    currentTierPrices: { basic: number; premium: number; vip: number };
    promotionalLabels: { basic: string; premium: string; vip: string };
    welcomeBonus: number;
    deduction: { basic: number; premium: number; vip: number };
    teamLeaderRenewalCommission: { basic: number; premium: number; vip?: number };
    vipSalary: number;
    vipSalaryDay: number;
    withdrawalBefore20th: boolean;
  };
  customerContent: {
    home: Record<string, unknown>;
    rewards: Record<string, unknown>;
    campaign: Record<string, unknown>;
    raffle: Record<string, unknown>;
    promotions: Record<string, unknown>;
    vipContent: Record<string, unknown>;
  };
};

const defaults: AqePlatformSettings = {
  tierPrices: { basic: 65000, premium: 150000, vip: 250000 },
  renewalPrices: { basic: 2500, premium: 5000, vip: 8500 },
  walletCurrency: "UGX",
  qcExchangeRate: 1000,
  referralRates: { direct: 0.1, indirect: 0.05 },
  about: "AQE is a community ecosystem for connection, profiles, bookings, and trusted creator tools.",
  contact: "Contact an AQE manager for payment and account support.",
  withdrawal: {
    serviceChargeRate: 0.10,
    serviceChargeLabel: "10% withdrawal service charge",
  },
  pricing: {
    originalTierPrices: { basic: 125000, premium: 250000, vip: 500000 },
    currentTierPrices: { basic: 65000, premium: 150000, vip: 250000 },
    promotionalLabels: { basic: "48% OFF", premium: "40% OFF", vip: "50% OFF" },
    welcomeBonus: 3000,
    deduction: { basic: 15000, premium: 30000, vip: 60000 },
    teamLeaderRenewalCommission: { basic: 2500, premium: 5000 },
    vipSalary: 10000,
    vipSalaryDay: 20,
    withdrawalBefore20th: false,
  },
  customerContent: {
    home: {
      heroKicker: "VERIFIED PROFESSIONALS · SECURE PAYMENTS · DISCREET EXPERIENCE",
      heroTitle: "Discover Independence",
      heroDescription: "Verified professionals. Secure payments. Discreet experience.",
      featuredTitle: "Featured Profiles",
    },
    rewards: {
      title: "Rewards",
      eyebrow: "VIP ECOSYSTEM",
      dailyClaimTitle: "Daily claim",
      dailyClaimDescription: "Collect your daily QC reward.",
      vipRewardTitle: "1 Week VIP",
      vipRewardDescription: "Redeem rewards after eligibility.",
      raffleTitle: "Raffle",
      raffleDescription: "Use QC for the active draw.",
    },
    campaign: {
      enabled: false,
      title: "Welcome Campaign",
      description: "Invite friends and participate in AQE campaigns.",
      rewardLabel: "Campaign reward",
      rewardAmount: 0,
      currency: "QC",
    },
    raffle: {
      enabled: false,
      title: "AQE Raffle",
      description: "Use QC for the active draw.",
      ticketCost: 0,
      currency: "QC",
      prize: "Prize to be configured",
      winnerCount: 1,
    },
    promotions: {
      enabled: true,
      bannerTitle: "AQE Membership Promotion",
      bannerText: "Promotional membership pricing is controlled by the manager.",
      displayDiscounts: true,
    },
    vipContent: {
      enabled: true,
      subscriptionRequired: true,
      title: "VIP Locked Content",
      description: "Subscribe monthly or upgrade to VIP to unlock VIP content.",
    },
  },
};

const tierKeys = ["basic", "premium", "vip"] as const;

function positive(value: unknown, fallback: number) {
  const n = Number(value);
  return Number.isFinite(n) && n >= 0 ? n : fallback;
}

function normalizeSettings(value: Partial<AqePlatformSettings> = {}): AqePlatformSettings {
  const tierPrices = value.tierPrices ?? {};
  const renewalPrices = value.renewalPrices ?? {};
  const pricing = value.pricing ?? {};
  const originalTierPrices = pricing.originalTierPrices ?? {};
  const currentTierPrices = pricing.currentTierPrices ?? {};
  const promotionalLabels = pricing.promotionalLabels ?? {};
  const deduction = pricing.deduction ?? {};
  const teamLeaderRenewalCommission = pricing.teamLeaderRenewalCommission ?? {};
  const withdrawal = value.withdrawal ?? {};

  const normalizedTierPrices = {
    basic: positive(tierPrices.basic, defaults.tierPrices.basic),
    premium: positive(tierPrices.premium, defaults.tierPrices.premium),
    vip: positive(tierPrices.vip, defaults.tierPrices.vip),
  };

  const normalizedCurrentPrices = {
    basic: positive(currentTierPrices.basic, normalizedTierPrices.basic),
    premium: positive(currentTierPrices.premium, normalizedTierPrices.premium),
    vip: positive(currentTierPrices.vip, normalizedTierPrices.vip),
  };

  return {
    tierPrices: normalizedCurrentPrices,
    renewalPrices: {
      basic: positive(renewalPrices.basic, defaults.renewalPrices.basic),
      premium: positive(renewalPrices.premium, defaults.renewalPrices.premium),
      vip: positive(renewalPrices.vip, defaults.renewalPrices.vip),
    },
    walletCurrency: String(value.walletCurrency || defaults.walletCurrency).toUpperCase(),
    qcExchangeRate: positive(value.qcExchangeRate, defaults.qcExchangeRate) || defaults.qcExchangeRate,
    referralRates: {
      direct: Number(value.referralRates?.direct) >= 0 && Number(value.referralRates?.direct) <= 1
        ? Number(value.referralRates?.direct) : defaults.referralRates.direct,
      indirect: Number(value.referralRates?.indirect) >= 0 && Number(value.referralRates?.indirect) <= 1
        ? Number(value.referralRates?.indirect) : defaults.referralRates.indirect,
    },
    about: String(value.about || defaults.about),
    contact: String(value.contact || defaults.contact),
    withdrawal: {
      serviceChargeRate:
        Number(withdrawal.serviceChargeRate) >= 0 && Number(withdrawal.serviceChargeRate) <= 1
          ? Number(withdrawal.serviceChargeRate)
          : defaults.withdrawal.serviceChargeRate,
      serviceChargeLabel: String(
        withdrawal.serviceChargeLabel || defaults.withdrawal.serviceChargeLabel,
      ),
    },
    pricing: {
      originalTierPrices: {
        basic: positive(originalTierPrices.basic, defaults.pricing.originalTierPrices.basic),
        premium: positive(originalTierPrices.premium, defaults.pricing.originalTierPrices.premium),
        vip: positive(originalTierPrices.vip, defaults.pricing.originalTierPrices.vip),
      },
      currentTierPrices: normalizedCurrentPrices,
      promotionalLabels: {
        basic: String(promotionalLabels.basic || defaults.pricing.promotionalLabels.basic),
        premium: String(promotionalLabels.premium || defaults.pricing.promotionalLabels.premium),
        vip: String(promotionalLabels.vip || defaults.pricing.promotionalLabels.vip),
      },
      welcomeBonus: positive(pricing.welcomeBonus, defaults.pricing.welcomeBonus),
      deduction: {
        basic: positive(deduction.basic, defaults.pricing.deduction.basic),
        premium: positive(deduction.premium, defaults.pricing.deduction.premium),
        vip: positive(deduction.vip, defaults.pricing.deduction.vip),
      },
      teamLeaderRenewalCommission: {
        basic: positive(teamLeaderRenewalCommission.basic, defaults.pricing.teamLeaderRenewalCommission.basic),
        premium: positive(teamLeaderRenewalCommission.premium, defaults.pricing.teamLeaderRenewalCommission.premium),
        ...(teamLeaderRenewalCommission.vip !== undefined
          ? { vip: positive(teamLeaderRenewalCommission.vip, 0) }
          : {}),
      },
      vipSalary: positive(pricing.vipSalary, defaults.pricing.vipSalary),
      vipSalaryDay: Math.min(31, Math.max(1, Math.round(positive(pricing.vipSalaryDay, defaults.pricing.vipSalaryDay)))),
      withdrawalBefore20th: Boolean(
        pricing.withdrawalBefore20th ?? defaults.pricing.withdrawalBefore20th,
      ),
    },
    customerContent: {
      home: { ...defaults.customerContent.home, ...(value.customerContent?.home ?? {}) },
      rewards: { ...defaults.customerContent.rewards, ...(value.customerContent?.rewards ?? {}) },
      campaign: { ...defaults.customerContent.campaign, ...(value.customerContent?.campaign ?? {}) },
      raffle: { ...defaults.customerContent.raffle, ...(value.customerContent?.raffle ?? {}) },
      promotions: { ...defaults.customerContent.promotions, ...(value.customerContent?.promotions ?? {}) },
      vipContent: { ...defaults.customerContent.vipContent, ...(value.customerContent?.vipContent ?? {}) },
    },
  };
}

async function readSettings() {
  const client = createServerSupabaseClient();
  if (!client) return { source: "defaults" as const, settings: defaults };
  const { data, error } = await client.from("platform_settings").select("settings").eq("id", 1).maybeSingle();
  if (error || !data?.settings) return { source: "defaults" as const, settings: defaults };
  return { source: "supabase" as const, settings: normalizeSettings(data.settings) };
}

export async function GET() {
  try {
    const result = await readSettings();
    return NextResponse.json({ ok: true, ...result });
  } catch (error) {
    return NextResponse.json(
      { ok: false, reason: error instanceof Error ? error.message : "Settings unavailable." },
      { status: 500 },
    );
  }
}

export async function PATCH(request: Request) {
  try {
    const access = await requireAuthenticatedRoleAccess(request, ["manager", "admin"]);
    if (!access.ok) {
      return NextResponse.json({ ok: false, reason: access.reason }, { status: 403 });
    }

    const incoming = await request.json().catch(() => ({}));
    const existing = await readSettings();
    const settings = normalizeSettings({
      ...existing.settings,
      ...incoming,
      customerContent: {
        ...existing.settings.customerContent,
        ...(incoming.customerContent ?? {}),
      },
      pricing: {
        ...existing.settings.pricing,
        ...(incoming.pricing ?? {}),
      },
    });

    const client = createServerSupabaseClient();
    if (!client) {
      return NextResponse.json({ ok: true, saved: false, source: "defaults", settings });
    }

    const { error } = await client.from("platform_settings").upsert(
      {
        id: 1,
        settings,
        updated_by: access.session.userId,
        updated_at: new Date().toISOString(),
      },
      { onConflict: "id" },
    );
    if (error) return NextResponse.json({ ok: false, reason: error.message }, { status: 500 });

    return NextResponse.json({ ok: true, saved: true, source: "supabase", settings });
  } catch (error) {
    return NextResponse.json(
      { ok: false, reason: error instanceof Error ? error.message : "Settings update failed." },
      { status: 400 },
    );
  }
}
