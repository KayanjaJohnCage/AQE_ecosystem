"use client";

import { FormEvent, Suspense, useEffect, useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";
import { readStoredSession } from "../../lib/clientSession";

type PaymentMethod = "MukuruPay" | "AQE_MANAGER";
type PaymentMode = "upgrade" | "deposit" | "qc";

type Receiver = {
  receiverName: string;
  receiverPhone: string;
  receiverCard: string;
  instructions: string;
};

type Settings = {
  tierPrices: { basic: number; premium: number; vip: number };
  renewalPrices: { basic: number; premium: number; vip: number };
  walletCurrency: string;
  qcExchangeRate: number;
};

const defaultSettings: Settings = {
  tierPrices: { basic: 125000, premium: 250000, vip: 500000 },
  renewalPrices: { basic: 2500, premium: 5000, vip: 8500 },
  walletCurrency: "UGX",
  qcExchangeRate: 1000,
};

function preferredCurrency(fallback = "UGX") {
  if (typeof window === "undefined") return fallback;
  try {
    return localStorage.getItem("aqe_currency") || fallback;
  } catch {
    return fallback;
  }
}

function persistCurrency(value: string) {
  if (typeof window === "undefined") return;
  try {
    localStorage.setItem("aqe_currency", value);
    window.dispatchEvent(new StorageEvent("storage", { key: "aqe_currency", newValue: value }));
  } catch {
    // Ignore browser storage restrictions.
  }
}

const currencyRates: Record<string, number> = {
  UGX: 1, USD: 3715, EUR: 4050, GBP: 4720, KES: 28.5, TZS: 1.45, NGN: 2.4, USDT: 3715,
};

function convertFromUgx(amount: number, currency: string) {
  const rate = currencyRates[currency] || 1;
  return currency === "UGX" ? amount : amount / rate;
}

function currencySymbol(currency: string) {
  const symbols: Record<string, string> = { UGX: "UGX", USD: "$", EUR: "€", GBP: "£", KES: "KSh", TZS: "TSh", NGN: "₦", USDT: "USDT" };
  return symbols[currency] || currency;
}

const plans = [
  {
    id: "basic",
    name: "Basic",
    kicker: "Entry membership",
    badge: "ENTRY",
    media: "10 media uploads",
    copy:
      "Core member access; wallet, earnings, profile/media, deposit, withdraw, bill, invite, rewards, download, manager support, settings/info and recent activity.",
    locked: "No VIP-only features.",
    tone: "basic",
  },
  {
    id: "premium",
    name: "Premium",
    kicker: "Expanded membership",
    badge: "POPULAR",
    media: "20 media uploads",
    copy:
      "Everything in Basic plus stronger profile/media capacity, free DM access and chat, and Premium-level ecosystem access.",
    locked: "VIP-only features remain locked.",
    tone: "premium",
  },
  {
    id: "vip",
    name: "VIP",
    kicker: "Complete ecosystem",
    badge: "FULL ACCESS",
    media: "Unlimited media uploads",
    copy:
      "Everything in Premium plus the complete VIP ecosystem, VIP tasks, Asset Room and premium content access.",
    locked:
      "Raffle, campaigns, prizes, gifts, multiple withdrawals, groups & voice, media vault, store, Asset Room and monthly VIP content unlock subscription are VIP-only.",
    tone: "vip",
  },
] as const;

function money(amount: number, currency: string) {
  return `${currency} ${Number(amount || 0).toLocaleString()}`;
}

function PaymentsPageContent() {
  const searchParams = useSearchParams();

  const [authenticated, setAuthenticated] = useState(false);
  const [accountName, setAccountName] = useState("AQE Member");
  const [mode, setMode] = useState<PaymentMode>("upgrade");
  const [depositReference, setDepositReference] = useState<"wallet" | "upgrade">("wallet");
  const [walletBalance, setWalletBalance] = useState(0);
  const [walletPayLoading, setWalletPayLoading] = useState(false);
  const [requestedTier, setRequestedTier] = useState<
    "basic" | "premium" | "vip"
  >("premium");
  const [amount, setAmount] = useState("250000");
  const [qcAmount, setQcAmount] = useState("10000");
  const [qcPackageId, setQcPackageId] = useState("qc-10");
  const [currency, setCurrency] = useState("UGX");
  const [paymentMethod, setPaymentMethod] =
    useState<PaymentMethod>("MukuruPay");
  const [senderName, setSenderName] = useState("");
  const [senderPhone, setSenderPhone] = useState("");
  const [receiver, setReceiver] = useState<Receiver>({
    receiverName: "AQE Payments Receiver",
    receiverPhone: "Configure receiver phone",
    receiverCard: "Configure receiver card",
    instructions:
      "Use the receiver details below on the Mukuru Send Money page. Include your AQE payment reference.",
  });
  const [settings, setSettings] = useState<Settings>(defaultSettings);
  const [isLoading, setIsLoading] = useState(false);
  const [result, setResult] = useState<Record<string, unknown> | null>(null);
  const [error, setError] = useState("");
  const [copyMessage, setCopyMessage] = useState("");

  useEffect(() => {
    const stored = readStoredSession();
    setAuthenticated(Boolean(stored.session.access_token || stored.user.id));
    const name =
      stored.user.display_name ||
      stored.user.displayName ||
      stored.user.email?.split("@")[0];
    if (name) setAccountName(name);

    setCurrency(preferredCurrency("UGX"));

    const onCurrencyStorage = (event: StorageEvent) => {
      if (event.key === "aqe_currency" && event.newValue) setCurrency(event.newValue);
    };
    window.addEventListener("storage", onCurrencyStorage);

    const queryMode = searchParams.get("mode");
    if (
      queryMode === "upgrade" ||
      queryMode === "deposit" ||
      queryMode === "qc"
    ) {
      setMode(queryMode);
    }

    const queryTier = searchParams.get("tier");
    if (
      queryTier === "basic" ||
      queryTier === "premium" ||
      queryTier === "vip"
    ) {
      setRequestedTier(queryTier);
    }
  return () => window.removeEventListener("storage", onCurrencyStorage);
  }, [searchParams]);

  useEffect(() => {
    fetch("/api/settings")
      .then(async (response) => {
        if (!response.ok) return;
        const payload = await response.json();
        if (payload.settings) {
          const merged = {
            ...defaultSettings,
            ...payload.settings,
            tierPrices: {
              ...defaultSettings.tierPrices,
              ...(payload.settings.tierPrices || {}),
            },
            renewalPrices: {
              ...defaultSettings.renewalPrices,
              ...(payload.settings.renewalPrices || {}),
            },
          } as Settings;
          setSettings(merged);
          setCurrency(preferredCurrency(merged.walletCurrency || "UGX"));
        }
      })
      .catch(() => undefined);

    fetch("/api/payments/receiver")
      .then(async (response) => {
        if (!response.ok) return;
        const payload = await response.json();
        if (payload.receiver) setReceiver(payload.receiver);
      })
      .catch(() => undefined);
  }, []);

  useEffect(() => {
    persistCurrency(currency);
    if (mode === "upgrade") {
      setAmount(String(convertFromUgx(settings.tierPrices[requestedTier], currency)));
      setCurrency(preferredCurrency(settings.walletCurrency));
    }

    if (mode === "qc") {
      const numeric = Math.max(
        1,
        Math.round(Number(qcAmount || 0) / settings.qcExchangeRate),
      );
      setQcPackageId(`qc-${numeric}`);
      setAmount(String(convertFromUgx(Number(qcAmount), currency)));
      setCurrency(preferredCurrency(settings.walletCurrency));
    }
  }, [mode, requestedTier, qcAmount, settings, currency]);

  const selectedPlan = useMemo(
    () => plans.find((plan) => plan.id === requestedTier) || plans[1],
    [requestedTier],
  );

  const normalizedAmount = Number(amount);

  const copyReceiver = async (value: string, label: string) => {
    try {
      await navigator.clipboard.writeText(value);
      setCopyMessage(`${label} copied.`);
      window.setTimeout(() => setCopyMessage(""), 1800);
    } catch {
      setCopyMessage("Copy is not available in this browser.");
    }
  };

  useEffect(() => {
    if (!authenticated) return;
    const { session, user } = readStoredSession();
    const headers: HeadersInit = {};
    if (session.access_token) headers.authorization = `Bearer ${session.access_token}`;
    if (user.id) headers["x-user-id"] = user.id;
    fetch("/api/wallet", { headers }).then(async (response) => {
      if (!response.ok) return;
      const payload = await response.json();
      setWalletBalance(Number(payload.wallet?.available_balance ?? 0));
    }).catch(() => undefined);
  }, [authenticated]);

  const selectMode = (next: PaymentMode) => {
    setError("");
    setResult(null);
    setMode(next);
    if (next === "deposit") {
      setDepositReference("wallet");
      setAmount("");
      setCurrency(preferredCurrency(settings.walletCurrency));
    }
  };

  const submitPayment = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setError("");
    setResult(null);

    if (!authenticated) {
      setError("Sign in or create an AQE account before starting a payment.");
      return;
    }

    if (!Number.isFinite(normalizedAmount) || normalizedAmount <= 0) {
      setError("Enter a valid amount greater than zero.");
      return;
    }

    if (!/^[A-Z]{3}$/.test(currency)) {
      setError("Choose a valid three-letter currency.");
      return;
    }

    setIsLoading(true);

    try {
      const { session, user } = readStoredSession();
      const headers: HeadersInit = { "Content-Type": "application/json" };
      if (session.access_token) {
        headers.authorization = `Bearer ${session.access_token}`;
      }
      if (user.id) {
        headers["x-user-id"] = user.id;
      }

      const endpoint =
        paymentMethod === "AQE_MANAGER"
          ? "/api/payments/manager-direct"
          : "/api/payments/initialize";

      const body = {
        amount: normalizedAmount,
        currency,
        qcPackageId:
          mode === "deposit"
            ? "wallet_deposit"
            : mode === "qc"
              ? qcPackageId
              : `membership-${requestedTier}`,
        tier: mode === "upgrade" || (mode === "deposit" && depositReference === "upgrade") ? requestedTier : "basic",
        kind:
          mode === "upgrade"
            ? "membership_upgrade"
            : mode === "qc"
              ? "qc_recharge"
              : depositReference === "upgrade"
                ? "membership_upgrade"
                : "wallet_deposit",
        paymentKind:
          mode === "upgrade"
            ? "membership_upgrade"
            : mode === "qc"
              ? "qc_recharge"
              : depositReference === "upgrade"
                ? "membership_upgrade"
                : "wallet_deposit",
        qcAmount: mode === "qc" ? Number(qcAmount) : undefined,
        provider: paymentMethod,
        reference: `AQE-${Date.now()}`,
        ...(paymentMethod === "AQE_MANAGER"
          ? {
              senderDetails: {
                name: senderName.trim() || null,
                phone: senderPhone.trim() || null,
              },
            }
          : {}),
      };

      const response = await fetch(endpoint, {
        method: "POST",
        headers,
        body: JSON.stringify(body),
      });

      const payload = await response.json().catch(() => ({}));

      if (!response.ok || payload.ok === false) {
        setError(
          String(payload.reason || payload.message || "Payment request failed."),
        );
        return;
      }

      setResult(payload);
    } catch (requestError) {
      setError(
        requestError instanceof Error
          ? requestError.message
          : "Payment request failed.",
      );
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <main className="aqe-payment-page">
      <header className="aqe-payment-header">
        <button type="button" onClick={() => window.history.back()} className="aqe-payment-back" aria-label="Back to AQE">
          <i className="fas fa-arrow-left" />
        </button>
        <div>
          <div className="aqe-payment-mark">AQE</div>
          <div className="aqe-payment-word">Payment</div>
        </div>
        <div className="aqe-payment-account">
          <span>{accountName}</span>
          <small>{authenticated ? "Authenticated member" : "Guest"}</small>
        </div>
      </header>

      <section className="aqe-payment-hero">
        <div>
          <span className="aqe-payment-kicker">SECURE AQE CHECKOUT</span>
          <h1>Fund your AQE experience.</h1>
          <p>
            Membership, wallet deposits and QC recharge use the current
            server-side payment workflow. Funds and membership status change
            only after the configured confirmation process.
          </p>
        </div>
        <div className="aqe-payment-hero-icon">
          <i className="fas fa-shield-alt" />
        </div>
      </section>

      <div className="aqe-payment-mode-tabs" role="tablist" aria-label="Payment type">
        {[
          ["upgrade", "Membership", "fa-crown"],
          ["deposit", "Wallet Deposit", "fa-wallet"],
          ["qc", "Recharge QC", "fa-gem"],
        ].map(([value, label, icon]) => (
          <button
            type="button"
            key={value}
            className={mode === value ? "active" : ""}
            onClick={() => selectMode(value as PaymentMode)}
          >
            <i className={`fas ${icon}`} />
            <span>{label}</span>
          </button>
        ))}
      </div>

      {mode === "upgrade" ? (
        <section className="aqe-payment-section">
          <div className="aqe-payment-section-heading">
            <div>
              <span className="aqe-payment-kicker">AQE MEMBERSHIP</span>
              <h2>Choose your access level</h2>
              <p>
                Basic is a membership tier. Client and Independent Profile are
                separate account categories.
              </p>
            </div>
            <span className="aqe-payment-secure-pill">
              <i className="fas fa-lock" /> Server confirmed
            </span>
          </div>

          <div className="aqe-payment-plan-grid">
            {plans.map((plan) => {
              const isSelected = requestedTier === plan.id;
              const price =
                settings.tierPrices[
                  plan.id as "basic" | "premium" | "vip"
                ];

              return (
                <button
                  type="button"
                  className={`aqe-payment-plan-card ${plan.tone} ${
                    isSelected ? "selected" : ""
                  }`}
                  key={plan.id}
                  onClick={() =>
                    setRequestedTier(
                      plan.id as "basic" | "premium" | "vip",
                    )
                  }
                >
                  <span className="aqe-payment-plan-badge">{plan.badge}</span>
                  <div className="aqe-payment-plan-icon">
                    <i
                      className={`fas ${
                        plan.id === "basic"
                          ? "fa-user"
                          : plan.id === "premium"
                            ? "fa-star"
                            : "fa-crown"
                      }`}
                    />
                  </div>
                  <strong>{plan.name}</strong>
                  <small>{plan.kicker}</small>
                  <span className="aqe-payment-plan-price">
                    {money(price, currency)}
                  </span>
                  <em>{plan.media}</em>
                  <p>{plan.copy}</p>
                  <div className="aqe-payment-plan-limit">
                    <b>Limits</b>
                    <span>{plan.locked}</span>
                  </div>
                  <span className="aqe-payment-plan-select">
                    {isSelected ? "Selected" : `Select ${plan.name}`}
                  </span>
                </button>
              );
            })}
          </div>
        </section>
      ) : null}

      {mode === "qc" ? (
        <section className="aqe-payment-section">
          <div className="aqe-payment-section-heading">
            <div>
              <span className="aqe-payment-kicker">QC RECHARGE</span>
              <h2>Recharge your QC balance</h2>
              <p>QC is AQE usage credit, not cash. The configured exchange rate is applied to your selected package.</p>
            </div>
            <span className="aqe-payment-qc-pill">
              1 QC = {money(convertFromUgx(settings.qcExchangeRate, currency), currency)}
            </span>
          </div>
          <div className="aqe-payment-qc-grid">
            {[5, 10, 25, 50].map((qc) => {
              const price = qc * settings.qcExchangeRate;
              const active = Number(qcAmount) === price;
              return (
                <button
                  type="button"
                  key={qc}
                  className={`aqe-payment-qc-card ${active ? "active" : ""}`}
                  onClick={() => setQcAmount(String(price))}
                >
                  <i className="fas fa-gem" />
                  <strong>{qc} QC</strong>
                  <span>{money(convertFromUgx(price, currency), currency)}</span>
                </button>
              );
            })}
          </div>
        </section>
      ) : null}

      {mode === "deposit" ? (
        <section className="aqe-payment-section">
          <div className="aqe-payment-section-heading">
            <div>
              <span className="aqe-payment-kicker">PAYMENT DEPOSIT REFERENCE</span>
              <h2>What is this deposit for?</h2>
              <p>Select exactly where the confirmed money should go.</p>
            </div>
            <span className="aqe-payment-secure-pill"><i className="fas fa-shield-alt" /> Manager confirmed</span>
          </div>
          <div className="aqe-payment-method-grid">
            <button type="button" className={`aqe-payment-method ${depositReference === "wallet" ? "selected" : ""}`} onClick={() => { setDepositReference("wallet"); setAmount(""); }}>
              <div className="aqe-payment-method-icon manager"><i className="fas fa-wallet" /></div>
              <div><strong>Wallet</strong><span>Confirmed amount is credited to your cash wallet.</span></div>
              <i className="fas fa-check-circle" />
            </button>
            <button type="button" className={`aqe-payment-method ${depositReference === "upgrade" ? "selected" : ""}`} onClick={() => { setDepositReference("upgrade"); setAmount(String(convertFromUgx(settings.tierPrices[requestedTier], currency))); }}>
              <div className="aqe-payment-method-icon mukuru"><i className="fas fa-crown" /></div>
              <div><strong>Upgrade</strong><span>Confirmed amount activates the selected Basic, Premium or VIP tier.</span></div>
              <i className="fas fa-check-circle" />
            </button>
          </div>
          {depositReference === "upgrade" ? (
            <div className="aqe-payment-plan-grid">
              {plans.map((plan) => (
                <button type="button" key={plan.id} className={`aqe-payment-plan-card ${plan.tone} ${requestedTier === plan.id ? "selected" : ""}`} onClick={() => { setRequestedTier(plan.id); setAmount(String(convertFromUgx(settings.tierPrices[plan.id], currency))); }}>
                  <strong>{plan.name}</strong><small>{money(settings.tierPrices[plan.id], currency)}</small><span>{requestedTier === plan.id ? "Selected" : "Select"}</span>
                </button>
              ))}
            </div>
          ) : (
            <label className="aqe-payment-field">
              <span>Wallet deposit amount</span>
              <div className="aqe-payment-input-wrap">
                <b>{currencySymbol(currency)}</b>
                <input type="number" min="1000" value={amount} placeholder="10000" onChange={(event) => setAmount(event.target.value)} />
              </div>
            </label>
          )}
        </section>
      ) : null}

      <section className="aqe-payment-section">
        <div className="aqe-payment-section-heading compact">
          <div>
            <span className="aqe-payment-kicker">PAYMENT METHOD</span>
            <h2>How will you pay?</h2>
          </div>
        </div>

        <div className="aqe-payment-method-grid">
          <button
            type="button"
            className={`aqe-payment-method ${paymentMethod === "MukuruPay" ? "selected" : ""}`}
            onClick={() => setPaymentMethod("MukuruPay")}
          >
            <div className="aqe-payment-method-icon mukuru">
              <i className="fas fa-mobile-alt" />
            </div>
            <div>
              <strong>MukuruPay</strong>
              <span>Use the AQE reference on Mukuru Send Money.</span>
            </div>
            <i className="fas fa-check-circle" />
          </button>

          <button
            type="button"
            className={`aqe-payment-method ${paymentMethod === "AQE_MANAGER" ? "selected" : ""}`}
            onClick={() => setPaymentMethod("AQE_MANAGER")}
          >
            <div className="aqe-payment-method-icon manager">
              <i className="fas fa-user-shield" />
            </div>
            <div>
              <strong>AQE Manager Direct</strong>
              <span>Pay an authorized manager; approval remains pending until reviewed.</span>
            </div>
            <i className="fas fa-check-circle" />
          </button>
        </div>

        {paymentMethod === "MukuruPay" ? (
          <div className="aqe-payment-receiver">
            <div className="aqe-payment-receiver-head">
              <div>
                <span className="aqe-payment-kicker">MUKURU RECEIVER</span>
                <h3>Use these receiver details</h3>
              </div>
              <i className="fas fa-paper-plane" />
            </div>
            <p>{receiver.instructions}</p>
            {[
              ["Receiver name", receiver.receiverName],
              ["Receiver phone", receiver.receiverPhone],
              ["Receiver card / account", receiver.receiverCard],
            ].map(([label, value]) => (
              <div className="aqe-payment-copy-row" key={label}>
                <div>
                  <small>{label}</small>
                  <strong>{value}</strong>
                </div>
                <button
                  type="button"
                  onClick={() => copyReceiver(value, label)}
                >
                  <i className="fas fa-copy" /> Copy
                </button>
              </div>
            ))}
            {copyMessage ? (
              <div className="aqe-payment-copy-feedback">{copyMessage}</div>
            ) : null}
          </div>
        ) : (
          <div className="aqe-payment-manager-note">
            <div className="aqe-payment-manager-note-icon">
              <i className="fas fa-user-check" />
            </div>
            <div>
              <strong>AQE Manager Direct Deposit</strong>
              <p>
                Give the payment to an authorized AQE manager using the
                approved instructions. The request stays pending until a
                manager confirms receipt.
              </p>
            </div>
          </div>
        )}
      </section>

      {paymentMethod === "AQE_MANAGER" ? (
        <section className="aqe-payment-section">
          <div className="aqe-payment-section-heading compact">
            <div>
              <span className="aqe-payment-kicker">SENDER DETAILS</span>
              <h2>Who is sending the money?</h2>
            </div>
          </div>
          <div className="aqe-payment-fields-two">
            <label className="aqe-payment-field">
              <span>Sender registered name</span>
              <input
                value={senderName}
                onChange={(event) => setSenderName(event.target.value)}
                placeholder="Full name"
              />
            </label>
            <label className="aqe-payment-field">
              <span>Sending phone number</span>
              <input
                value={senderPhone}
                onChange={(event) => setSenderPhone(event.target.value)}
                placeholder="+256..."
                type="tel"
              />
            </label>
          </div>
        </section>
      ) : null}

      <section className="aqe-payment-checkout">
        <div className="aqe-payment-checkout-head">
          <div>
            <span className="aqe-payment-kicker">ORDER SUMMARY</span>
            <h2>
              {mode === "upgrade"
                ? `${selectedPlan.name} membership`
                : mode === "qc"
                  ? `${Math.round(normalizedAmount / settings.qcExchangeRate)} QC recharge`
                  : depositReference === "upgrade"
                    ? `${selectedPlan.name} membership upgrade`
                    : "AQE wallet deposit"}
            </h2>
          </div>
          <strong>{money(normalizedAmount, currency)}</strong>
        </div>

        <div className="aqe-payment-summary-row">
          <span>Payment method</span>
          <b>{paymentMethod === "MukuruPay" ? "MukuruPay" : "AQE Manager Direct"}</b>
        </div>
        <div className="aqe-payment-summary-row">
          <span>Currency</span>
          <b>{currency}</b>
        </div>
        <div className="aqe-payment-summary-row">
          <span>Deposit reference</span>
          <b>{mode === "deposit" ? (depositReference === "wallet" ? "WALLET" : `UPGRADE • ${requestedTier.toUpperCase()}`) : mode === "upgrade" ? "UPGRADE" : "QC RECHARGE"}</b>
        </div>
                <div className="aqe-payment-summary-row">
          <span>Reference</span>
          <b>Generated securely after order creation</b>
        </div>

        {!authenticated ? (
          <div className="aqe-payment-auth-warning">
            <i className="fas fa-lock" />
            <div>
              <strong>Sign in required</strong>
              <span>
                You can view the payment options now. Sign in before creating
                a live payment order.
              </span>
            </div>
            <button type="button" onClick={() => window.history.back()} className="text-button">Return to AQE</button>
          </div>
        ) : null}

        {error ? (
          <div className="aqe-payment-error">
            <i className="fas fa-exclamation-circle" />
            <span>{error}</span>
          </div>
        ) : null}

        {(mode === "upgrade" || mode === "qc") && authenticated ? (
          <button type="button" className="aqe-payment-submit" disabled={walletPayLoading || walletBalance < normalizedAmount} onClick={async () => {
            setWalletPayLoading(true); setError(""); setResult(null);
            try {
              const { session, user } = readStoredSession();
              const headers: HeadersInit = { "Content-Type": "application/json" };
              if (session.access_token) headers.authorization = `Bearer ${session.access_token}`;
              if (user.id) headers["x-user-id"] = user.id;
              const response = await fetch("/api/wallet/pay", { method: "POST", headers, body: JSON.stringify({
                paymentKind: mode === "upgrade" ? "membership_upgrade" : "qc_recharge",
                tier: requestedTier, qcAmount: mode === "qc" ? Number(qcAmount) : undefined,
              }) });
              const payload = await response.json().catch(() => ({}));
              if (!response.ok || !payload.ok) setError(String(payload.reason || "Wallet payment failed."));
              else { setResult(payload); setWalletBalance((value) => Math.max(0, value - normalizedAmount)); }
            } catch (error) { setError(error instanceof Error ? error.message : "Wallet payment failed."); }
            finally { setWalletPayLoading(false); }
          }}>
            <i className={`fas ${walletPayLoading ? "fa-spinner fa-spin" : "fa-wallet"}`} />
            {walletPayLoading ? "Paying from wallet..." : `Pay from wallet • ${money(normalizedAmount, currency)}`}
          </button>
        ) : null}

        <button
          type="button"
          className="aqe-payment-submit"
          disabled={isLoading || !authenticated}
          onClick={() => {
            const form = document.getElementById(
              "aqe-payment-form",
            ) as HTMLFormElement | null;
            form?.requestSubmit();
          }}
        >
          <i className={`fas ${isLoading ? "fa-spinner fa-spin" : "fa-lock"}`} />
          {isLoading
            ? "Creating secure payment order..."
            : paymentMethod === "MukuruPay"
              ? mode === "upgrade"
                ? `Continue with ${selectedPlan.name}`
                : "Create MukuruPay Order"
              : "Create Manager Direct Request"}
        </button>

        <form id="aqe-payment-form" onSubmit={submitPayment} hidden>
          <button type="submit" />
        </form>

        <p className="aqe-payment-footnote">
          Payment status on this page is based on the server response. Do not
          treat a client-side success display as proof that funds have been
          received or that a membership has activated.
        </p>
      </section>

      {result ? (
        <section className="aqe-payment-result">
          <div className="aqe-payment-result-top">
            <div className="aqe-payment-result-icon">
              <i
                className={`fas ${
                  String(result.status || "").toLowerCase() === "pending"
                    ? "fa-clock"
                    : "fa-receipt"
                }`}
              />
            </div>
            <div>
              <span className="aqe-payment-kicker">PAYMENT ORDER</span>
              <h2>
                {String(result.status || "initiated").toUpperCase()}
              </h2>
              <p>
                {String(
                  result.message ||
                    result.paymentInstruction ||
                    "Payment order created. Complete the next payment step.",
                )}
              </p>
            </div>
          </div>

          <div className="aqe-payment-result-grid">
            <div>
              <small>Reference</small>
              <strong>
                {String(
                  result.reference ||
                    (result.order as { reference?: string } | undefined)?.reference ||
                    "—",
                )}
              </strong>
            </div>
            <div>
              <small>Amount</small>
              <strong>
                {money(
                  Number(
                    result.amount ||
                      (result.order as { amount?: number } | undefined)?.amount ||
                      normalizedAmount,
                  ),
                  String(
                    result.currency ||
                      (result.order as { currency?: string } | undefined)?.currency ||
                      currency,
                  ),
                )}
              </strong>
            </div>
            <div>
              <small>Provider</small>
              <strong>
                {String(
                  result.provider ||
                    (result.order as { provider?: string } | undefined)?.provider ||
                    paymentMethod,
                )}
              </strong>
            </div>
            <div>
              <small>Mode</small>
              <strong>{String(result.mode || result.source || "server")}</strong>
            </div>
          </div>

          <div className="aqe-payment-result-note">
            <i className="fas fa-info-circle" />
            <span>
              {paymentMethod === "AQE_MANAGER"
                ? "Your manager payment request remains pending until an authorized AQE manager confirms the transfer."
                : "Complete the Mukuru transfer using the AQE reference, then wait for provider/manager confirmation."}
            </span>
          </div>

          {paymentMethod === "MukuruPay" &&
          typeof result.redirectUrl === "string" ? (
            <a
              className="aqe-payment-provider-link"
              href={result.redirectUrl}
              target="_blank"
              rel="noreferrer"
            >
              <i className="fas fa-external-link-alt" /> Open Mukuru Send Money
            </a>
          ) : null}
        </section>
      ) : null}
    </main>
  );
}

export default function PaymentsPage() {
  return (
    <Suspense fallback={<main className="aqe-payment-page"><section className="aqe-payment-section"><div className="aqe-payment-loading">Loading AQE payment page…</div></section></main>}>
      <PaymentsPageContent />
    </Suspense>
  );
}
