"use client";

import { FormEvent, useEffect, useMemo, useState } from "react";
import { readStoredSession } from "../../lib/clientSession";
import styles from "./page.module.css";

type Tier = "basic" | "premium" | "vip";
type PaymentMethod = "AIRTEL_MONEY" | "MOBILE_MONEY" | "CARD";
type Currency = "UGX" | "USDT";

const tierLabels: Record<Tier, string> = {
  basic: "Basic",
  premium: "Premium",
  vip: "VIP",
};

const tierSchedules: Record<Tier, string> = {
  basic: "Saturday & Sunday",
  premium: "Saturday & Sunday",
  vip: "3 days a week",
};

const paymentMethods: Array<{
  value: PaymentMethod;
  label: string;
  description: string;
}> = [
  { value: "AIRTEL_MONEY", label: "AIRTEL", description: "Airtel Money" },
  { value: "MOBILE_MONEY", label: "MOMO", description: "Mobile Money" },
  { value: "CARD", label: "CARD", description: "Bank / payment card" },
];

export default function VipPage() {
  const [tier, setTier] = useState<Tier>("basic");
  const [balance, setBalance] = useState(0);
  const [currency, setCurrency] = useState<Currency>("UGX");
  const [recipientName, setRecipientName] = useState("");
  const [recipientAccount, setRecipientAccount] = useState("");
  const [paymentMethod, setPaymentMethod] =
    useState<PaymentMethod>("AIRTEL_MONEY");
  const [amount, setAmount] = useState("");
  const [serviceChargeRate, setServiceChargeRate] = useState(0.1);
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState("");
  const [success, setSuccess] = useState(false);
  const [request, setRequest] = useState<Record<string, unknown> | null>(null);

  useEffect(() => {
    const { session, user } = readStoredSession();
    const headers: HeadersInit = {};
    if (session.access_token) {
      headers.authorization = `Bearer ${session.access_token}`;
    }
    if (user.id) headers["x-user-id"] = user.id;

    fetch("/api/dashboard", { headers })
      .then(async (response) => {
        if (!response.ok) return;
        const payload = await response.json();
        const nextTier = payload.customer?.tier;
        if (nextTier === "basic" || nextTier === "premium" || nextTier === "vip") {
          setTier(nextTier);
        }
        if (Number.isFinite(Number(payload.customer?.walletBalance))) {
          setBalance(Number(payload.customer.walletBalance));
        }
      })
      .catch(() => undefined);

    fetch("/api/settings")
      .then(async (response) => {
        if (!response.ok) return;
        const payload = await response.json();
        const settings = payload.settings;
        const rate = Number(settings?.withdrawal?.serviceChargeRate ?? 0.1);
        if (Number.isFinite(rate) && rate >= 0 && rate <= 1) {
          setServiceChargeRate(rate);
        }
        if (settings?.walletCurrency === "UGX" || settings?.walletCurrency === "USDT") {
          setCurrency(settings.walletCurrency);
        }
      })
      .catch(() => undefined);
  }, []);

  const numericAmount = Number(amount || 0);
  const serviceCharge = useMemo(
    () => Math.round(numericAmount * serviceChargeRate * 100) / 100,
    [numericAmount, serviceChargeRate],
  );
  const netAmount = Math.max(0, Math.round((numericAmount - serviceCharge) * 100) / 100);

  const accountLabel =
    paymentMethod === "CARD" ? "Card number" : "Phone number";
  const accountPlaceholder =
    paymentMethod === "CARD" ? "Enter card number" : "Enter phone number";

  async function submitWithdrawal(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setLoading(true);
    setMessage("");
    setSuccess(false);
    setRequest(null);

    try {
      const { session, user } = readStoredSession();
      const headers: HeadersInit = { "Content-Type": "application/json" };
      if (session.access_token) {
        headers.authorization = `Bearer ${session.access_token}`;
      }
      if (user.id) headers["x-user-id"] = user.id;

      const response = await fetch("/api/vip/withdrawals", {
        method: "POST",
        headers,
        body: JSON.stringify({
          amount: numericAmount,
          currency,
          paymentMethod,
          recipientName,
          recipientAccount,
          tier,
        }),
      });
      const payload = await response.json().catch(() => ({}));

      if (!response.ok || !payload.ok) {
        setMessage(payload.reason || payload.message || "Withdrawal request could not be submitted.");
        return;
      }

      setSuccess(true);
      setRequest(payload);
      setMessage("Withdrawal request submitted to the manager for review.");
      setAmount("");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Withdrawal request failed.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <main className={styles.page}>
      <header className={styles.header}>
        <button
          type="button"
          className={styles.back}
          onClick={() => window.history.back()}
          aria-label="Go back"
        >
          ‹
        </button>
        <h1>Withdraw</h1>
        <span className={styles.headerSpacer} />
      </header>

      <section className={styles.currencyTabs} aria-label="Withdrawal currency">
        {(["UGX", "USDT"] as Currency[]).map((item) => (
          <button
            type="button"
            key={item}
            className={currency === item ? styles.currencyActive : ""}
            onClick={() => setCurrency(item)}
          >
            {item}
          </button>
        ))}
      </section>

      <section className={styles.balanceRow}>
        <strong>Balance:</strong>
        <span>
          {currency} {balance.toLocaleString()}
        </span>
      </section>

      <section className={styles.scheduleCard}>
        <div>
          <small>WITHDRAWAL SCHEDULE</small>
          <strong>
            {tierLabels[tier]} · {tierSchedules[tier]}
          </strong>
        </div>
        <span className={styles.scheduleBadge}>
          {tier === "vip" ? "3 DAYS / WEEK" : "WEEKENDS"}
        </span>
      </section>

      <form onSubmit={submitWithdrawal} className={styles.form}>
        <label className={styles.field}>
          <span>Receiver name</span>
          <input
            value={recipientName}
            onChange={(event) => setRecipientName(event.target.value)}
            placeholder="Enter receiver name"
            autoComplete="name"
            required
          />
        </label>

        <label className={styles.field}>
          <span>{accountLabel}</span>
          <input
            value={recipientAccount}
            onChange={(event) => setRecipientAccount(event.target.value)}
            placeholder={accountPlaceholder}
            inputMode={paymentMethod === "CARD" ? "numeric" : "tel"}
            autoComplete={paymentMethod === "CARD" ? "cc-number" : "tel"}
            required
          />
        </label>

        <div className={styles.field}>
          <span>Payment method</span>
          <div className={styles.methodGrid}>
            {paymentMethods.map((method) => (
              <button
                type="button"
                key={method.value}
                className={
                  paymentMethod === method.value ? styles.methodActive : styles.method
                }
                onClick={() => setPaymentMethod(method.value)}
              >
                <strong>{method.label}</strong>
                <small>{method.description}</small>
                <i>›</i>
              </button>
            ))}
          </div>
        </div>

        <label className={styles.amountField}>
          <span>Amount to withdraw</span>
          <div>
            <input
              value={amount}
              onChange={(event) => setAmount(event.target.value.replace(/[^0-9.]/g, ""))}
              placeholder="0"
              inputMode="decimal"
              min="0.01"
              step="0.01"
              type="text"
              required
            />
            <strong>
              {currency} {numericAmount > 0 ? netAmount.toLocaleString() : "0.00"}
            </strong>
          </div>
        </label>

        <section className={styles.note}>
          <strong>Note:</strong>
          <p>
            Every withdrawal is subject to a {(serviceChargeRate * 100).toFixed(0)}% service charge.
          </p>
          <p>
            {tier === "vip"
              ? "VIP withdrawals are available on three configured days each week, and VIP earnings cannot be withdrawn before the 20th of the month."
              : "Basic and Premium withdrawals are available on weekends only."}
          </p>
          <p>Your request is submitted to the manager for processing.</p>
        </section>

        {numericAmount > 0 ? (
          <section className={styles.summary}>
            <div>
              <span>Withdrawal amount</span>
              <strong>{currency} {numericAmount.toLocaleString()}</strong>
            </div>
            <div>
              <span>Service charge ({(serviceChargeRate * 100).toFixed(0)}%)</span>
              <strong>- {currency} {serviceCharge.toLocaleString()}</strong>
            </div>
            <div className={styles.netRow}>
              <span>You receive</span>
              <strong>{currency} {netAmount.toLocaleString()}</strong>
            </div>
          </section>
        ) : null}

        {message ? (
          <div className={success ? styles.success : styles.error} role="status">
            {message}
          </div>
        ) : null}

        {request ? (
          <div className={styles.receipt}>
            <span>Request submitted</span>
            <strong>{String(request.requestId || "")}</strong>
            <small>
              Net payout: {String(request.currency || currency)}{" "}
              {Number(request.netAmount || 0).toLocaleString()}
            </small>
          </div>
        ) : null}

        <button
          className={styles.confirm}
          type="submit"
          disabled={loading || numericAmount <= 0}
        >
          {loading ? "Submitting..." : "Confirm"}
        </button>
      </form>
    </main>
  );
}
