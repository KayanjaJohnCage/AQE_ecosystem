import { NextResponse } from "next/server";
import { requireAuthenticatedRoleAccess } from "../../../../lib/aqe/auth";
import { createServerSupabaseClient } from "../../../../lib/supabaseServer";

export type ManagerPaymentNumber = {
  id: string;
  number: string;
  name: string;
  network: "Airtel" | "MTN";
  status: "available" | "busy";
};

const defaultNumbers: ManagerPaymentNumber[] = [
  { id: "0753477196", number: "0753477196", name: "NAKIYINGI CHRISTINE", network: "Airtel", status: "available" },
  { id: "0731559781", number: "0731559781", name: "ISMA KIMULI", network: "Airtel", status: "available" },
  { id: "0783026612", number: "0783026612", name: "NAKIYINGI CHRISTINE", network: "MTN", status: "available" },
  { id: "0779239507", number: "0779239507", name: "EDRINE KIBIRANGO", network: "MTN", status: "available" },
  { id: "0742633811", number: "0742633811", name: "KABONGE SHAFIC", network: "Airtel", status: "available" },
  { id: "0755723025", number: "0755723025", name: "KABONGE SHAFC", network: "Airtel", status: "available" },
  { id: "0740589621", number: "0740589621", name: "NAKIYINGI CHRISTINE", network: "Airtel", status: "available" },
];

function normalizeNumbers(value: unknown): ManagerPaymentNumber[] {
  if (!Array.isArray(value)) return defaultNumbers;
  return value
    .map((item, index) => {
      const x = item as Partial<ManagerPaymentNumber>;
      const network = String(x.network ?? "").toUpperCase() === "MTN" ? "MTN" : "Airtel";
      const status = String(x.status ?? "").toLowerCase() === "busy" ? "busy" : "available";
      const number = String(x.number ?? "").replace(/\s+/g, "").trim();
      const name = String(x.name ?? "").trim();
      if (!/^\d{9,15}$/.test(number) || !name) return null;
      return { id: String(x.id || number || index), number, name, network, status };
    })
    .filter(Boolean) as ManagerPaymentNumber[];
}

export async function GET() {
  try {
    const client = createServerSupabaseClient();
    if (!client) return NextResponse.json({ ok: true, source: "defaults", numbers: defaultNumbers });
    const { data, error } = await client.from("platform_settings").select("settings").eq("id", 1).maybeSingle();
    if (error || !data?.settings) return NextResponse.json({ ok: true, source: "defaults", numbers: defaultNumbers });
    const numbers = normalizeNumbers((data.settings as Record<string, unknown>).managerPaymentNumbers);
    return NextResponse.json({ ok: true, source: "supabase", numbers });
  } catch (error) {
    return NextResponse.json({ ok: false, reason: error instanceof Error ? error.message : "Manager payment numbers unavailable." }, { status: 500 });
  }
}

export async function PATCH(request: Request) {
  try {
    const access = await requireAuthenticatedRoleAccess(request, ["manager", "admin"]);
    if (!access.ok) return NextResponse.json({ ok: false, reason: access.reason }, { status: 403 });

    const body = await request.json().catch(() => ({}));
    const numbers = normalizeNumbers(body.numbers);
    if (!numbers.length) return NextResponse.json({ ok: false, reason: "At least one valid manager payment number is required." }, { status: 400 });

    const client = createServerSupabaseClient();
    if (!client) return NextResponse.json({ ok: true, saved: false, source: "defaults", numbers });

    const existing = await client.from("platform_settings").select("settings").eq("id", 1).maybeSingle();
    const settings = { ...((existing.data?.settings ?? {}) as Record<string, unknown>), managerPaymentNumbers: numbers };
    const { error } = await client.from("platform_settings").upsert({
      id: 1,
      settings,
      updated_by: access.session.userId,
      updated_at: new Date().toISOString(),
    }, { onConflict: "id" });

    if (error) return NextResponse.json({ ok: false, reason: error.message }, { status: 500 });
    return NextResponse.json({ ok: true, saved: true, source: "supabase", numbers });
  } catch (error) {
    return NextResponse.json({ ok: false, reason: error instanceof Error ? error.message : "Manager payment numbers update failed." }, { status: 400 });
  }
}
