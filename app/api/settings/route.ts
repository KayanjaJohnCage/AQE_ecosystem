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
  mediaLimits: {
    basic: { imagesPerMonth: number; videosPerMonth: number; maxImageSizeMB: number; maxVideoSizeMB: number };
    premium: { imagesPerMonth: number; videosPerMonth: number; maxImageSizeMB: number; maxVideoSizeMB: number };
    vip: { imagesPerMonth: number; videosPerMonth: number; maxImageSizeMB: number; maxVideoSizeMB: number };
  };
  commercial: {
    profileBoostPrices: { daily: number; weekly: number; monthly: number };
    marketplaceCommissionRate: number;
    vipContentCommissionRate: number;
  };
  footer: {
    about: string;
    contact: { email: string; phone: string; whatsapp: string };
    links: Array<{ label: string; url: string }>;
  };
  profileBoosts: {
    enabled: boolean;
    managerCanGrant: boolean;
    purchaseEnabled: boolean;
    rewardEnabled: boolean;
    taskEnabled: boolean;
    campaignEnabled: boolean;
    defaultDurations: { daily: number; weekly: number; monthly: number };
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
  mediaLimits: {
    basic: { imagesPerMonth: 10, videosPerMonth: 2, maxImageSizeMB: 5, maxVideoSizeMB: 75 },
    premium: { imagesPerMonth: 30, videosPerMonth: 10, maxImageSizeMB: 8, maxVideoSizeMB: 100 },
    vip: { imagesPerMonth: 100, videosPerMonth: 30, maxImageSizeMB: 12, maxVideoSizeMB: 150 },
  },
  commercial: {
    profileBoostPrices: { daily: 0, weekly: 0, monthly: 0 },
    marketplaceCommissionRate: 0,
    vipContentCommissionRate: 0,
  },
  footer: {
    about: "",
    contact: { email: "", phone: "", whatsapp: "" },
    links: [],
  },
  profileBoosts: {
    enabled: true,
    managerCanGrant: true,
    purchaseEnabled: true,
    rewardEnabled: true,
    taskEnabled: true,
    campaignEnabled: true,
    defaultDurations: { daily: 1, weekly: 7, monthly: 30 },
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
      description: "VIP creators can set a monthly content price. Viewers must subscribe to that VIP creator to unlock subscriber-only media for one full month.",
    },
  },
};

const tierKeys = ["basic", "premium", "vip"] as const;

function positive(value: unknown, fallback: number) {
  const n = Number(value);
  return Number.isFinite(n) && n >= 0 ? n : fallback;
}

function normalizeSettings(value: Partial<AqePlatformSettings> = {}): AqePlatformSettings {
  const tierPrices = (value.tierPrices ?? {}) as Partial<AqePlatformSettings["tierPrices"]>;
  const renewalPrices = (value.renewalPrices ?? {}) as Partial<AqePlatformSettings["renewalPrices"]>;
  const pricing = (value.pricing ?? {}) as Partial<AqePlatformSettings["pricing"]>;
  const originalTierPrices = (pricing.originalTierPrices ?? {}) as Partial<AqePlatformSettings["pricing"]["originalTierPrices"]>;
  const currentTierPrices = (pricing.currentTierPrices ?? {}) as Partial<AqePlatformSettings["pricing"]["currentTierPrices"]>;
  const promotionalLabels = (pricing.promotionalLabels ?? {}) as Partial<AqePlatformSettings["pricing"]["promotionalLabels"]>;
  const deduction = (pricing.deduction ?? {}) as Partial<AqePlatformSettings["pricing"]["deduction"]>;
  const teamLeaderRenewalCommission = (pricing.teamLeaderRenewalCommission ?? {}) as Partial<AqePlatformSettings["pricing"]["teamLeaderRenewalCommission"]>;
  const withdrawal = (value.withdrawal ?? {}) as Partial<AqePlatformSettings["withdrawal"]>;
  const commercial = (value.commercial ?? {}) as Partial<AqePlatformSettings["commercial"]>;
  const profileBoostPrices = (commercial.profileBoostPrices ?? {}) as Partial<AqePlatformSettings["commercial"]["profileBoostPrices"]>;
  const footer = (value.footer ?? {}) as Partial<AqePlatformSettings["footer"]>;
  const footerContact = (footer.contact ?? {}) as Partial<AqePlatformSettings["footer"]["contact"]>;

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
      // The CEO policy fixes withdrawals at a 10% service charge.
      // Do not allow manager/API settings to silently change the financial rule.
      serviceChargeRate: 0.10,
      serviceChargeLabel: "10% withdrawal service charge",
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
    mediaLimits: {
      basic: {
        imagesPerMonth: Math.max(0, Math.round(positive(value.mediaLimits?.basic?.imagesPerMonth, defaults.mediaLimits.basic.imagesPerMonth))),
        videosPerMonth: Math.max(0, Math.round(positive(value.mediaLimits?.basic?.videosPerMonth, defaults.mediaLimits.basic.videosPerMonth))),
        maxImageSizeMB: positive(value.mediaLimits?.basic?.maxImageSizeMB, defaults.mediaLimits.basic.maxImageSizeMB),
        maxVideoSizeMB: positive(value.mediaLimits?.basic?.maxVideoSizeMB, defaults.mediaLimits.basic.maxVideoSizeMB),
      },
      premium: {
        imagesPerMonth: Math.max(0, Math.round(positive(value.mediaLimits?.premium?.imagesPerMonth, defaults.mediaLimits.premium.imagesPerMonth))),
        videosPerMonth: Math.max(0, Math.round(positive(value.mediaLimits?.premium?.videosPerMonth, defaults.mediaLimits.premium.videosPerMonth))),
        maxImageSizeMB: positive(value.mediaLimits?.premium?.maxImageSizeMB, defaults.mediaLimits.premium.maxImageSizeMB),
        maxVideoSizeMB: positive(value.mediaLimits?.premium?.maxVideoSizeMB, defaults.mediaLimits.premium.maxVideoSizeMB),
      },
      vip: {
        imagesPerMonth: Math.max(0, Math.round(positive(value.mediaLimits?.vip?.imagesPerMonth, defaults.mediaLimits.vip.imagesPerMonth))),
        videosPerMonth: Math.max(0, Math.round(positive(value.mediaLimits?.vip?.videosPerMonth, defaults.mediaLimits.vip.videosPerMonth))),
        maxImageSizeMB: positive(value.mediaLimits?.vip?.maxImageSizeMB, defaults.mediaLimits.vip.maxImageSizeMB),
        maxVideoSizeMB: positive(value.mediaLimits?.vip?.maxVideoSizeMB, defaults.mediaLimits.vip.maxVideoSizeMB),
      },
    },
    commercial: {
      profileBoostPrices: {
        daily: positive(profileBoostPrices.daily, defaults.commercial.profileBoostPrices.daily),
        weekly: positive(profileBoostPrices.weekly, defaults.commercial.profileBoostPrices.weekly),
        monthly: positive(profileBoostPrices.monthly, defaults.commercial.profileBoostPrices.monthly),
      },
      marketplaceCommissionRate:
        Number(commercial.marketplaceCommissionRate) >= 0 && Number(commercial.marketplaceCommissionRate) <= 1
          ? Number(commercial.marketplaceCommissionRate)
          : defaults.commercial.marketplaceCommissionRate,
      vipContentCommissionRate:
        Number(commercial.vipContentCommissionRate) >= 0 && Number(commercial.vipContentCommissionRate) <= 1
          ? Number(commercial.vipContentCommissionRate)
          : defaults.commercial.vipContentCommissionRate,
    },
    footer: {
      about: String(footer.about ?? defaults.footer.about),
      contact: {
        email: String(footerContact.email ?? defaults.footer.contact.email),
        phone: String(footerContact.phone ?? defaults.footer.contact.phone),
        whatsapp: String(footerContact.whatsapp ?? defaults.footer.contact.whatsapp),
      },
      links: Array.isArray(footer.links)
        ? footer.links
            .map((link) => ({
              label: String((link as { label?: unknown })?.label ?? "").trim(),
              url: String((link as { url?: unknown })?.url ?? "").trim(),
            }))
            .filter((link) => link.label && link.url)
            .slice(0, 12)
        : [],
    },
    profileBoosts: {
      enabled: Boolean(value.profileBoosts?.enabled ?? defaults.profileBoosts.enabled),
      managerCanGrant: Boolean(value.profileBoosts?.managerCanGrant ?? defaults.profileBoosts.managerCanGrant),
      purchaseEnabled: Boolean(value.profileBoosts?.purchaseEnabled ?? defaults.profileBoosts.purchaseEnabled),
      rewardEnabled: Boolean(value.profileBoosts?.rewardEnabled ?? defaults.profileBoosts.rewardEnabled),
      taskEnabled: Boolean(value.profileBoosts?.taskEnabled ?? defaults.profileBoosts.taskEnabled),
      campaignEnabled: Boolean(value.profileBoosts?.campaignEnabled ?? defaults.profileBoosts.campaignEnabled),
      defaultDurations: {
        daily: Math.max(1, Math.round(positive(value.profileBoosts?.defaultDurations?.daily, 1))),
        weekly: Math.max(1, Math.round(positive(value.profileBoosts?.defaultDurations?.weekly, 7))),
        monthly: Math.max(1, Math.round(positive(value.profileBoosts?.defaultDurations?.monthly, 30))),
      },
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
      mediaLimits: {
        ...existing.settings.mediaLimits,
        ...(incoming.mediaLimits ?? {}),
      },
      profileBoosts: {
        ...existing.settings.profileBoosts,
        ...(incoming.profileBoosts ?? {}),
      },
      pricing: {
        ...existing.settings.pricing,
        ...(incoming.pricing ?? {}),
      },
      footer: {
        ...existing.settings.footer,
        ...(incoming.footer ?? {}),
        contact: {
          ...existing.settings.footer.contact,
          ...(incoming.footer?.contact ?? {}),
        },
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
