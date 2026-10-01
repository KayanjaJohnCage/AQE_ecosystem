"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";

type ConfirmationState = "verifying" | "success" | "error";

export default function AuthConfirmedPage() {
  const router = useRouter();
  const [state, setState] = useState<ConfirmationState>("verifying");
  const [message, setMessage] = useState("Verifying your email and securing your session…");

  useEffect(() => {
    let cancelled = false;

    async function confirmSession() {
      const hash = window.location.hash.replace(/^#/, "");
      const params = new URLSearchParams(hash);
      const accessToken = params.get("access_token");
      const error = params.get("error");
      const errorDescription = params.get("error_description");

      // Remove bearer tokens/errors from the visible URL immediately.
      window.history.replaceState(
        null,
        document.title,
        window.location.pathname + window.location.search,
      );

      if (error) {
        if (!cancelled) {
          setState("error");
          setMessage(errorDescription || "The email verification link could not be completed.");
        }
        return;
      }

      if (!accessToken) {
        if (!cancelled) {
          setState("error");
          setMessage("No verification session was found. Please use the latest verification email or sign in normally.");
        }
        return;
      }

      try {
        const response = await fetch("/api/auth/confirm-session", {
          method: "POST",
          headers: { "content-type": "application/json" },
          credentials: "include",
          body: JSON.stringify({ accessToken }),
          cache: "no-store",
        });

        const result = await response.json().catch(() => ({}));

        if (!response.ok || !result.ok) {
          throw new Error(result.reason || "Unable to establish your authenticated session.");
        }

        if (cancelled) return;

        setState("success");
        setMessage("Your email has been verified and your account is ready.");
        window.setTimeout(() => router.replace("/customer"), 700);
      } catch (error) {
        if (!cancelled) {
          setState("error");
          setMessage(
            error instanceof Error
              ? error.message
              : "Email verification could not be completed.",
          );
        }
      }
    }

    void confirmSession();

    return () => {
      cancelled = true;
    };
  }, [router]);

  return (
    <main
      style={{
        minHeight: "100vh",
        display: "grid",
        placeItems: "center",
        padding: 24,
        background: "#08080d",
        color: "#fff",
      }}
    >
      <section
        style={{
          width: "min(520px,100%)",
          padding: 28,
          borderRadius: 22,
          border: "1px solid rgba(212,175,55,.25)",
          background: "linear-gradient(145deg,rgba(139,92,246,.12),rgba(212,175,55,.06))",
          textAlign: "center",
        }}
      >
        <div
          style={{
            fontSize: 12,
            letterSpacing: 2,
            textTransform: "uppercase",
            color: "#d4af37",
            fontWeight: 800,
          }}
        >
          AfriQueer Escorts Ecosystem
        </div>

        <h1 style={{ fontSize: 28, margin: "12px 0 8px" }}>
          {state === "success" ? "Email verified" : state === "error" ? "Verification issue" : "Verify your email"}
        </h1>

        <p style={{ color: "#b9b9c7", lineHeight: 1.6 }}>{message}</p>

        {state === "success" && (
          <p style={{ color: "#b9b9c7", fontSize: 13 }}>
            Opening your customer website…
          </p>
        )}

        {state === "error" && (
          <button
            onClick={() => router.replace("/customer/profile")}
            style={{
              marginTop: 18,
              border: 0,
              borderRadius: 12,
              padding: "12px 20px",
              fontWeight: 800,
              cursor: "pointer",
            }}
          >
            Return to customer sign in
          </button>
        )}
      </section>
    </main>
  );
}
