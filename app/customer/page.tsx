"use client";

import { FormEvent, useEffect, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import {
  persistStoredSession,
  readStoredSession,
} from "../../lib/clientSession";
import { AqeNavigation } from "./components/AqeNavigation";
import { AssetRoomScreen } from "./components/AssetRoomScreen";
import { ShopScreen } from "./components/ShopScreen";
import { WalletScreen } from "./components/WalletScreen";
import type { CustomerView } from "./types";
import { getSupabaseClient } from "../../lib/supabaseClient";

type ProfileMedia = {
  id: string;
  url: string;
  type: "image" | "video";
  mimeType?: string;
  isProfilePhoto?: boolean;
  moderationStatus?: string;
  contentAccess?: "public" | "subscribers_only";
  locked?: boolean;
  subscriptionRequired?: boolean;
};

type ProfileCard = {
  id?: string;
  userId?: string;
  name: string;
  city: string;
  tag: string;
  status: string;
  tier?: string;
  boosted?: boolean;
  boostExpiresAt?: string | null;
  boostLabel?: string;
  bio?: string;
  age?: number | null;
  gender?: string;
  services?: string[];
  contentCategories?: string[];
  socialPlatforms?: Record<string, string>;
  contactMethods?: Record<string, string>;
  location?: string;
  area?: string;
  headline?: string;
  languages?: string[];
  availability?: string;
  visibility?: string;
  avatarUrl?: string;
  media?: ProfileMedia[];
  vipContent?: {
    enabled: boolean;
    monthlyPrice: number;
    currency: string;
    title: string;
    description?: string | null;
    subscribed: boolean;
  } | null;
};

type MessageRow = {
  userId?: string;
  user: string;
  preview: string;
  time: string;
};

type CommentRow = {
  id?: string;
  profileId: string;
  body: string;
  createdAt?: string;
};

type BookingRow = {
  title: string;
  date: string;
  amount: string;
  status?: string;
};

type ProductRow = {
  id: string;
  title: string;
  price: number;
  currency: string;
  inventory: number;
};

const customerRouteByView: Record<CustomerView, string> = {
  home: "/customer",
  discover: "/customer/explore",
  shop: "/customer/shop",
  assetRoom: "/customer/asset-room",
  comments: "/customer/comments",
  messages: "/customer/messages",
  bookings: "/customer/book-now",
  me: "/customer/profile",
  wallet: "/customer/wallet",
  premium: "/customer/premium",
  vip: "/customer/vip-hub",
  rewards: "/customer/rewards",
  referrals: "/customer/my-team",
  raffle: "/customer/raffle",
  settings: "/customer/settings",
  transactions: "/customer/transactions",
};

const customerViewByRoute: Record<string, CustomerView> = Object.fromEntries(
  Object.entries(customerRouteByView).map(([view, route]) => [route, view]),
) as Record<string, CustomerView>;

export default function CustomerPage() {
  const pathname = usePathname();
  const router = useRouter();
  const [data, setData] = useState({
    walletBalance: 0,
    qcBalance: 0,
    tier: "basic",
    bookings: 0,
    earnings: 0,
  });
  const [authOpen, setAuthOpen] = useState(false);
  const [upgradeOpen, setUpgradeOpen] = useState(false);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [authMode, setAuthMode] = useState<"login" | "register">("login");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [phone, setPhone] = useState("");
  const [age, setAge] = useState("");
  const [country, setCountry] = useState("Uganda");
  const [city, setCity] = useState("");
  const [profileCategory, setProfileCategory] = useState("client");
  const [headline, setHeadline] = useState("");
  const [languages, setLanguages] = useState("");
  const [gender, setGender] = useState("");
  const [pronouns, setPronouns] = useState("");
  const [area, setArea] = useState("");
  const [availability, setAvailability] = useState("available");
  const [visibility, setVisibility] = useState("public");
  const [socialHandle, setSocialHandle] = useState("");
  const [bio, setBio] = useState("");
  const [contactPreference, setContactPreference] = useState("in_app");
  const [registrationTier, setRegistrationTier] = useState<
    "basic" | "premium" | "vip"
  >("basic");
  const [message, setMessage] = useState("");
  const [view, setView] = useState<CustomerView>("home");
  const [accountName, setAccountName] = useState("Guest account");
  const [accountSubtitle, setAccountSubtitle] = useState(
    "Sign in to manage your profile",
  );
  const [authenticated, setAuthenticated] = useState(false);
  const [selectedProfile, setSelectedProfile] = useState<ProfileCard | null>(
    null,
  );
  const [profiles, setProfiles] = useState<ProfileCard[]>([]);
  const [profileActionMessage, setProfileActionMessage] = useState("");
  const [profileMedia, setProfileMedia] = useState<ProfileMedia[]>([]);
  const [mediaUploading, setMediaUploading] = useState(false);
  const [mediaFeedback, setMediaFeedback] = useState("");
  const [messages, setMessages] = useState<MessageRow[]>([]);
  const [messageRecipientId, setMessageRecipientId] = useState("");
  const [messageBody, setMessageBody] = useState("");
  const [messageFeedback, setMessageFeedback] = useState("");
  const [bookingProfileId, setBookingProfileId] = useState("");
  const [bookingService, setBookingService] = useState("DM access request");
  const [bookingNote, setBookingNote] = useState("");
  const [bookingFeedback, setBookingFeedback] = useState("");
  const [comments, setComments] = useState<CommentRow[]>([]);
  const [commentProfileId, setCommentProfileId] = useState("");
  const [commentBody, setCommentBody] = useState("");
  const [commentFeedback, setCommentFeedback] = useState("");
  const [bookings, setBookings] = useState<BookingRow[]>([]);
  const [products, setProducts] = useState<ProductRow[]>([]);
  const [platformSettings, setPlatformSettings] = useState({
    walletCurrency: "UGX",
    qcExchangeRate: 1000,
    about: "",
    contact: "",
    tierPrices: { basic: 65000, premium: 150000, vip: 250000 },
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
      home: {} as Record<string, unknown>,
      rewards: {} as Record<string, unknown>,
      campaign: {} as Record<string, unknown>,
      raffle: {} as Record<string, unknown>,
      promotions: {} as Record<string, unknown>,
      vipContent: {} as Record<string, unknown>,
    },
  });
  const [referral, setReferral] = useState({
    referralCode: "",
    referralLink: "",
    directCount: 0,
    indirectCount: 0,
    directEarnings: 0,
    indirectEarnings: 0,
    currency: "UGX",
  });
  const [referralCode, setReferralCode] = useState("");
  const [receipts, setReceipts] = useState<Array<{ id:string; receipt_number:string; transaction_type:string; source:string; amount?:number|null; currency?:string|null; qc_amount?:number|null; cash_amount?:number|null; boost_days?:number|null; balance_before?:number|null; balance_after?:number|null; status:string; description?:string|null; created_at:string }>>([]);
  const [campaignPackages, setCampaignPackages] = useState<Array<{id:string;campaign_id:string;name:string;description?:string;qc_amount:number;cash_amount:number;cash_currency:string;boost_days:number;boost_label?:string;quantity?:number|null;claimed_count:number;active:boolean}>>([]);
  const [campaignFeedback, setCampaignFeedback] = useState("");
  const [campaignCodeInput, setCampaignCodeInput] = useState("");
  const [profileQuery, setProfileQuery] = useState("");
  const [homeFilter, setHomeFilter] = useState("All");
  const [profileFilters, setProfileFilters] = useState({ category: "", service: "", location: "", ageMin: "", ageMax: "", gender: "" });
  const [isBooting, setIsBooting] = useState(true);
  const [ageConfirmed, setAgeConfirmed] = useState(false);
  const [birthDay, setBirthDay] = useState("");
  const [birthMonth, setBirthMonth] = useState("");
  const [birthYear, setBirthYear] = useState("");
  const [ageError, setAgeError] = useState("");
  const [vipContentPrice, setVipContentPrice] = useState("");
  const [vipContentEnabled, setVipContentEnabled] = useState(false);
  const [vipContentFeedback, setVipContentFeedback] = useState("");
  const [vipMediaAccess, setVipMediaAccess] = useState<"public" | "subscribers_only">("public");

  async function subscribeToVipContent(profile: ProfileCard) {
    if (!profile.userId || profile.tier !== "vip" || !profile.vipContent?.enabled) return;
    if (profile.vipContent.subscribed) return;
    const { session, user } = readStoredSession();
    if (!session.access_token && !user.id) {
      setAuthOpen(true);
      return;
    }
    setProfileActionMessage("Creating your VIP content subscription payment...");
    try {
      const headers: HeadersInit = { "Content-Type": "application/json" };
      if (session.access_token) headers.authorization = `Bearer ${session.access_token}`;
      if (user.id) headers["x-user-id"] = user.id;
      const response = await fetch("/api/payments/initialize", {
        method: "POST",
        headers,
        body: JSON.stringify({
          amount: profile.vipContent.monthlyPrice,
          currency: profile.vipContent.currency,
          paymentKind: "vip_content_subscription",
          vipUserId: profile.userId,
          qcPackageId: `vip-content-${profile.userId}`,
        }),
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok || !payload.ok) {
        setProfileActionMessage(payload.reason || payload.message || "VIP content subscription payment could not be created.");
        return;
      }
      setProfileActionMessage(`Payment created. Reference: ${payload.reference || payload.order?.reference || "AQE reference"}. Complete the payment, then wait for confirmation.`);
    } catch (error) {
      setProfileActionMessage(error instanceof Error ? error.message : "VIP content subscription payment failed.");
    }
  }

  async function saveVipContentSettings() {
    const { session, user } = readStoredSession();
    const headers: HeadersInit = { "Content-Type": "application/json" };
    if (session.access_token) headers.authorization = `Bearer ${session.access_token}`;
    if (user.id) headers["x-user-id"] = user.id;
    const price = Number(vipContentPrice);
    if (!Number.isFinite(price) || price <= 0) {
      setVipContentFeedback("Enter a monthly content subscription price.");
      return;
    }
    try {
      const response = await fetch("/api/vip/content", {
        method: "POST",
        headers,
        body: JSON.stringify({
          enabled: vipContentEnabled,
          monthlyPrice: price,
          currency: platformSettings.walletCurrency,
        }),
      });
      const payload = await response.json().catch(() => ({}));
      setVipContentFeedback(payload.ok ? "VIP content subscription settings saved." : payload.reason || "Could not save VIP content settings.");
    } catch (error) {
      setVipContentFeedback(error instanceof Error ? error.message : "Could not save VIP content settings.");
    }
  }

  const navigateTo = (target: CustomerView) => {
    setView(target);
    const route = customerRouteByView[target];
    if (pathname !== route) router.push(route);
  };

  useEffect(() => {
    setReferralCode(
      new URLSearchParams(window.location.search).get("ref") || "",
    );
    const timer = window.setTimeout(() => setIsBooting(false), 650);
    setAgeConfirmed(localStorage.getItem("aqe-age-confirmed") === "true");
    return () => window.clearTimeout(timer);
  }, []);

  useEffect(() => {
    const routeView = customerViewByRoute[pathname];
    if (routeView) setView(routeView);
  }, [pathname]);

  useEffect(() => {
    const { session, user } = readStoredSession();
    const headers: HeadersInit = {};
    if (session.access_token)
      headers.authorization = `Bearer ${session.access_token}`;
    if (user.id) headers["x-user-id"] = user.id;
    setAuthenticated(Boolean(session.access_token || user.id));

    if (user.email) {
      setAccountName(
        user.display_name || user.displayName || user.email.split("@")[0],
      );
      setAccountSubtitle(user.email);
    }

    fetch("/api/dashboard", { headers })
      .then(async (response) => {
        if (response.ok) {
          const payload = await response.json();
          if (payload.customer) setData(payload.customer);
        }
      })
      .catch(() => undefined);

    fetch("/api/settings")
      .then(async (response) => {
        if (!response.ok) return;
        const payload = await response.json();
        if (payload.settings) setPlatformSettings(payload.settings);
      })
      .catch(() => undefined);

    fetch("/api/profiles")
      .then(async (response) => {
        if (!response.ok) return;
        const payload = await response.json();
        if (Array.isArray(payload.profiles) && payload.profiles.length > 0) {
          setProfiles(payload.profiles);
        }
      })
      .catch(() => undefined);

    if (session.access_token || user.id) {
      fetch("/api/profile/media", { headers })
        .then(async (response) => {
          if (!response.ok) return;
          const payload = await response.json();
          if (Array.isArray(payload.media)) setProfileMedia(payload.media);
        })
        .catch(() => undefined);
    }

    if (session.access_token || user.id) {
      fetch("/api/referrals", { headers })
        .then(async (response) => {
          if (!response.ok) return;
          const payload = await response.json();
          if (payload.ok) setReferral(payload);
        })
        .catch(() => undefined);

      fetch("/api/receipts", { headers })
        .then(async (response) => {
          if (!response.ok) return;
          const payload = await response.json();
          if (Array.isArray(payload.receipts)) setReceipts(payload.receipts);
        }).catch(() => undefined);

      fetch("/api/campaigns", { headers })
        .then(async (response) => {
          if (!response.ok) return;
          const payload = await response.json();
          if (Array.isArray(payload.packages)) setCampaignPackages(payload.packages);
        }).catch(() => undefined);

      fetch("/api/messages", { headers })
        .then(async (response) => {
          if (!response.ok) return;
          const payload = await response.json();
          if (Array.isArray(payload.messages) && payload.messages.length > 0) {
            setMessages(
              payload.messages.map(
                (item: {
                  userId?: string;
                  preview?: string;
                  time?: string;
                }) => ({
                  userId: item.userId,
                  user: item.userId || "AQE member",
                  preview: item.preview || "New message",
                  time: item.time || "Now",
                }),
              ),
            );
          }
        })
        .catch(() => undefined);

      fetch("/api/bookings", { headers })
        .then(async (response) => {
          if (!response.ok) return;
          const payload = await response.json();
          if (Array.isArray(payload.bookings) && payload.bookings.length > 0) {
            setBookings(payload.bookings);
          }
        })
        .catch(() => undefined);

      fetch("/api/comments", { headers })
        .then(async (response) => {
          if (!response.ok) return;
          const payload = await response.json();
          if (Array.isArray(payload.comments)) setComments(payload.comments);
        })
        .catch(() => undefined);
    }

    fetch("/api/marketplace/products")
      .then(async (response) => {
        if (!response.ok) return;
        const payload = await response.json();
        if (Array.isArray(payload.products) && payload.products.length > 0) {
          setProducts(payload.products);
        }
      })
      .catch(() => undefined);
  }, []);

  async function uploadProfileMedia(file: File) {
    setMediaUploading(true);
    setMediaFeedback("");

    try {
      const { session, user } = readStoredSession();
      const headers: HeadersInit = { "Content-Type": "application/json" };
      if (session.access_token) headers.authorization = `Bearer ${session.access_token}`;
      if (user.id) headers["x-user-id"] = user.id;

      const kind = file.type.startsWith("video/") ? "video" : "image";
      const prepare = await fetch("/api/media/upload", {
        method: "POST",
        headers,
        body: JSON.stringify({
          userId: user.id,
          kind,
          mimeType: file.type,
          sizeBytes: file.size,
          fileName: file.name,
          contentAccess: data.tier === "vip" ? vipMediaAccess : "public",
        }),
      });
      const payload = await prepare.json().catch(() => ({}));

      if (!prepare.ok || !payload.ok || !payload.objectPath || !payload.token) {
        setMediaFeedback(payload.reason || "Media upload could not be prepared.");
        return;
      }

      const supabase = getSupabaseClient();
      if (!supabase) {
        setMediaFeedback("Media service is unavailable.");
        return;
      }

      const { error } = await supabase.storage
        .from("profile-media")
        .uploadToSignedUrl(payload.objectPath, payload.token, file);

      if (error) {
        setMediaFeedback(error.message);
        return;
      }

      const mediaResponse = await fetch("/api/profile/media", { headers });
      const mediaPayload = await mediaResponse.json().catch(() => ({}));
      const items: ProfileMedia[] = Array.isArray(mediaPayload.media)
        ? mediaPayload.media
        : [];
      setProfileMedia(items);

      if (kind === "image") {
        const newest = items.find(
          (item) => item.type === "image" && !item.isProfilePhoto,
        );
        if (newest) {
          const photoResponse = await fetch("/api/media/profile-photo", {
            method: "POST",
            headers,
            body: JSON.stringify({ userId: user.id, mediaId: newest.id }),
          });
          const photoPayload = await photoResponse.json().catch(() => ({}));
          if (!photoResponse.ok || !photoPayload.ok) {
            setMediaFeedback(
              photoPayload.reason ||
                "Photo uploaded, but the profile photo could not be updated.",
            );
            return;
          }
        }
      }

      const refreshed = await fetch("/api/profile/media", { headers });
      const refreshedPayload = await refreshed.json().catch(() => ({}));
      if (Array.isArray(refreshedPayload.media)) {
        setProfileMedia(refreshedPayload.media);
      }

      setMediaFeedback(
        kind === "video"
          ? "Video uploaded successfully."
          : "Photo uploaded and set as your profile photo.",
      );
    } catch (error) {
      setMediaFeedback(
        error instanceof Error ? error.message : "Media upload failed.",
      );
    } finally {
      setMediaUploading(false);
    }
  }

  async function submitAuth(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const endpoint =
      authMode === "login" ? "/api/auth/login" : "/api/auth/register";
    const body =
      authMode === "login"
        ? { email, password }
        : {
            email,
            password,
            displayName,
            phone,
            age: Number(age),
            country,
            city,
            category: profileCategory,
            headline,
            languages,
            gender,
            pronouns,
            area,
            availability,
            visibility,
            socialHandle,
            bio,
            contactPreference,
            requestedTier: registrationTier,
            referralCode,
          };

    const response = await fetch(endpoint, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    const payload = await response.json();
    setMessage(
      payload.ok
        ? payload.upgradeRequired
          ? `${payload.requestedTier?.toUpperCase() || "PAID"} selected. Complete payment before the upgrade activates.`
          : "Basic account created."
        : payload.reason || "Request failed.",
    );

    persistStoredSession({
      session: payload.session,
      user: payload.user,
    });

    if (payload.user) {
      const nextUser = {
        ...(payload.user as Record<string, unknown>),
        display_name:
          (
            payload.user as {
              display_name?: string;
              displayName?: string;
              name?: string;
              email?: string;
            }
          ).display_name ||
          (
            payload.user as {
              display_name?: string;
              displayName?: string;
              name?: string;
              email?: string;
            }
          ).displayName ||
          (
            payload.user as {
              display_name?: string;
              displayName?: string;
              name?: string;
              email?: string;
            }
          ).name ||
          (
            payload.user as {
              display_name?: string;
              displayName?: string;
              name?: string;
              email?: string;
            }
          ).email?.split("@")[0] ||
          displayName ||
          "AQE Member",
      };
      setAccountName(String(nextUser.display_name));
      setAccountSubtitle(
        String((payload.user as { email?: string }).email || "member@aqe.test"),
      );
      setAuthenticated(true);
      if (payload.upgradeRequired) {
        setAccountSubtitle(
          `${payload.requestedTier?.toUpperCase() || "PAID"} selected · payment required`,
        );
      }
    }

    if (payload.ok) setAuthOpen(false);
  }

  async function signOut() {
    await fetch("/api/auth/logout", { method: "POST" }).catch(() => undefined);
    localStorage.removeItem("aqe-session");
    localStorage.removeItem("aqe-user");
    setAuthenticated(false);
    setAccountName("Guest account");
    setAccountSubtitle("Sign in to manage your profile");
    setData({
      walletBalance: 0,
      qcBalance: 0,
      tier: "basic",
      bookings: 0,
      earnings: 0,
    });
  }

  function confirmAge() {
    const birthDate = new Date(
      Number(birthYear),
      Number(birthMonth) - 1,
      Number(birthDay),
    );
    const today = new Date();
    let calculatedAge = today.getFullYear() - birthDate.getFullYear();
    const beforeBirthday =
      today.getMonth() < birthDate.getMonth() ||
      (today.getMonth() === birthDate.getMonth() &&
        today.getDate() < birthDate.getDate());
    if (beforeBirthday) calculatedAge -= 1;
    if (!birthDay || !birthMonth || !birthYear || calculatedAge < 18) {
      setAgeError("You must be 18 or older to enter AQE.");
      return;
    }
    setAgeError("");
    localStorage.setItem("aqe-age-confirmed", "true");
    setAgeConfirmed(true);
  }

  async function runProfileAction(action: "message" | "booking") {
    if (!selectedProfile?.userId) {
      setProfileActionMessage(
        "This profile is not currently available for live actions.",
      );
      return;
    }

    const { session, user } = readStoredSession();
    const headers: HeadersInit = { "Content-Type": "application/json" };
    if (session.access_token)
      headers.authorization = `Bearer ${session.access_token}`;
    if (user.id) headers["x-user-id"] = user.id;

    const endpoint = action === "message" ? "/api/messages" : "/api/bookings";
    const body =
      action === "message"
        ? {
            recipientId: selectedProfile.userId,
            body: `Hi ${selectedProfile.name}, I found your profile on AQE.`,
          }
        : {
            providerId: selectedProfile.userId,
            service: `Intro with ${selectedProfile.name}`,
            amount: 0,
            currency: "UGX",
          };

    const response = await fetch(endpoint, {
      method: "POST",
      headers,
      body: JSON.stringify(body),
    });
    const payload = await response.json().catch(() => ({}));
    setProfileActionMessage(
      payload.ok
        ? action === "message"
          ? "Message sent."
          : "Booking request created."
        : payload.reason || "Action could not be completed.",
    );
  }

  async function submitComment(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const { session, user } = readStoredSession();
    const headers: HeadersInit = { "Content-Type": "application/json" };
    if (session.access_token)
      headers.authorization = `Bearer ${session.access_token}`;
    if (user.id) headers["x-user-id"] = user.id;

    const response = await fetch("/api/comments", {
      method: "POST",
      headers,
      body: JSON.stringify({ profileId: commentProfileId, body: commentBody }),
    });
    const payload = await response.json().catch(() => ({}));
    if (!payload.ok) {
      setCommentFeedback(payload.reason || "Comment could not be posted.");
      return;
    }
    setComments((current) => [
      {
        id: payload.comment?.id,
        profileId: commentProfileId,
        body: commentBody.trim(),
        createdAt: payload.comment?.created_at || new Date().toISOString(),
      },
      ...current,
    ]);
    setCommentBody("");
    setCommentFeedback("Comment posted.");
  }

  async function submitBooking(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const { session, user } = readStoredSession();
    const headers: HeadersInit = { "Content-Type": "application/json" };
    if (session.access_token)
      headers.authorization = `Bearer ${session.access_token}`;
    if (user.id) headers["x-user-id"] = user.id;

    const profile = profiles.find((item) => item.id === bookingProfileId);
    const response = await fetch("/api/bookings", {
      method: "POST",
      headers,
      body: JSON.stringify({
        providerId: profile?.userId,
        service: bookingService,
        amount: 0,
        currency: "UGX",
        notes: bookingNote,
      }),
    });
    const payload = await response.json().catch(() => ({}));
    if (!payload.ok) {
      setBookingFeedback(payload.reason || "Booking request could not be sent.");
      return;
    }
    setBookings((current) => [
      {
        title: bookingService,
        date: "Just now",
        amount: "UGX 0",
        status: "pending",
      },
      ...current,
    ]);
    setBookingNote("");
    setBookingFeedback("Booking request sent.");
  }

  async function submitMessage(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const { session, user } = readStoredSession();
    const headers: HeadersInit = { "Content-Type": "application/json" };
    if (session.access_token)
      headers.authorization = `Bearer ${session.access_token}`;
    if (user.id) headers["x-user-id"] = user.id;

    const recipient = profiles.find(
      (profile) => profile.id === messageRecipientId,
    );
    const response = await fetch("/api/messages", {
      method: "POST",
      headers,
      body: JSON.stringify({ recipientId: recipient?.userId, body: messageBody }),
    });
    const payload = await response.json().catch(() => ({}));
    if (!payload.ok) {
      setMessageFeedback(payload.reason || "Message could not be sent.");
      return;
    }
    setMessages((current) => [
      {
        userId: recipient?.userId,
        user: recipient?.name || "AQE member",
        preview: messageBody.trim(),
        time: "Now",
      },
      ...current,
    ]);
    setMessageBody("");
    setMessageFeedback("Message sent.");
  }

  async function claimDailyQc() {
    const { session, user } = readStoredSession();
    const headers: HeadersInit = { "Content-Type": "application/json" };
    if (session.access_token) headers.authorization = `Bearer ${session.access_token}`;
    if (user.id) headers["x-user-id"] = user.id;
    const response = await fetch("/api/qc/daily-claim", { method: "POST", headers, body: JSON.stringify({}) });
    const payload = await response.json().catch(() => ({}));
    if (!payload.ok) { setMessage(payload.reason || "Daily QC claim could not be completed."); return; }
    setData((current) => ({ ...current, qcBalance: Number(payload.balanceAfter ?? current.qcBalance) }));
    setMessage(payload.message || `Daily reward claimed: ${payload.amount ?? 0} QC.`);
  }

  const visibleProfiles = profiles.filter((profile) => {
    const query = profileQuery.trim().toLowerCase();
    const haystack = [profile.name, profile.city, profile.location, profile.area, profile.tag, profile.status, profile.tier, profile.gender, profile.bio, profile.headline, ...(profile.services || []), ...(profile.contentCategories || [])].filter(Boolean).join(" ").toLowerCase();
    if (query && !haystack.includes(query)) return false;
    if (profileFilters.category && !(profile.contentCategories || []).some((item) => item.toLowerCase() === profileFilters.category.toLowerCase())) return false;
    if (profileFilters.service && !(profile.services || []).some((item) => item.toLowerCase().includes(profileFilters.service.toLowerCase()))) return false;
    if (profileFilters.location && ![profile.location, profile.city, profile.area].filter(Boolean).some((item) => String(item).toLowerCase().includes(profileFilters.location.toLowerCase()))) return false;
    if (profileFilters.gender && String(profile.gender || "").toLowerCase() !== profileFilters.gender.toLowerCase()) return false;
    if (profileFilters.ageMin && Number(profile.age || 0) < Number(profileFilters.ageMin)) return false;
    if (profileFilters.ageMax && Number(profile.age || 0) > Number(profileFilters.ageMax)) return false;
    return true;
  });
  const featuredProfiles = profiles.filter((profile) => {
    if (homeFilter === "All") return true;
    const haystack = [profile.name, profile.city, profile.location, profile.area, profile.tag, profile.status, profile.tier, profile.gender, ...(profile.services || []), ...(profile.contentCategories || [])].filter(Boolean).join(" ").toLowerCase();
    return haystack.includes(homeFilter.toLowerCase());
  });

  if (isBooting) {
    return (
      <main className="aqe-entry-state splash-state">
        <div className="splash-mark">AQE</div>
        <p>AfriQueerEcosystem</p>
      </main>
    );
  }

  if (!ageConfirmed) {
    return (
      <main className="aqe-entry-state age-gate-state">
        <div className="age-gate-card">
          <div className="auth-brand">AQE</div>
          <span className="eyebrow">WELCOME TO YOUR ECOSYSTEM</span>
          <h1>A space for adults, community, and connection.</h1>
          <p>
            You must be 18 or older to enter. Please confirm your age to
            continue.
          </p>
          <div className="age-gate-actions">
            <button
              className="primary-button"
              type="button"
              onClick={confirmAge}
            >
              I am 18 or older <span>→</span>
            </button>
            <div className="age-date-grid">
              <select
                value={birthDay}
                onChange={(event) => setBirthDay(event.target.value)}
                aria-label="Birth day"
              >
                <option value="">Day</option>
                {Array.from({ length: 31 }, (_, index) => (
                  <option key={index + 1} value={index + 1}>
                    {index + 1}
                  </option>
                ))}
              </select>
              <select
                value={birthMonth}
                onChange={(event) => setBirthMonth(event.target.value)}
                aria-label="Birth month"
              >
                <option value="">Month</option>
                {Array.from({ length: 12 }, (_, index) => (
                  <option key={index + 1} value={index + 1}>
                    {index + 1}
                  </option>
                ))}
              </select>
              <select
                value={birthYear}
                onChange={(event) => setBirthYear(event.target.value)}
                aria-label="Birth year"
              >
                <option value="">Year</option>
                {Array.from({ length: 83 }, (_, index) => {
                  const year = new Date().getFullYear() - 18 - index;
                  return (
                    <option key={year} value={year}>
                      {year}
                    </option>
                  );
                })}
              </select>
            </div>
            {ageError ? <span className="age-error">{ageError}</span> : null}
          </div>
          <a className="age-exit-link" href="https://www.google.com">
            Leave this page
          </a>
        </div>
      </main>
    );
  }

  return (
    <main className="aqe-client" id="app">
      <aside
        className="client-desktop-nav"
        aria-label="AQE ecosystem navigation"
      >
        <div className="client-desktop-brand">AQE ECOSYSTEM</div>
        <span className="client-desktop-label">Discover</span>
        {[
          ["Home", "⌂", "home"],
          ["Explore", "⌕", "discover"],
          ["Shop", "▤", "shop"],
          ["Messages", "✉", "messages"],
          ["Bookings", "◫", "bookings"],
          ["Wallet", "₣", "wallet"],
        ].map(([label, icon, target]) => (
          <button
            type="button"
            key={label}
            className={view === target ? "active" : ""}
            onClick={() => navigateTo(target as CustomerView)}
          >
            <span>{icon}</span>
            {label}
          </button>
        ))}
        <span className="client-desktop-label">Account</span>
        <button
          type="button"
          className={view === "me" ? "active" : ""}
          onClick={() => navigateTo("me")}
        >
          <span>◉</span>My profile
        </button>
        <button
          type="button"
          className={view === "premium" ? "active" : ""}
          onClick={() => navigateTo("premium")}
        >
          <span>★</span>Premium Hub
        </button>
        <button
          type="button"
          className={view === "vip" ? "active" : ""}
          onClick={() => navigateTo("vip")}
        >
          <span>♢</span>VIP Hub
        </button>
        <button
          type="button"
          className={view === "rewards" ? "active" : ""}
          onClick={() => navigateTo("rewards")}
        >
          <span>✦</span>Rewards
        </button>
        <button
          type="button"
          className={view === "referrals" ? "active" : ""}
          onClick={() => navigateTo("referrals")}
        >
          <span>♟</span>My Team
        </button>
        <button
          type="button"
          className={view === "raffle" ? "active" : ""}
          onClick={() => navigateTo("raffle")}
        >
          <span>🎟</span>Raffle
        </button>
        <button
          type="button"
          className={view === "settings" ? "active" : ""}
          onClick={() => navigateTo("settings")}
        >
          <span>⚙</span>Settings
        </button>
      </aside>
      <AqeNavigation
        accountName={accountName}
        authenticated={authenticated}
        drawerOpen={drawerOpen}
        onAccount={() => setAuthOpen(true)}
        onAuthAction={() => {
          setDrawerOpen(false);
          if (authenticated) signOut();
          else setAuthOpen(true);
        }}
        onCloseDrawer={() => setDrawerOpen(false)}
        onNavigate={navigateTo}
        onOpenDrawer={() => setDrawerOpen(true)}
        onUpgrade={() => setUpgradeOpen(true)}
        tier={data.tier}
        view={view}
        walletCurrency={platformSettings.walletCurrency}
      />

      <section className="client-content">
        {view === "home" && (
          <>
        <div className="client-hero aqe-original-hero">
          <div className="aqe-hero-orb" />
          <div className="hero-kicker">
            {String(platformSettings.customerContent.home.heroKicker || "VERIFIED PROFESSIONALS · SECURE PAYMENTS · DISCREET EXPERIENCE")}
          </div>
          <h1>{String(platformSettings.customerContent.home.heroTitle || "Discover Independence")}</h1>
          <p>{String(platformSettings.customerContent.home.heroDescription || "Verified professionals. Secure payments. Discreet experience.")}</p>
          {false && <button
            className="primary-button"
            type="button"
            onClick={() => setAuthOpen(true)}
          >
            Explore the ecosystem <span>→</span>
          </button>}
        </div>

          </>
        )}

        <section className="section-block">
          {view === "home" && (
            <>
              <div className="prototype-filter-pills">
                {[
                  "All",
                  "Available",
                  "VIP",
                  "Premium",
                  "Kampala",
                  "Entebbe",
                  "Female",
                  "Male",
                  "Lesbian",
                ].map((filter) => (
                  <button
                    type="button"
                    className={homeFilter === filter ? "active" : ""}
                    key={filter}
                    onClick={() => setHomeFilter(filter)}
                  >
                    {filter}
                  </button>
                ))}
              </div>
              <div className="featured-heading">
                <h2>Featured Profiles</h2>
                <button type="button" onClick={() => navigateTo("discover")}>
                  See All →
                </button>
              </div>
              <div className="prototype-profile-grid">
                {featuredProfiles.slice(0, 4).map((profile) => (
                  <button
                    type="button"
                    className="prototype-profile-card"
                    key={profile.name}
                    onClick={() => setSelectedProfile(profile)}
                    >
                      <div className="prototype-profile-image">
                        
                        {profile.boosted ? <span className="aqe-boost-badge"><i className="fas fa-bolt" /> Boosted</span> : null}
                        <div className="prototype-profile-avatar">
                          {profile.avatarUrl ? (
                            <img
                              src={profile.avatarUrl}
                              alt={profile.name}
                              className="aqe-avatar-image"
                            />
                          ) : (
                            profile.name.charAt(0)
                          )}
                        </div>
                        <span>
                          {profile.city}
                          {profile.age ? ` · ${profile.age}` : ""}
                        </span>
                        <b>✓ Verified</b>
                      </div>
                    <strong>{profile.name}</strong>
                    {profile.boosted ? <small className="aqe-boost-label"><i className="fas fa-bolt" /> {profile.boostLabel || "Boosted profile"}</small> : null}
                    <small>
                      {profile.tag} · {profile.city}
                    </small>
                    <div>
                      <em>{profile.status}</em>
                      <label>{(profile.tier || "basic").toUpperCase()}</label>
                    </div>
                  </button>
                ))}
              </div>
              {featuredProfiles.length === 0 ? (
                <div className="empty-panel">
                  No featured profiles match this filter.
                </div>
              ) : null}
              <div className="explore-grid">
                {[
                  "Directory",
                  "Bookings",
                  "Messages",
                  "Rewards",
                  "Marketplace",
                  "VIP room",
                ].map((item, index) => (
                  <button
                    className="explore-tile"
                    type="button"
                    key={item}
                    onClick={() => {
                      const routeMap: Record<number, CustomerView> = {
                        0: "discover",
                        1: "bookings",
                        2: "messages",
                        3: "rewards",
                        4: "home",
                        5: "vip",
                      };
                      navigateTo(routeMap[index] ?? "home");
                    }}
                  >
                    <span>{["⌕", "◫", "✉", "★", "▤", "♢"][index]}</span>
                    <strong>{item}</strong>
                  </button>
                ))}
              </div>
            </>
          )}

          {view === "discover" && (
            <div className="aqe-explore-results">
              <div className="aqe-explore-filters">
                <input className="directory-search" value={profileQuery} onChange={(event) => setProfileQuery(event.target.value)} placeholder="Search name, service, content, location..." aria-label="Search profiles" />
                <div className="aqe-filter-row">
                  {["", "lesbian", "gay", "bisexual", "trans", "queer"].map((category) => (
                    <button type="button" key={category || "all"} className={profileFilters.category === category ? "active" : ""} onClick={() => setProfileFilters((current) => ({ ...current, category }))}>
                      {category ? category.charAt(0).toUpperCase() + category.slice(1) : "All content"}
                    </button>
                  ))}
                </div>
                <div className="aqe-filter-controls">
                  <input value={profileFilters.service} onChange={(e) => setProfileFilters(c => ({...c, service:e.target.value}))} placeholder="Service" />
                  <input value={profileFilters.location} onChange={(e) => setProfileFilters(c => ({...c, location:e.target.value}))} placeholder="Location" />
                  <input value={profileFilters.ageMin} onChange={(e) => setProfileFilters(c => ({...c, ageMin:e.target.value}))} type="number" min="18" placeholder="Min age" />
                  <input value={profileFilters.ageMax} onChange={(e) => setProfileFilters(c => ({...c, ageMax:e.target.value}))} type="number" min="18" placeholder="Max age" />
                  <select value={profileFilters.gender} onChange={(e) => setProfileFilters(c => ({...c, gender:e.target.value}))}><option value="">All genders</option><option value="female">Female</option><option value="male">Male</option><option value="non-binary">Non-binary</option><option value="other">Other</option></select>
                </div>
              </div>
              {visibleProfiles.map((profile) => (
                <article key={profile.id || profile.userId || profile.name} className="prototype-profile-card aqe-explore-card" onClick={() => setSelectedProfile(profile)} onKeyDown={(event) => { if (event.key === "Enter" || event.key === " ") { event.preventDefault(); setSelectedProfile(profile); } }} role="button" tabIndex={0}>
                  <div className="prototype-profile-image">
                    <span className="prototype-profile-rating"><i className="fas fa-star" /> 4.8</span>\n                    {profile.boosted ? <span className="aqe-boost-badge"><i className="fas fa-bolt" /> Boosted</span> : null}
                    <div className="prototype-profile-avatar">
                      {profile.avatarUrl ? (
                        <img src={profile.avatarUrl} alt={profile.name} className="aqe-avatar-image" />
                      ) : (
                        profile.name.charAt(0)
                      )}
                    </div>
                  </div>
                  <div className="panel-copy">
                    <strong>{profile.name}{profile.age ? ", " + profile.age : ""}</strong>
                    <span>{profile.contentCategories?.join(" · ") || profile.tag}</span>
                    <small>{profile.services?.join(" · ") || "Services not listed"} · {profile.location || profile.city}</small>
                    <small>{profile.gender || "Gender not listed"}{profile.bio ? " · " + profile.bio : ""}</small>
                  </div>
                  <div className="status-pill">{profile.status}</div>
                </article>
              ))}
              {visibleProfiles.length === 0 ? (
                <div className="empty-panel">
                  No profiles match that search.
                </div>
              ) : null}
            </div>
          )}

          {view === "shop" && (
            <ShopScreen products={products} />
          )}

          {view === "comments" && (
            <div className="aqe-community-screen aqe-comments-screen">
              <div className="section-heading">
                <div>
                  <span className="eyebrow">AQE COMMUNITY</span>
                  <h2>Comments</h2>
                </div>
              </div>
              <p className="screen-intro">
                Comment to get attention when direct-message access is not yet
                available.
              </p>
              {authenticated ? (
                <form className="aqe-community-form" onSubmit={submitComment}>
                  <select
                    value={commentProfileId}
                    onChange={(event) => setCommentProfileId(event.target.value)}
                    required
                  >
                    <option value="">Choose a profile</option>
                    {profiles
                      .filter((profile) => profile.id)
                      .map((profile) => (
                        <option key={profile.id} value={profile.id}>
                          {profile.name} · {profile.city}
                        </option>
                      ))}
                  </select>
                  <textarea
                    value={commentBody}
                    onChange={(event) => setCommentBody(event.target.value)}
                    placeholder="Write a comment..."
                    maxLength={2000}
                    required
                  />
                  <button type="submit" disabled={!commentProfileId || !commentBody.trim()}>
                    Post comment
                  </button>
                  {commentFeedback ? (
                    <span className="community-feedback">{commentFeedback}</span>
                  ) : null}
                </form>
              ) : (
                <div className="empty-panel">
                  Sign in to post a comment to an AQE profile.
                </div>
              )}
              <div className="feature-list">
                {comments.length ? (
                  comments.map((comment) => {
                    const profile = profiles.find(
                      (candidate) => candidate.id === comment.profileId,
                    );
                    return (
                      <div key={comment.id || `${comment.profileId}-${comment.createdAt}`}>
                        <strong>{profile?.name || "AQE profile"}</strong>
                        <span>{comment.body}</span>
                        <small>{comment.createdAt ? new Date(comment.createdAt).toLocaleString() : "Just now"}</small>
                      </div>
                    );
                  })
                ) : (
                  <div>
                    <strong>No comments yet</strong>
                    <span>Your posted comments will appear here.</span>
                  </div>
                )}
              </div>
            </div>
          )}

          {view === "messages" && (
            <div className="aqe-community-screen aqe-messages-screen">
              <div className="section-heading">
                <div>
                  <span className="eyebrow">AQE PRIVATE CHAT</span>
                  <h2>Messages</h2>
                </div>
                <span className="status-pill">{messages.length}</span>
              </div>
              {authenticated ? (
                <form className="aqe-community-form" onSubmit={submitMessage}>
                  <select
                    value={messageRecipientId}
                    onChange={(event) => setMessageRecipientId(event.target.value)}
                    required
                  >
                    <option value="">Start a new conversation</option>
                    {profiles
                      .filter((profile) => profile.id && profile.userId)
                      .map((profile) => (
                        <option key={profile.id} value={profile.id}>
                          {profile.name} · {profile.city}
                        </option>
                      ))}
                  </select>
                  <textarea
                    value={messageBody}
                    onChange={(event) => setMessageBody(event.target.value)}
                    placeholder="Write a private message..."
                    maxLength={2000}
                    required
                  />
                  <button type="submit" disabled={!messageRecipientId || !messageBody.trim()}>
                    Send message
                  </button>
                  {messageFeedback ? (
                    <span className="community-feedback">{messageFeedback}</span>
                  ) : null}
                </form>
              ) : (
                <div className="empty-panel">
                  Sign in to start a private AQE conversation.
                </div>
              )}
              <div className="stacked-panel-list">
                {messages.map((messageItem, index) => {
                  const profile = profiles.find(
                    (candidate) => candidate.userId === messageItem.userId,
                  );
                  return (
                    <article
                      key={`${messageItem.user}-${messageItem.time}-${index}`}
                      className="content-panel compact"
                    >
                      <div className="mini-avatar alt">
                        {(profile?.name || messageItem.user).charAt(0)}
                      </div>
                      <div className="panel-copy">
                        <strong>{profile?.name || messageItem.user}</strong>
                        <span>{messageItem.preview}</span>
                      </div>
                      <small>{messageItem.time}</small>
                    </article>
                  );
                })}
              </div>
            </div>
          )}

          {view === "bookings" && (
            <div className="aqe-community-screen aqe-bookings-screen">
              <div className="section-heading">
                <div>
                  <span className="eyebrow">AQE REQUESTS</span>
                  <h2>Book Now</h2>
                </div>
                <span className="status-pill">{data.qcBalance} QC</span>
              </div>
              <p className="screen-intro">
                Send a booking or access request to a verified AQE profile.
              </p>
              {authenticated ? (
                <form className="aqe-community-form" onSubmit={submitBooking}>
                  <select
                    value={bookingProfileId}
                    onChange={(event) => setBookingProfileId(event.target.value)}
                    required
                  >
                    <option value="">Choose a profile</option>
                    {profiles
                      .filter((profile) => profile.id && profile.userId)
                      .map((profile) => (
                        <option key={profile.id} value={profile.id}>
                          {profile.name} · {profile.city}
                        </option>
                      ))}
                  </select>
                  <select
                    value={bookingService}
                    onChange={(event) => setBookingService(event.target.value)}
                  >
                    <option>DM access request</option>
                    <option>Booking enquiry</option>
                    <option>Photo content request</option>
                    <option>Video content request</option>
                  </select>
                  <textarea
                    value={bookingNote}
                    onChange={(event) => setBookingNote(event.target.value)}
                    placeholder="Add a note (optional)"
                    maxLength={1000}
                  />
                  <button type="submit" disabled={!bookingProfileId}>
                    Send request
                  </button>
                  {bookingFeedback ? (
                    <span className="community-feedback">{bookingFeedback}</span>
                  ) : null}
                </form>
              ) : (
                <div className="empty-panel">
                  Sign in to send a booking request.
                </div>
              )}
              <div className="feature-list">
                {bookings.map((booking, index) => (
                  <div key={`${booking.title}-${booking.date}-${index}`}>
                    <strong>{booking.title}</strong>
                    <span>{booking.date} · {booking.amount}</span>
                    <small>{booking.status || "pending"}</small>
                  </div>
                ))}
              </div>
            </div>
          )}

          {view === "me" && (
            <div className="aqe-own-profile">
              {!authenticated ? <div className="aqe-own-signin"><i className="fas fa-lock" /><p>Sign in to manage your account. Guests can explore the public directory; signing in unlocks account tools.</p><button type="button" onClick={() => setAuthOpen(true)}>Sign In / Register</button></div> : null}
              <article className="content-panel">
                <div className="mini-avatar">
                  {profileMedia.find((item) => item.isProfilePhoto)?.url ? (
                    <img
                      src={profileMedia.find((item) => item.isProfilePhoto)?.url}
                      alt="Profile"
                      className="aqe-avatar-image"
                    />
                  ) : (
                    accountName.charAt(0).toUpperCase()
                  )}
                </div>
                <div className="panel-copy">
                  <strong>{accountName}</strong>
                  <span>{accountSubtitle}</span>
                </div>
                <div className="status-pill">{data.tier}</div>
              </article>
              {authenticated ? (
                <section className="aqe-own-media-panel">
                  {data.tier === "vip" ? (
                    <div className="content-panel compact" style={{ marginBottom: 12 }}>
                      <div className="panel-copy">
                        <strong>VIP creator content</strong>
                        <span>Set a monthly price for subscriber-only photos and videos. This is separate from your VIP membership renewal.</span>
                      </div>
                      <input
                        className="auth-input"
                        type="number"
                        min="1"
                        value={vipContentPrice}
                        onChange={(event) => setVipContentPrice(event.target.value)}
                        placeholder={`Monthly price in ${platformSettings.walletCurrency}`}
                      />
                      <label><input type="checkbox" checked={vipContentEnabled} onChange={(event) => setVipContentEnabled(event.target.checked)} /> Enable content subscriptions</label>
                      <button type="button" className="secondary-button" onClick={() => void saveVipContentSettings()}>Save content subscription</button>
                      {vipContentFeedback ? <span className="auth-message">{vipContentFeedback}</span> : null}
                    </div>
                  ) : null}
                  <div className="section-heading compact-heading">
                    <div>
                      <span className="eyebrow">PROFILE CONTENT</span>
                      <h2>Photos &amp; videos</h2>
                    </div>
                  </div>
                  <div className="aqe-media-upload-row">
                    <label className="primary-button">
                      {mediaUploading ? "Uploading..." : "Add photo"}
                      <input
                        type="file"
                        accept="image/jpeg,image/png,image/webp"
                        hidden
                        disabled={mediaUploading}
                        onChange={(event) => {
                          const file = event.target.files?.[0];
                          if (file) void uploadProfileMedia(file);
                          event.currentTarget.value = "";
                        }}
                      />
                    </label>
                    {data.tier === "vip" ? (
                      <label className="secondary-button">
                        <select value={vipMediaAccess} onChange={(event) => setVipMediaAccess(event.target.value as "public" | "subscribers_only")} disabled={mediaUploading} aria-label="VIP media access">
                          <option value="public">Public content</option>
                          <option value="subscribers_only">Subscribers only</option>
                        </select>
                      </label>
                    ) : null}
                    <label className="secondary-button">
                      {mediaUploading ? "Uploading..." : "Add video"}
                      <input
                        type="file"
                        accept="video/mp4,video/webm,video/quicktime"
                        hidden
                        disabled={mediaUploading}
                        onChange={(event) => {
                          const file = event.target.files?.[0];
                          if (file) void uploadProfileMedia(file);
                          event.currentTarget.value = "";
                        }}
                      />
                    </label>
                  </div>
                  {mediaFeedback ? (
                    <span className="auth-message">{mediaFeedback}</span>
                  ) : null}
                  <div className="aqe-own-media-grid">
                    {profileMedia.map((media) =>
                      media.type === "video" ? (
                        <video
                          key={media.id}
                          src={media.url}
                          controls
                          preload="metadata"
                          className="aqe-own-media-item"
                        />
                      ) : (
                        <img
                          key={media.id}
                          src={media.url}
                          alt="AQE profile content"
                          className="aqe-own-media-item"
                        />
                      ),
                    )}
                  </div>
                </section>
              ) : null}

              <div className="aqe-own-shortcuts">
                <button type="button" onClick={() => window.location.href = "/payments"}><i className="fas fa-arrow-down" /><span>Deposit</span></button>
                <button type="button" onClick={() => navigateTo("wallet")}><i className="fas fa-arrow-up" /><span>Withdraw</span></button>
                <button type="button" onClick={() => navigateTo("wallet")}><i className="fas fa-receipt" /><span>Bill</span></button>
                <button type="button" onClick={() => navigateTo("referrals")}><i className="fas fa-user-plus" /><span>Invite</span></button>
                <button type="button" onClick={() => navigateTo("referrals")}><i className="fas fa-users" /><span>My Team</span></button>
                <button type="button" onClick={() => navigateTo("rewards")}><i className="fas fa-gift" /><span>Rewards</span></button>
                <button type="button" onClick={() => navigateTo("settings")}><i className="fas fa-cog" /><span>Settings</span></button>
                <button type="button" onClick={signOut}><i className="fas fa-sign-out-alt" /><span>Logout</span></button>
              </div>

              <button
                className="content-panel compact content-panel-button"
                type="button"
                onClick={() => navigateTo("wallet")}
              >
                <div className="mini-avatar gold">Q</div>
                <div className="panel-copy">
                  <strong>Wallet</strong>
                  <span>{data.qcBalance} QC balance</span>
                </div>
                <small>UGX {data.earnings}</small>
              </button>

              <button
                className="content-panel compact content-panel-button"
                type="button"
                onClick={() => navigateTo("vip")}
              >
                <div className="mini-avatar alt">V</div>
                <div className="panel-copy">
                  <strong>VIP access</strong>
                  <span>Upgrades and private rooms</span>
                </div>
                <small>{data.tier}</small>
              </button>

              <button
                className="content-panel compact content-panel-button"
                type="button"
                onClick={() => navigateTo("referrals")}
              >
                <div className="mini-avatar">R</div>
                <div className="panel-copy">
                  <strong>Referral earnings</strong>
                  <span>
                    {referral.directCount} direct • {referral.indirectCount}{" "}
                    indirect
                  </span>
                </div>
                <small>
                  {referral.currency}{" "}
                  {(
                    referral.directEarnings + referral.indirectEarnings
                  ).toLocaleString()}
                </small>
              </button>
            </div>
          )}

          {view === "assetRoom" && (
            <AssetRoomScreen
              currency={platformSettings.walletCurrency}
              onUpgrade={() => {
                window.location.href = "/payments";
              }}
              tier={data.tier}
              walletBalance={data.walletBalance}
            />
          )}

          {view === "wallet" && (
            <>
              <WalletScreen
                currency={platformSettings.walletCurrency}
                onDeposit={() => {
                  window.location.href = "/payments";
                }}
                onWithdraw={() => {
                  window.location.href = "/vip";
                }}
                onRechargeQc={() => {
                  window.location.href = "/qc";
                }}
                onViewEarnings={() => navigateTo("referrals")}
                qcBalance={data.qcBalance}
                walletBalance={data.walletBalance}
              />
              {false && <div className="prototype-screen-stack">
              <article className="prototype-hero-card wallet-hero">
                <span className="eyebrow">AQE MONEY ACCOUNT</span>
                <h2>Wallet cash</h2>
                <strong>
                  {platformSettings.walletCurrency}{" "}
                  {data.walletBalance.toLocaleString()}
                </strong>
                <p>
                  Cash deposits and referral earnings are separate from QC
                  credits.
                </p>
              </article>
              <div className="prototype-action-grid">
                <button
                  type="button"
                  onClick={() => {
                    setUpgradeOpen(true);
                  }}
                >
                  Deposit cash <span>→</span>
                </button>
                <button type="button" onClick={() => navigateTo("referrals")}>
                  View earnings <span>→</span>
                </button>
                <button
                  type="button"
                  onClick={() => {
                    window.location.href = "/qc";
                  }}
                >
                  Recharge QC <span>→</span>
                </button>
              </div>
              <article className="content-panel compact">
                <div className="mini-avatar gold">Q</div>
                <div className="panel-copy">
                  <strong>QC balance</strong>
                  <span>Usage credits, not cash</span>
                </div>
                <small>{data.qcBalance} QC</small>
              </article>
              </div>}
            </>
          )}

          {view === "premium" && (
            <div className="aqe-membership-hub aqe-premium-hub">
              <article className="prototype-hero-card premium-hero">
                <span className="eyebrow">PREMIUM HUB</span>
                <h2>Build your independent profile.</h2>
                <p>
                  Premium unlocks profile tools, messaging, comments, and daily
                  chat allowance.
                </p>
                <button
                  type="button"
                  onClick={() => {
                    setUpgradeOpen(true);
                  }}
                >
                  Upgrade to Premium <span>→</span>
                </button>
              </article>
              <div className="aqe-hub-metrics"><div><span>Photos</span><strong>Manager limit</strong></div><div><span>Chat allowance today</span><strong>0 / 5</strong></div><div><span>Global QC</span><strong>{data.qcBalance}</strong></div><div><span>Store</span><strong>Not available</strong></div></div>
              <p className="aqe-hub-notice">Premium members get an independent profile with messages and comments, 5 free daily chat messages, and can book others. Groups, voice notes, asset room and store remain VIP-only.</p>
              <div className="feature-list">
                <div>
                  <strong>Independent profile</strong>
                  <span>Present your work and services.</span>
                </div>
                <div>
                  <strong>Profile media</strong>
                  <span>Upload and manage your public profile.</span>
                </div>
                <div>
                  <strong>Daily chat allowance</strong>
                  <span>Connect with the AQE community.</span>
                </div>
              </div>
            </div>
          )}

          {view === "vip" && (
            <div className="aqe-membership-hub aqe-vip-hub">
              <article className="prototype-hero-card vip-hero">
                <span className="eyebrow">VIP ECOSYSTEM</span>
                <h2>Everything in one private room.</h2>
                <p>
                  Unlock asset room, store, groups, referral earnings, rewards,
                  and VIP booking tools.
                </p>
                <button
                  type="button"
                  onClick={() => {
                    window.location.href = "/payments";
                  }}
                >
                  Upgrade to VIP <span>→</span>
                </button>
              </article>
              <div className="aqe-hub-metrics"><div><span>Photos</span><strong>Unlimited</strong></div><div><span>DM</span><strong>Unlimited</strong></div><div><span>Asset room</span><strong>Active</strong></div><div><span>Store</span><strong>Active</strong></div><div><span>Groups &amp; voice</span><strong>Active</strong></div><div><span>Reward progress</span><strong>Live rewards</strong></div></div>
              <div className="prototype-action-grid">
                <button type="button" onClick={() => navigateTo("referrals")}>
                  My team <span>→</span>
                </button>
                <button type="button" onClick={() => navigateTo("rewards")}>
                  VIP rewards <span>→</span>
                </button>
                <button
                  type="button"
                  onClick={() => {
                    window.location.href = "/vip";
                  }}
                >
                  Withdrawals <span>→</span>
                </button>
              </div>
            </div>
          )}

          {view === "rewards" && (
            <div className="aqe-rewards-screen">
              <div className="section-heading">
                <div>
                  <span className="eyebrow">{String(platformSettings.customerContent.rewards.eyebrow || "VIP ECOSYSTEM")}</span>
                  <h2>{String(platformSettings.customerContent.rewards.title || "Rewards")}</h2>
                </div>
                <span className="status-pill">{data.qcBalance} QC</span>
              </div>
              <div className="feature-list">
                <div>
                  <strong>{String(platformSettings.customerContent.rewards.dailyClaimTitle || "Daily claim")}</strong>
                  <span>{String(platformSettings.customerContent.rewards.dailyClaimDescription || "Collect your daily QC reward.")}</span>
                  <button
                    type="button"
                    onClick={claimDailyQc}
                  >
                    Claim QC
                  </button>
                </div>
                <div>
                  <strong>{String(platformSettings.customerContent.rewards.vipRewardTitle || "1 Week VIP")}</strong>
                  <span>{String(platformSettings.customerContent.rewards.vipRewardDescription || "Redeem rewards after eligibility.")}</span>
                  <button type="button" onClick={() => navigateTo("vip")}>
                    View VIP
                  </button>
                </div>
                <div>
                  <strong>{String(platformSettings.customerContent.rewards.raffleTitle || "Raffle")}</strong>
                  <span>{String(platformSettings.customerContent.rewards.raffleDescription || "Use QC for the active draw.")}</span>
                  <button type="button" onClick={() => navigateTo("raffle")}>
                    Open raffle
                  </button>
                </div>
              </div>
            </div>
          )}

          {view === "transactions" && (
            <div className="aqe-rewards-screen">
              <div className="section-heading"><div><span className="eyebrow">AQE PROOF</span><h2>Transactions & Receipts</h2></div><span className="status-pill">{receipts.length}</span></div>
              <p className="screen-intro">Every completed reward, payment, wallet movement, QC transaction, boost and withdrawal is recorded with a permanent AQE reference.</p>
              <div className="feature-list">
                {receipts.map((receipt) => (
                  <article key={receipt.id} className="content-panel compact">
                    <div className="mini-avatar gold"><i className="fas fa-receipt" /></div>
                    <div className="panel-copy"><strong>{receipt.transaction_type.replace(/_/g, " ")}</strong><span>{receipt.description || receipt.source} · {new Date(receipt.created_at).toLocaleString()}</span><small>Receipt: {receipt.receipt_number} · Status: {receipt.status}</small></div>
                    <div><strong>{receipt.cash_amount ? `UGX ${Number(receipt.cash_amount).toLocaleString()}` : receipt.qc_amount ? `${Number(receipt.qc_amount).toLocaleString()} QC` : receipt.amount != null ? `${receipt.currency || platformSettings.walletCurrency} ${Number(receipt.amount).toLocaleString()}` : ""}</strong>{receipt.boost_days ? <small> + {receipt.boost_days} day boost</small> : null}</div>
                  </article>
                ))}
                {!receipts.length ? <div className="empty-panel">No receipts yet. Your AQE proof will appear here after your first transaction or reward.</div> : null}
              </div>
            </div>
          )}


              <section className="aqe-community-screen" style={{marginTop:16}}>
                <div className="section-heading"><div><span className="eyebrow">CAMPAIGNS</span><h2>Campaign rewards</h2></div></div>
                <form className="aqe-community-form" onSubmit={async (event) => {
                  event.preventDefault();
                  setCampaignFeedback("");
                  const {session,user}=readStoredSession();
                  const headers:HeadersInit={"Content-Type":"application/json"};
                  if(session.access_token) headers.authorization=`Bearer ${session.access_token}`;
                  if(user.id) headers["x-user-id"]=user.id;
                  const response=await fetch("/api/campaigns/redeem",{method:"POST",headers,body:JSON.stringify({code:campaignCodeInput})});
                  const payload=await response.json().catch(()=>({}));
                  setCampaignFeedback(payload.ok ? `Reward received. Receipt: ${payload.receiptNumber}` : payload.reason || "Code redemption failed.");
                  if(payload.ok){setCampaignCodeInput(""); const rr=await fetch("/api/receipts",{headers}); const rp=await rr.json().catch(()=>({})); if(Array.isArray(rp.receipts)) setReceipts(rp.receipts);}
                }}>
                  <input value={campaignCodeInput} onChange={e=>setCampaignCodeInput(e.target.value.toUpperCase())} placeholder="Enter campaign code" required />
                  <button type="submit">Redeem code</button>
                  {campaignFeedback ? <span className="community-feedback">{campaignFeedback}</span> : null}
                </form>
                <div className="feature-list">
                  {campaignPackages.filter(p=>p.active).map(pkg=><div key={pkg.id}><strong>{pkg.name}</strong><span>{pkg.qc_amount} QC · {pkg.cash_currency} {Number(pkg.cash_amount).toLocaleString()} · {pkg.boost_days} day boost · {pkg.quantity == null ? "Unlimited" : `${Math.max(0,pkg.quantity-pkg.claimed_count)} left`}</span><button type="button" onClick={async()=>{
                    const {session,user}=readStoredSession(); const headers:HeadersInit={"Content-Type":"application/json"}; if(session.access_token)headers.authorization=`Bearer ${session.access_token}`; if(user.id)headers["x-user-id"]=user.id;
                    const response=await fetch("/api/campaigns/redeem",{method:"POST",headers,body:JSON.stringify({packageId:pkg.id})}); const payload=await response.json().catch(()=>({}));
                    setCampaignFeedback(payload.ok?`Gift received. Receipt: ${payload.receiptNumber}`:payload.reason||"Gift package failed.");
                    if(payload.ok){const rr=await fetch("/api/receipts",{headers});const rp=await rr.json().catch(()=>({}));if(Array.isArray(rp.receipts))setReceipts(rp.receipts);}
                  }}>Receive gift</button></div>)}
                </div>
              </section>
          {view === "referrals" && (
            <div className="aqe-referrals-screen">
              <article className="prototype-hero-card referral-hero">
                <span className="eyebrow">MY TEAM / REFERRALS</span>
                <h2>
                  {referral.currency}{" "}
                  {(
                    referral.directEarnings + referral.indirectEarnings
                  ).toLocaleString()}
                </h2>
                <p>
                  Real earnings credited after referred-member payment
                  confirmation.
                </p>
                {referral.referralLink ? (
                  <button
                    type="button"
                    onClick={() =>
                      navigator.clipboard.writeText(
                        `${window.location.origin}${referral.referralLink}`,
                      )
                    }
                  >
                    Copy referral link <span>→</span>
                  </button>
                ) : (
                  <small>Sign in to receive your unique referral link.</small>
                )}
              </article>
              <div className="metric-grid">
                <div className="metric-card">
                  <span>DIRECT</span>
                  <strong>{referral.directCount}</strong>
                </div>
                <div className="metric-card">
                  <span>INDIRECT</span>
                  <strong>{referral.indirectCount}</strong>
                </div>
                <div className="metric-card">
                  <span>DIRECT EARNINGS</span>
                  <strong>
                    {referral.currency}{" "}
                    {referral.directEarnings.toLocaleString()}
                  </strong>
                </div>
                <div className="metric-card">
                  <span>INDIRECT EARNINGS</span>
                  <strong>
                    {referral.currency}{" "}
                    {referral.indirectEarnings.toLocaleString()}
                  </strong>
                </div>
              </div>
            </div>
          )}

          {view === "raffle" && (
            <div className="aqe-raffle-screen">
              <article className="prototype-hero-card raffle-hero">
                <span className="eyebrow">RAFFLE</span>
                <h2>Join the next draw.</h2>
                <p>
                  Tickets use QC credits. Your cash wallet is never used for
                  raffle entry.
                </p>
                <button
                  type="button"
                  onClick={() => {
                    window.location.href = "/qc";
                  }}
                >
                  View QC and rewards <span>→</span>
                </button>
              </article>
              <div className="feature-list">
                <div>
                  <strong>Ticket price</strong>
                  <span>Manager-controlled QC amount</span>
                </div>
                <div>
                  <strong>Eligibility</strong>
                  <span>Available to eligible AQE members.</span>
                </div>
              </div>
            </div>
          )}

          {view === "settings" && (
            <div className="aqe-settings-screen">
              <article className="content-panel">
                <div className="mini-avatar">
                  {accountName.charAt(0).toUpperCase()}
                </div>
                <div className="panel-copy">
                  <strong>{accountName}</strong>
                  <span>{accountSubtitle}</span>
                </div>
                <button type="button" className="text-button" onClick={signOut}>
                  Sign out
                </button>
              </article>
              <div className="feature-list">
                <div>
                  <strong>About AQE</strong>
                  <span>
                    {platformSettings.about ||
                      "Community, profiles, bookings, and trusted creator tools."}
                  </span>
                </div>
                <div>
                  <strong>Contact</strong>
                  <span>
                    {platformSettings.contact ||
                      "Contact an AQE manager for support."}
                  </span>
                </div>
                <div>
                  <strong>Privacy and safety</strong>
                  <span>
                    Account, payment, and age-gate controls are active.
                  </span>
                </div>
              </div>
            </div>
          )}

          {view === "home" && (
            <div className="marketplace-preview">
              <div className="section-heading compact-heading">
                <div>
                  <span className="eyebrow">MARKETPLACE</span>
                  <h2>Featured drops</h2>
                </div>
                <span className="marketplace-count">
                  {products.length} live
                </span>
              </div>
              <div className="marketplace-grid">
                {products.map((product) => (
                  <article className="marketplace-item" key={product.id}>
                    <div className="marketplace-icon">✦</div>
                    <strong>{product.title}</strong>
                    <span>
                      {product.currency} {product.price}
                    </span>
                    <small>{product.inventory} available</small>
                  </article>
                ))}
              </div>
            </div>
          )}
        </section>

        {view === "home" && (
        <section className="section-block callout">
          <span className="callout-icon">✦</span>
          <div>
            <span className="eyebrow">VIP ECOSYSTEM</span>
            <h2>Unlock more of AQE</h2>
            <p>Premium tools, private rooms, and deeper connections.</p>
          </div>
          <button type="button" aria-label="Open VIP" onClick={() => navigateTo("vip")}>
            →
          </button>
        </section>
        )}
      </section>

      {selectedProfile ? (
        <div className="profile-overlay" role="dialog" aria-modal="true">
          <div className="profile-sheet">
            <button
              type="button"
              className="close-button"
              aria-label="Close profile"
              onClick={() => setSelectedProfile(null)}
              style={{ position: "absolute", top: 14, right: 14 }}
            >
              ×
            </button>
            <div className="profile-header">
              <div className="mini-avatar large">
                {selectedProfile.avatarUrl ? (
                  <img
                    src={selectedProfile.avatarUrl}
                    alt={`${selectedProfile.name} profile`}
                    className="aqe-avatar-image"
                  />
                ) : (
                  selectedProfile.name.charAt(0)
                )}
              </div>
              <div>
                <div className="eyebrow">PROFILE</div>
                <h2>{selectedProfile.name}</h2>
                <p>{selectedProfile.tag}</p>
              </div>
            </div>

            <div className="profile-chip-row">
              <span className="status-pill">{selectedProfile.status}</span>
              <span className="location-pill">{selectedProfile.city}</span>
            </div>

            <div className="profile-metrics">
              <div>
                <span>Availability</span>
                <strong>{selectedProfile.availability || "Not listed"}</strong>
              </div>
              <div>
                <span>Response</span>
                <strong>Not listed</strong>
              </div>
              <div>
                <span>Tier</span>
                <strong>{selectedProfile.tier || "basic"}</strong>
              </div>
            </div>

            <p className="profile-description">
              {selectedProfile.bio ||
                "Open to meaningful connections and collaborations across East Africa."}
            </p>

            {selectedProfile.tier === "vip" && selectedProfile.vipContent?.enabled ? (
              <div className="content-panel compact" style={{ marginBottom: 12 }}>
                <div className="panel-copy">
                  <strong>{selectedProfile.vipContent.title || "VIP Content"}</strong>
                  <span>{selectedProfile.vipContent.description || `Subscribe for ${selectedProfile.vipContent.currency} ${Number(selectedProfile.vipContent.monthlyPrice).toLocaleString()} per month to unlock subscriber-only content.`}</span>
                </div>
                {!selectedProfile.vipContent.subscribed ? (
                  <button type="button" className="primary-button" onClick={() => void subscribeToVipContent(selectedProfile)}>
                    Subscribe · {selectedProfile.vipContent.currency} {Number(selectedProfile.vipContent.monthlyPrice).toLocaleString()} / month
                  </button>
                ) : (
                  <span className="status-pill">Subscribed · access active</span>
                )}
              </div>
            ) : null}
            <h3 className="aqe-profile-section-title">Photos &amp; Media</h3>
            <div className="aqe-profile-media-grid">
              {(selectedProfile.media ?? []).length ? (
                (selectedProfile.media ?? []).map((media) =>
                  media.locked ? (
                    <div key={media.id} className="aqe-profile-media" style={{ display: "grid", placeItems: "center", minHeight: 180, padding: 20, textAlign: "center", background: "rgba(0,0,0,.08)", filter: "blur(.2px)" }}>
                      <div>
                        <strong>🔒 Subscriber-only content</strong>
                        <p>Subscribe to this VIP's content for one full month to unlock this media.</p>
                      </div>
                    </div>
                  ) : media.type === "video" ? (
                    <video
                      key={media.id}
                      src={media.url}
                      controls
                      preload="metadata"
                      className="aqe-profile-media"
                    />
                  ) : (
                    <img
                      key={media.id}
                      src={media.url}
                      alt={`${selectedProfile.name} profile media`}
                      className="aqe-profile-media"
                    />
                  ),
                )
              ) : (
                <div className="aqe-profile-media-empty">
                  No public photos or videos yet.
                </div>
              )}
            </div>
            <h3 className="aqe-profile-section-title">Store</h3>
            <div className="aqe-profile-store-card"><i className="fas fa-shopping-bag" /><div><strong>Profile store</strong><span>Products and private drops appear here when listed.</span></div></div>
            <h3 className="aqe-profile-section-title">Reviews</h3>
            <div className="aqe-profile-review"><div><i className="fas fa-star" /><i className="fas fa-star" /><i className="fas fa-star" /><i className="fas fa-star" /><i className="fas fa-star" /></div><p>“No verified AQE member feedback yet.”</p><span>— AQE community</span></div>

            <div className="profile-actions">
              <button
                className="primary-button"
                type="button"
                onClick={() => {
                  setBookingProfileId(selectedProfile.id || "");
                  setSelectedProfile(null);
                  navigateTo("bookings");
                }}
              >
                Message <span>→</span>
              </button>
              <button
                className="secondary-button"
                type="button"
                onClick={() => {
                  setCommentProfileId(selectedProfile.id || "");
                  setSelectedProfile(null);
                  navigateTo("comments");
                }}
              >
                Comment
              </button>
              <button
                className="secondary-button"
                type="button"
                onClick={() => {
                  runProfileAction("message");
                }}
              >
                Friend Request
              </button>
            </div>
            {profileActionMessage ? (
              <span className="auth-message">{profileActionMessage}</span>
            ) : null}
          </div>
        </div>
      ) : null}

      {upgradeOpen ? (
        <div className="aqe-upgrade-overlay" role="dialog" aria-modal="true" aria-label="Upgrade your AQE level">
          <div className="aqe-upgrade-sheet">
            <div className="aqe-upgrade-heading"><div><h2>Upgrade your AQE level</h2><p>Choose the membership that fits your AQE journey.</p></div><button type="button" onClick={() => setUpgradeOpen(false)} aria-label="Close"><i className="fas fa-times" /></button></div>
            {[
              ["basic", "Basic", "Base membership with public exploration and account access.", "basic"],
              ["premium", "Premium", "Independent profile, messages, comments, and daily chat allowance.", "premium"],
              ["vip", "VIP", "Everything: asset room, store, groups, voice, and booking tools.", "vip"],
            ].map(([value, label, description, tone]) => {
              const tierKey = value as "basic" | "premium" | "vip";
              const originalPrice = platformSettings.pricing.originalTierPrices[tierKey];
              const currentPrice = platformSettings.pricing.currentTierPrices[tierKey];
              const promoLabel = platformSettings.pricing.promotionalLabels[tierKey];
              return <div className="aqe-upgrade-option" key={value}>
              <div>
                <strong>{label}</strong>
                <span>{description}</span>
                <small>
                  <s>{platformSettings.walletCurrency} {Number(originalPrice).toLocaleString()}</s>{" "}
                  <b>{platformSettings.walletCurrency} {Number(currentPrice).toLocaleString()}</b>{" "}
                  {platformSettings.pricing.promotionalLabels && <em>{promoLabel}</em>}
                </small>
              </div>
              <button type="button" className={tone} onClick={() => {
                setRegistrationTier(value as "basic" | "premium" | "vip");
                setUpgradeOpen(false);
                if (authenticated) window.location.href = "/payments";
                else { setAuthMode("register"); setAuthOpen(true); }
              }}>{data.tier === value ? "Current" : "Select"}</button>
            </div>;
            })}
          </div>
        </div>
      ) : null}

      {authOpen ? (
        <div className="auth-overlay" role="dialog" aria-modal="true">
          <div className="auth-sheet aqe-auth-shell">
            <button
              type="button"
              className="close-button"
              aria-label="Close"
              onClick={() => setAuthOpen(false)}
              style={{ position: "absolute", top: 14, right: 14 }}
            >
              ×
            </button>
            <div className="aqe-auth-brand">
              <div className="aqe-auth-mark">AQE</div>
              <div className="aqe-auth-word">Afriqueerescorts</div>
              <div className="aqe-auth-kicker">PRIVATE DIRECTORY · VERIFIED PROFILES · AFRICA</div>
            </div>
            <div className="auth-tabs">
              <button
                type="button"
                className={authMode === "login" ? "active" : ""}
                onClick={() => setAuthMode("login")}
              >
                Sign In
              </button>
              <button
                type="button"
                className={authMode === "register" ? "active" : ""}
                onClick={() => setAuthMode("register")}
              >
                Create Account
              </button>
            </div>
            <h2 className="aqe-auth-title">{authMode === "login" ? "Welcome back" : "Create your AQE account"}</h2>
            <p className="aqe-auth-sub">
              {authMode === "login"
                ? "Sign in to manage your AQE account, profile and wallet. Public exploration is available without signing in."
                : "Build your AQE presence with a complete, polished member profile."}
            </p>
            <form onSubmit={submitAuth}>
              {authMode === "register" ? (
                <div className="registration-fields">
                  <input
                    className="auth-input"
                    value={displayName}
                    onChange={(event) => setDisplayName(event.target.value)}
                    placeholder="Full display name"
                    required
                  />
                  <div className="registration-grid">
                    <input
                      className="auth-input"
                      value={phone}
                      onChange={(event) => setPhone(event.target.value)}
                      placeholder="Phone number"
                      required
                    />
                    <input
                      className="auth-input"
                      type="number"
                      min="18"
                      value={age}
                      onChange={(event) => setAge(event.target.value)}
                      placeholder="Age 18+"
                      required
                    />
                  </div>
                  <div className="registration-grid">
                    <input
                      className="auth-input"
                      value={country}
                      onChange={(event) => setCountry(event.target.value)}
                      placeholder="Country"
                      required
                    />
                    <input
                      className="auth-input"
                      value={city}
                      onChange={(event) => setCity(event.target.value)}
                      placeholder="City / region"
                      required
                    />
                  </div>
                  <select
                    className="auth-input"
                    value={profileCategory}
                    onChange={(event) => setProfileCategory(event.target.value)}
                  >
                    <option value="client">Client account</option>
                    <option value="independent">Independent profile</option>
                  </select>
                  <div className="aqe-registration-section"><strong>Public profile basics</strong><span>Membership tier and profile category are independent choices.</span></div>
                  <input className="auth-input" value={headline} onChange={(event) => setHeadline(event.target.value)} placeholder="Profile headline" />
                  <input className="auth-input" value={languages} onChange={(event) => setLanguages(event.target.value)} placeholder="Languages (English, Luganda, Swahili...)" />
                  <div className="registration-grid"><select className="auth-input" value={gender} onChange={(event) => setGender(event.target.value)}><option value="">Gender / identity</option><option>Woman</option><option>Man</option><option>Non-binary</option><option>Trans</option><option>Couple</option></select><input className="auth-input" value={pronouns} onChange={(event) => setPronouns(event.target.value)} placeholder="Pronouns (optional)" /></div>
                  <div className="aqe-registration-section"><strong>Location &amp; availability</strong><span>Only broad location details are displayed publicly.</span></div>
                  <input className="auth-input" value={area} onChange={(event) => setArea(event.target.value)} placeholder="Area / neighbourhood (optional)" />
                  <div className="registration-grid"><select className="auth-input" value={availability} onChange={(event) => setAvailability(event.target.value)}><option value="available">Available</option><option value="busy">Busy</option><option value="offline">Offline</option><option value="hidden">Hidden from directory</option></select><select className="auth-input" value={visibility} onChange={(event) => setVisibility(event.target.value)}><option value="public">Public directory</option><option value="members">Members only</option><option value="hidden">Private / hidden</option></select></div>
                  <div className="registration-tier-block">
                    <div className="registration-field-label">
                      Membership tier
                    </div>
                    <div className="registration-tier-grid">
                      {[
                        [
                          "basic",
                          "Basic",
                          "Public exploration and account access",
                        ],
                        [
                          "premium",
                          "Premium",
                          "Independent profile and messaging",
                        ],
                        [
                          "vip",
                          "VIP",
                          "Full ecosystem, store, groups and rewards",
                        ],
                      ].map(([value, label, description]) => (
                        <button
                          type="button"
                          key={value}
                          className={
                            registrationTier === value
                              ? "registration-tier active"
                              : "registration-tier"
                          }
                          onClick={() =>
                            setRegistrationTier(
                              value as "basic" | "premium" | "vip",
                            )
                          }
                        >
                          <strong>{label}</strong>
                          <span>{description}</span>
                          {value !== "basic" ? (
                            <small>Payment required after registration</small>
                          ) : (
                            <small>Selected by default</small>
                          )}
                        </button>
                      ))}
                    </div>
                  </div>
                  <textarea
                    className="auth-input registration-bio"
                    value={bio}
                    onChange={(event) => setBio(event.target.value)}
                    placeholder="About you, your interests, or your professional presence"
                    rows={3}
                  />
                  <input className="auth-input" value={socialHandle} onChange={(event) => setSocialHandle(event.target.value)} placeholder="Website / social handle (optional)" />
                  <select
                    className="auth-input"
                    value={contactPreference}
                    onChange={(event) =>
                      setContactPreference(event.target.value)
                    }
                  >
                    <option value="in_app">AQE messages</option>
                    <option value="phone">Phone</option>
                    <option value="whatsapp">WhatsApp</option>
                    <option value="email">Email</option>
                  </select>
                  <input
                    className="auth-input"
                    value={referralCode}
                    onChange={(event) =>
                      setReferralCode(event.target.value.toUpperCase())
                    }
                    placeholder="Referral code (optional)"
                  />
                  <label className="registration-consent">
                    <input type="checkbox" required />
                    <span>
                      I confirm I am 18+ and agree to the AQE terms and privacy
                      policy.
                    </span>
                  </label>
                </div>
              ) : null}
              <label className="aqe-auth-label">Email or phone</label>
              <input
                className="auth-input"
                type="email"
                value={email}
                onChange={(event) => setEmail(event.target.value)}
                placeholder="Email"
              />
              <label className="aqe-auth-label">Password</label>
              <input
                className="auth-input"
                type="password"
                value={password}
                onChange={(event) => setPassword(event.target.value)}
                placeholder="Password"
              />
              {authMode === "login" ? <button className="aqe-forgot-password" type="button" onClick={() => setMessage("Password recovery must be completed through AQE support until email delivery is configured.")}>Forgot password?</button> : null}
              <button className="primary-button" type="submit">
                {authMode === "login" ? "Sign in" : "Create account"}
                <span>→</span>
              </button>
            </form>
            {message ? <span className="auth-message">{message}</span> : null}
          </div>
        </div>
      ) : null}
    </main>
  );
}
