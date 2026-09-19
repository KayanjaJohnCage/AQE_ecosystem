"use client";

import { useEffect, useState } from "react";
import { readStoredSession } from "../../lib/clientSession";

export default function PaymentsPage() {
  const [isLoading, setIsLoading] = useState(false);
  const [result, setResult] = useState<Record<string, unknown> | null>(null);
  const [amount, setAmount] = useState("100");
  const [currency, setCurrency] = useState("UGX");
  const [qcPackageId, setQcPackageId] = useState("qc-100");
  const [requestedTier, setRequestedTier] = useState<"premium" | "vip">(
    "premium",
  );
  const [paymentMethod, setPaymentMethod] = useState<
    "MukuruPay" | "AQE_MANAGER"
  >("MukuruPay");
  const [receiver, setReceiver] = useState({
    receiverName: "Loading receiver details...",
    receiverPhone: "Loading...",
    receiverCard: "Loading...",
    instructions:
      "Use the receiver details below on the Mukuru Send Money page.",
  });
  const [copyMessage, setCopyMessage] = useState("");
  const [settings, setSettings] = useState({
    tierPrices: { basic: 125000, premium: 250000, vip: 500000 },
    renewalPrices: { basic: 2500, premium: 5000, vip: 8500 },
    walletCurrency: "UGX",
    qcExchangeRate: 1000,
    referralRates: { direct: 0.1, indirect: 0.05 },
    about: "",
    contact: "",
  });

  useEffect(() => {
    fetch("/api/settings")
      .then(async (response) => {
        if (!response.ok) return;
        const payload = await response.json();
        if (payload.settings) {
          setSettings(payload.settings);
          setCurrency(payload.settings.walletCurrency || "UGX");
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

  const copyReceiver = async (value: string, label: string) => {
    await navigator.clipboard.writeText(value);
    setCopyMessage(`${label} copied.`);
    window.setTimeout(() => setCopyMessage(""), 1800);
  };

  const handleGatewayTest = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setIsLoading(true);
    try {
      const { session, user } = readStoredSession();
      const headers: HeadersInit = { "Content-Type": "application/json" };
      if (session.access_token)
        headers.authorization = `Bearer ${session.access_token}`;
      if (user.id) headers["x-user-id"] = user.id;
      const response = await fetch(
        paymentMethod === "AQE_MANAGER"
          ? "/api/payments/manager-direct"
          : "/api/payments/initialize",
        {
          method: "POST",
          headers,
          body: JSON.stringify({
            amount: Number(amount),
            currency,
            qcPackageId,
            tier: requestedTier,
            provider: paymentMethod,
            reference: `AQE-${Date.now()}`,
          }),
        },
      );

      const data = await response.json();
      setResult(data);
    } catch (error) {
      setResult({
        status: "error",
        message: error instanceof Error ? error.message : "Unknown error",
      });
    } finally {
      setIsLoading(false);
    }
  };

  const tierPrice =
    requestedTier === "vip"
      ? settings.tierPrices.vip
      : settings.tierPrices.premium;

  return (
    <main style={{ padding: 24, maxWidth: 980, margin: "0 auto" }}>
      <h1>Recharge QC</h1>
      <p>Create a server-side payment order for your QC balance.</p>

      <section
        style={{
          background: "#101827",
          borderRadius: 12,
          padding: 20,
          marginTop: 20,
        }}
      >
        <h2>Choose a package</h2>
        <form
          onSubmit={handleGatewayTest}
          style={{ display: "grid", gap: 10, maxWidth: 420 }}
        >
          <label>
            Amount
            <input
              value={amount}
              onChange={(event) => setAmount(event.target.value)}
              type="number"
              min="1"
              required
            />
            <small>Configured {requestedTier} price: {settings.walletCurrency} {tierPrice.toLocaleString()}</small>
          </label>
          <label>
            Currency
            <select
              value={currency}
              onChange={(event) => setCurrency(event.target.value)}
            >
              <option>UGX</option>
              <option>USD</option>
              <option>NGN</option>
            </select>
          </label>
          <label>
            Package ID
            <input
              value={qcPackageId}
              onChange={(event) => setQcPackageId(event.target.value)}
              required
            />
          </label>
          <label>
            Upgrade plan
            <select
              value={requestedTier}
              onChange={(event) =>
                setRequestedTier(event.target.value as "premium" | "vip")
              }
            >
              <option value="premium">Premium</option>
              <option value="vip">VIP</option>
            </select>
          </label>
          <div style={{ display: "grid", gap: 4, padding: 10, border: "1px solid #29364d", borderRadius: 10 }}>
            <strong>Tier pricing</strong>
            <span>Basic: {settings.walletCurrency} {settings.tierPrices.basic.toLocaleString()}</span>
            <span>Premium: {settings.walletCurrency} {settings.tierPrices.premium.toLocaleString()}</span>
            <span>VIP: {settings.walletCurrency} {settings.tierPrices.vip.toLocaleString()}</span>
          </div>
          <label>
            Payment method
            <select
              value={paymentMethod}
              onChange={(event) =>
                setPaymentMethod(
                  event.target.value as "MukuruPay" | "AQE_MANAGER",
                )
              }
            >
              <option value="MukuruPay">Mukuru Pay</option>
              <option value="AQE_MANAGER">AQE Manager Direct</option>
            </select>
          </label>
          <button type="submit" disabled={isLoading}>
            {isLoading ? "Creating order..." : "Continue to payment"}
          </button>
        </form>
      </section>

      {paymentMethod === "MukuruPay" ? (
        <section
          style={{
            background: "#101827",
            borderRadius: 12,
            padding: 20,
            marginTop: 20,
          }}
        >
          <h2>Mukuru receiver</h2>
          <p>{receiver.instructions}</p>
          <div style={{ display: "grid", gap: 10, maxWidth: 520 }}>
            {[
              ["Receiver name", receiver.receiverName],
              ["Receiver phone", receiver.receiverPhone],
              ["Receiver card / account", receiver.receiverCard],
            ].map(([label, value]) => (
              <div
                key={label}
                style={{
                  display: "flex",
                  justifyContent: "space-between",
                  gap: 12,
                  alignItems: "center",
                  padding: 12,
                  border: "1px solid #29364d",
                  borderRadius: 10,
                }}
              >
                <div>
                  <small>{label}</small>
                  <strong style={{ display: "block", marginTop: 4 }}>
                    {value}
                  </strong>
                </div>
                <button
                  type="button"
                  onClick={() => copyReceiver(value, label)}
                >
                  Copy
                </button>
              </div>
            ))}
          </div>
          {copyMessage ? <p>{copyMessage}</p> : null}
        </section>
      ) : null}

      {result ? (
        <section
          style={{
            background: "#101827",
            borderRadius: 12,
            padding: 20,
            marginTop: 20,
          }}
        >
          <h2>Payment order</h2>
          <pre style={{ whiteSpace: "pre-wrap", overflowX: "auto" }}>
            {JSON.stringify(result, null, 2)}
          </pre>
          {paymentMethod === "MukuruPay" &&
          typeof result.redirectUrl === "string" ? (
            <a href={result.redirectUrl} target="_blank" rel="noreferrer">
              Open Mukuru Send Money
            </a>
          ) : null}
          {paymentMethod === "AQE_MANAGER" ? (
            <p>
              Send the money using the manager instructions, then keep this
              request pending until a manager confirms receipt.
            </p>
          ) : null}
        </section>
      ) : null}
    </main>
  );
}
