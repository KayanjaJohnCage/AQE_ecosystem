import { NextResponse } from "next/server";
import { resolveMutationUserId } from "../../../../lib/aqe/auth";
import {
  createMarketplaceProduct,
  persistMarketplaceProduct,
} from "../../../../lib/aqe/marketplace";
import { createServerSupabaseClient } from "../../../../lib/supabaseServer";

export async function GET() {
  try {
    const client = createServerSupabaseClient();
    if (!client) {
      return NextResponse.json({ ok: true, source: "demo", products: [] });
    }

    const { data, error } = await client
      .from("marketplace_products")
      .select("id, seller_id, title, price, currency, inventory, status, created_at")
      .eq("status", "active")
      .gt("inventory", 0)
      .order("created_at", { ascending: false })
      .limit(50);

    if (error) {
      return NextResponse.json({ ok: false, reason: error.message }, { status: 500 });
    }

    return NextResponse.json({
      ok: true,
      source: "supabase",
      products: data ?? [],
    });
  } catch (error) {
    return NextResponse.json(
      { ok: false, reason: error instanceof Error ? error.message : "Marketplace unavailable." },
      { status: 500 },
    );
  }
}

export async function POST(request: Request) {
  try {
    const body = await request.json().catch(() => ({}));
    const identity = await resolveMutationUserId(
      request,
      typeof body.sellerId === "string" ? body.sellerId : undefined,
    );

    if (!identity.ok)
      return NextResponse.json(
        { ok: false, reason: identity.reason },
        { status: 401 },
      );

    const title = String(body.title ?? "").trim();
    const price = Number(body.price ?? 0);
    const currency = String(body.currency ?? "USD")
      .trim()
      .toUpperCase();
    const inventory = Number(body.inventory ?? 1);
    const status = body.status === "draft" ? "draft" : "active";

    if (
      !/^[A-Z]{3}$/.test(currency) ||
      !Number.isInteger(inventory) ||
      inventory < 0
    ) {
      return NextResponse.json(
        {
          ok: false,
          reason: "Valid currency and non-negative inventory are required.",
        },
        { status: 400 },
      );
    }

    const result = createMarketplaceProduct({
      sellerId: identity.userId,
      title,
      price,
      currency,
      inventory,
      status,
    });
    if (!result.ok || !result.product)
      return NextResponse.json(result, { status: 400 });

    const persisted = await persistMarketplaceProduct(result.product);
    return NextResponse.json(persisted, { status: persisted.ok ? 200 : 500 });
  } catch (error) {
    return NextResponse.json(
      {
        ok: false,
        reason:
          error instanceof Error ? error.message : "Product creation failed",
      },
      { status: 400 },
    );
  }
}
