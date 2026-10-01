import { NextResponse } from "next/server";
import { requireAuthenticatedRoleAccess, resolveMutationUserId } from "../../../../lib/aqe/auth";
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
      .select(
        "id, seller_id, title, price, currency, inventory, status, created_at",
      )
      .eq("status", "active")
      .gt("inventory", 0)
      .order("created_at", { ascending: false })
      .limit(50);

    if (error) {
      return NextResponse.json(
        { ok: false, reason: error.message },
        { status: 500 },
      );
    }

    return NextResponse.json({
      ok: true,
      source: "supabase",
      products: data ?? [],
    });
  } catch (error) {
    return NextResponse.json(
      {
        ok: false,
        reason:
          error instanceof Error ? error.message : "Marketplace unavailable.",
      },
      { status: 500 },
    );
  }
}

export async function POST(request: Request) {
  try {
    const contentType = request.headers.get("content-type") || "";
    let body: Record<string, any> = {};
    let uploadedFile: File | null = null;

    if (contentType.includes("multipart/form-data")) {
      const form = await request.formData();
      uploadedFile = form.get("image") instanceof File ? form.get("image") as File : null;
      form.forEach((value, key) => {
        if (value instanceof File) return;
        body[key] = value;
      });
    } else {
      body = await request.json().catch(() => ({}));
    }

    const identity = await resolveMutationUserId(
      request,
      typeof body.sellerId === "string" ? body.sellerId : undefined,
    );
    if (!identity.ok) return NextResponse.json({ ok: false, reason: identity.reason }, { status: 401 });

    const client = createServerSupabaseClient();
    if (!client) return NextResponse.json({ ok: false, reason: "Marketplace service is not configured." }, { status: 503 });

    const profile = await client.from("profiles").select("tier,verification_status").eq("user_id", identity.userId).maybeSingle();
    if (profile.error) return NextResponse.json({ ok: false, reason: profile.error.message }, { status: 500 });
    if (String(profile.data?.tier || "").toLowerCase() !== "vip" || profile.data?.verification_status !== "approved") {
      return NextResponse.json({ ok: false, reason: "Only verified VIP members can create marketplace products." }, { status: 403 });
    }

    const title = String(body.title ?? "").trim();
    const price = Number(body.price ?? 0);
    const settingsRow = await client.from("platform_settings").select("settings").eq("id", 1).maybeSingle();
    const configuredCurrency = String(settingsRow.data?.settings?.walletCurrency ?? "UGX").trim().toUpperCase();
    const currency = String(body.currency ?? configuredCurrency).trim().toUpperCase();
    const inventory = Number(body.inventory ?? 1);
    const status = body.status === "draft" ? "draft" : "active";

    if (!title || title.length > 160 || !Number.isFinite(price) || price <= 0 || !/^[A-Z]{3}$/.test(currency) || !Number.isInteger(inventory) || inventory < 0) {
      return NextResponse.json({ ok: false, reason: "Title, positive price, valid currency and non-negative inventory are required." }, { status: 400 });
    }

    let imagePath: string | null = null;
    let imageUrl: string | null = null;
    if (uploadedFile) {
      if (!uploadedFile.type.startsWith("image/")) return NextResponse.json({ ok: false, reason: "Marketplace product image must be an image file." }, { status: 400 });
      if (uploadedFile.size > 8 * 1024 * 1024) return NextResponse.json({ ok: false, reason: "Marketplace images must be 8 MB or smaller." }, { status: 400 });
      const ext = (uploadedFile.name.split(".").pop() || "jpg").replace(/[^a-z0-9]/gi, "").toLowerCase() || "jpg";
      imagePath = identity.userId + "/" + crypto.randomUUID() + "." + ext;
      const bytes = new Uint8Array(await uploadedFile.arrayBuffer());
      const stored = await client.storage.from("marketplace-media").upload(imagePath, bytes, { contentType: uploadedFile.type, upsert: false });
      if (stored.error) return NextResponse.json({ ok: false, reason: stored.error.message }, { status: 400 });
      imageUrl = client.storage.from("marketplace-media").getPublicUrl(imagePath).data.publicUrl;
    }

    const result = createMarketplaceProduct({
      sellerId: identity.userId,
      title,
      price,
      currency,
      inventory,
      status,
    });
    if (!result.ok || !result.product) return NextResponse.json(result, { status: 400 });

    const persisted = await client.from("marketplace_products").insert({
      seller_id: identity.userId,
      title,
      price,
      currency,
      inventory,
      status,
      image_path: imagePath,
      image_url: imageUrl,
    }).select("id,seller_id,title,price,currency,inventory,status,image_path,image_url,created_at,updated_at").single();

    if (persisted.error) {
      if (imagePath) await client.storage.from("marketplace-media").remove([imagePath]);
      return NextResponse.json({ ok: false, reason: persisted.error.message }, { status: 500 });
    }

    return NextResponse.json({ ok: true, saved: true, source: "supabase", product: persisted.data });
  } catch (error) {
    return NextResponse.json({ ok: false, reason: error instanceof Error ? error.message : "Product creation failed." }, { status: 400 });
  }
}

export async function PATCH(request: Request) {
  try {
    const body = await request.json().catch(() => ({}));
    const productId = String(body.productId ?? "").trim();
    if (!productId) return NextResponse.json({ ok: false, reason: "Product ID is required." }, { status: 400 });

    const client = createServerSupabaseClient();
    if (!client) return NextResponse.json({ ok: false, reason: "Marketplace service is not configured." }, { status: 503 });

    const access = await requireAuthenticatedRoleAccess(request, ["customer", "manager", "admin"]);
    if (!access.ok || !access.session?.userId) {
      return NextResponse.json({ ok: false, reason: access.reason ?? "Authentication required." }, { status: 401 });
    }

    const current = await client.from("marketplace_products")
      .select("id,seller_id")
      .eq("id", productId)
      .maybeSingle();
    if (current.error) return NextResponse.json({ ok: false, reason: current.error.message }, { status: 500 });
    if (!current.data) return NextResponse.json({ ok: false, reason: "Product not found." }, { status: 404 });

    const isManager = access.session.role === "manager" || access.session.role === "admin";
    if (!isManager && current.data.seller_id !== access.session.userId) {
      return NextResponse.json({ ok: false, reason: "You can only manage your own products." }, { status: 403 });
    }

    const update: Record<string, unknown> = {};
    if (body.title !== undefined) {
      const title = String(body.title).trim();
      if (!title || title.length > 160) return NextResponse.json({ ok: false, reason: "Title is required and must be 160 characters or fewer." }, { status: 400 });
      update.title = title;
    }
    if (body.price !== undefined) {
      const price = Number(body.price);
      if (!Number.isFinite(price) || price <= 0) return NextResponse.json({ ok: false, reason: "Price must be greater than zero." }, { status: 400 });
      update.price = price;
    }
    if (body.currency !== undefined) {
      const currency = String(body.currency).trim().toUpperCase();
      if (!/^[A-Z]{3}$/.test(currency)) return NextResponse.json({ ok: false, reason: "Invalid currency." }, { status: 400 });
      update.currency = currency;
    }
    if (body.inventory !== undefined) {
      const inventory = Number(body.inventory);
      if (!Number.isInteger(inventory) || inventory < 0) return NextResponse.json({ ok: false, reason: "Inventory must be a non-negative integer." }, { status: 400 });
      update.inventory = inventory;
    }
    if (body.status !== undefined) {
      const status = String(body.status);
      if (!["draft", "active", "archived"].includes(status)) return NextResponse.json({ ok: false, reason: "Invalid product status." }, { status: 400 });
      update.status = status;
    }

    if (!Object.keys(update).length) return NextResponse.json({ ok: false, reason: "No product changes supplied." }, { status: 400 });

    const updated = await client.from("marketplace_products")
      .update({ ...update, updated_at: new Date().toISOString() })
      .eq("id", productId)
      .select("id,seller_id,title,price,currency,inventory,status,created_at,updated_at")
      .single();

    if (updated.error) return NextResponse.json({ ok: false, reason: updated.error.message }, { status: 500 });
    return NextResponse.json({ ok: true, saved: true, source: "supabase", product: updated.data });
  } catch (error) {
    return NextResponse.json({ ok: false, reason: error instanceof Error ? error.message : "Product update failed." }, { status: 400 });
  }
}
