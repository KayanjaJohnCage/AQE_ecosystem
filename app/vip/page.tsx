"use client";

import { FormEvent, useEffect, useMemo, useState } from "react";
import { readStoredSession } from "../../lib/clientSession";
import styles from "./page.module.css";

type Tier = "basic" | "premium" | "vip";
type PaymentMethod = "AIRTEL_MONEY" | "MOBILE_MONEY" | "CARD";

type WithdrawalRow = {
  id: string;
  tier: Tier;
  amount: number;
  currency: string;
  service_charge_amount: number;
  net_amount: number;
  status: string;
  statusLabel: string;
  created_at: string;
};

const tierLabels: Record<Tier, string> = {
  basic: "Basic",
  premium: "Premium",
  vip: "VIP",
};

const tierSchedules: Record<Tier, string> = {
  basic: "Weekends only",
  premium: "Once every 2 days",
  vip: "Once every 1 day",
};

const MIN_WITHDRAWAL = 30_000;
const MAX_WITHDRAWAL = 5_000_000;

const paymentMethods: Array<{
  value: PaymentMethod;
  label: string;
  description: string;
}> = [
  {
    value: "AIRTEL_MONEY",
    label: "Airtel",
    description: "Airtel Money",
  },
  {
    value: "MOBILE_MONEY",
    label: "MTN",
    description: "MTN Mobile Money",
  },
  {
    value: "CARD",
    label: "Card",
    description: "Payment card",
  },
];

export default function VipPage() {
  const [tier, setTier] = useState<Tier>("basic");
  const [balance, setBalance] = useState(0);
  const [recipientName, setRecipientName] = useState("");
  const [recipientAccount, setRecipientAccount] = useState("");
  const [paymentMethod, setPaymentMethod] =
    useState<PaymentMethod>("AIRTEL_MONEY");
  const [amount, setAmount] = useState("");
  const [serviceChargeRate] = useState(0.10);
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState("");
  const [success, setSuccess] = useState(false);
  const [requestId, setRequestId] = useState("");
  const [withdrawals, setWithdrawals] = useState<WithdrawalRow[]>([]);

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
        if (
          nextTier === "basic" ||
          nextTier === "premium" ||
          nextTier === "vip"
        ) {
          setTier(nextTier);
        }

        const nextBalance = Number(payload.customer?.walletBalance);
        if (Number.isFinite(nextBalance)) {
          setBalance(nextBalance);
        }
      })
      .catch(() => undefined);

    // Withdrawal service charge is fixed by the CEO policy at 10%.

    void loadWithdrawals(headers);
  }, []);

  async function loadWithdrawals(headers?: HeadersInit) {
    try {
      const requestHeaders: HeadersInit = headers ?? {};
      const response = await fetch("/api/vip/withdrawals", {
        headers: requestHeaders,
      });
      if (!response.ok) return;
      const payload = await response.json().catch(() => ({}));
      if (Array.isArray(payload.withdrawals)) {
        setWithdrawals(payload.withdrawals as WithdrawalRow[]);
      }
    } catch {
      // The withdrawal form remains usable if history cannot be loaded.
    }
  }

  const numericAmount = Number(amount || 0);
  const serviceCharge = useMemo(
    () =>
      Math.round(numericAmount * serviceChargeRate * 100) / 100,
    [numericAmount, serviceChargeRate],
  );
  const netAmount = Math.max(
    0,
    Math.round((numericAmount - serviceCharge) * 100) / 100,
  );

  const accountLabel =
    paymentMethod === "CARD" ? "Card number" : "Phone number";

  async function submitWithdrawal(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (!recipientName.trim() || !recipientAccount.trim() || numericAmount <= 0) {
      setSuccess(false);
      setMessage(
        "Enter the number, the name registered to that number, and a valid amount.",
      );
      return;
    }

    if (numericAmount < MIN_WITHDRAWAL) {
      setSuccess(false);
      setMessage("Minimum withdrawal amount is UGX 30,000.");
      return;
    }

    if (numericAmount > MAX_WITHDRAWAL) {
      setSuccess(false);
      setMessage("Maximum withdrawal amount is UGX 5,000,000.");
      return;
    }

    if (numericAmount > balance) {
      setSuccess(false);
      setMessage("The withdrawal amount cannot be greater than your available balance.");
      return;
    }

    setLoading(true);
    setMessage("");
    setSuccess(false);
    setRequestId("");

    try {
      const { session, user } = readStoredSession();
      const headers: HeadersInit = {
        "Content-Type": "application/json",
      };

      if (session.access_token) {
        headers.authorization = `Bearer ${session.access_token}`;
      }
      if (user.id) headers["x-user-id"] = user.id;

      const response = await fetch("/api/vip/withdrawals", {
        method: "POST",
        headers,
        body: JSON.stringify({
          amount: numericAmount,
          currency: "UGX",
          paymentMethod,
          recipientName: recipientName.trim(),
          recipientAccount: recipientAccount.trim(),
          tier,
        }),
      });

      const payload = await response.json().catch(() => ({}));

      if (!response.ok || !payload.ok) {
        setMessage(
          payload.reason ||
            payload.message ||
            "Withdrawal request could not be submitted.",
        );
        return;
      }

      setSuccess(true);
      setRequestId(String(payload.requestId || ""));
      setMessage(
        "Withdrawal request sent to the manager. Your request is now awaiting review.",
      );
      setAmount("");
      await loadWithdrawals(headers);
    } catch (error) {
      setMessage(
        error instanceof Error
          ? error.message
          : "Withdrawal request failed.",
      );
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
          <span aria-hidden="true">‹</span>
        </button>

        <div>
          <span className={styles.eyebrow}>AQE WALLET</span>
          <h1>Withdraw</h1>
        </div>

        <span className={styles.headerSpacer} />
      </header>

      <section className={styles.balanceCard}>
        <span>Available balance</span>
        <strong>UGX {balance.toLocaleString()}</strong>
        <small>
          {tierLabels[tier]} member · withdrawals: {tierSchedules[tier]}
        </small>
      </section>

      <form onSubmit={submitWithdrawal} className={styles.form}>
        <section className={styles.section}>
          <div className={styles.sectionHeading}>
            <div>
              <span className={styles.sectionEyebrow}>PAYMENT METHOD</span>
              <h2>Where should we send it?</h2>
            </div>
          </div>

          <div className={styles.paymentGrid}>
            {paymentMethods.map((method) => (
              <button
                type="button"
                key={method.value}
                className={
                  paymentMethod === method.value
                    ? styles.paymentOptionActive
                    : styles.paymentOption
                }
                onClick={() => setPaymentMethod(method.value)}
              >
                <span className={styles.paymentIcon}>
                  {method.value === "AIRTEL_MONEY"
                    ? "A"
                    : method.value === "MOBILE_MONEY"
                      ? "M"
                      : "C"}
                </span>
                <span>
                  <strong>{method.label}</strong>
                  <small>{method.description}</small>
                </span>
                <span className={styles.radio}>
                  {paymentMethod === method.value ? "✓" : ""}
                </span>
              </button>
            ))}
          </div>
        </section>

        <section className={styles.section}>
          <div className={styles.sectionHeading}>
            <div>
              <span className={styles.sectionEyebrow}>ACCOUNT DETAILS</span>
              <h2>Enter the registered details</h2>
            </div>
          </div>

          <label className={styles.formField}>
            <span>{accountLabel}</span>
            <input
              className="auth-input"
              value={recipientAccount}
              onChange={(event) =>
                setRecipientAccount(event.target.value)
              }
              placeholder={
                paymentMethod === "CARD"
                  ? "Enter card number"
                  : "Enter phone number"
              }
              inputMode={paymentMethod === "CARD" ? "numeric" : "tel"}
              autoComplete={
                paymentMethod === "CARD" ? "cc-number" : "tel"
              }
              required
            />
          </label>

          <label className={styles.formField}>
            <span>Name registered to this {paymentMethod === "CARD" ? "card" : "number"}</span>
            <input
              className="auth-input"
              value={recipientName}
              onChange={(event) => setRecipientName(event.target.value)}
              placeholder="Enter registered name"
              autoComplete="name"
              required
            />
          </label>

          <label className={styles.formField}>
            <span>Amount to withdraw</span>
            <div className={styles.amountWrap}>
              <input
                className="auth-input"
                value={amount}
                onChange={(event) =>
                  setAmount(
                    event.target.value.replace(/[^0-9.]/g, ""),
                  )
                }
                placeholder="0"
                inputMode="decimal"
                min={MIN_WITHDRAWAL}
                step="0.01"
                type="text"
                required
              />
              <strong>UGX</strong>
            </div>
          </label>
        </section>

        {numericAmount > 0 ? (
          <section className={styles.summary}>
            <div>
              <span>Withdrawal amount</span>
              <strong>UGX {numericAmount.toLocaleString()}</strong>
            </div>
            <div>
              <span>
                Service charge ({(serviceChargeRate * 100).toFixed(0)}%)
              </span>
              <strong>
                - UGX {serviceCharge.toLocaleString()}
              </strong>
            </div>
            <div className={styles.netRow}>
              <span>You receive</span>
              <strong>UGX {netAmount.toLocaleString()}</strong>
            </div>
          </section>
        ) : null}

        <section className={styles.note}>
          <strong>Withdrawal information</strong>
          <p>
            Every withdrawal is subject to an{" "}
            {(serviceChargeRate * 100).toFixed(0)}% service charge.
          </p>
          <p>
            {tier === "basic"
              ? "Basic withdrawals are available on weekends only."
              : tier === "premium"
                ? "Premium withdrawals are available once every 2 days."
                : "VIP withdrawals are available once every 1 day."}
          </p>
          <p>
            At least 1 day must pass between withdrawal applications. Minimum:
            UGX 30,000. Maximum: UGX 5,000,000.
          </p>
          <p>
            Processing can take up to 24 hours. When the status becomes SUCCEED,
            the approved net amount has already been sent to your registered account.
          </p>
          <p>
            The 10% service charge is credited to your direct Team Leader's
            balance when Management marks the withdrawal SUCCEED after the payout
            has been sent. If you are a Team Leader, the same rule applies to
            your own withdrawal.
          </p>
          <p>
            Make sure the number/card and registered name are correct before
            sending your request.
          </p>
        </section>

        {message ? (
          <div
            className={success ? styles.success : styles.error}
            role="status"
          >
            {message}
            {success && requestId ? (
              <small>Request ID: {requestId}</small>
            ) : null}
          </div>
        ) : null}

        <section className={styles.history}>
          <div className={styles.sectionHeading}>
            <div>
              <span className={styles.sectionEyebrow}>WITHDRAWAL STATUS</span>
              <h2>Your recent requests</h2>
            </div>
          </div>
          <div className={styles.historyList}>
            {withdrawals.length ? withdrawals.map((withdrawal) => (
              <article key={withdrawal.id} className={styles.historyItem}>
                <div>
                  <strong>{withdrawal.statusLabel}</strong>
                  <small>{new Date(withdrawal.created_at).toLocaleString()}</small>
                </div>
                <div className={styles.historyAmount}>
                  <strong>UGX {Number(withdrawal.amount).toLocaleString()}</strong>
                  <small>You receive UGX {Number(withdrawal.net_amount).toLocaleString()}</small>
                </div>
              </article>
            )) : (
              <p className={styles.historyEmpty}>No withdrawal requests yet.</p>
            )}
          </div>
          <p className={styles.historyHint}>
            AWAITING REVIEW means submitted. UNDER REVIEW means Management is processing it.
            SUCCEED means the approved net amount has already been sent to your registered account.
          </p>
        </section>

        <button
          className="primary-button"
          type="submit"
          disabled={loading || numericAmount <= 0}
        >
          {loading ? "Sending request..." : "Send Withdrawal Request"}
        </button>
      </form>
    </main>
  );
}
