import { createServerSupabaseClient } from "../supabaseServer";

export type ProductStatus = "draft" | "active" | "archived";

export function createMarketplaceProduct({
  sellerId,
  title,
  price,
  currency = "USD",
  inventory = 1,
  status = "active" as ProductStatus,
}: {
  sellerId: string;
  title: string;
  price: number;
  currency?: string;
  inventory?: number;
  status?: ProductStatus;
}) {
  if (!sellerId || !title) {
    return { ok: false, reason: "Seller and title are required." };
  }

  if (!Number.isFinite(price) || price <= 0) {
    return { ok: false, reason: "Price must be greater than zero." };
  }

  return {
    ok: true,
    product: {
      id: `product-${Date.now()}`,
      sellerId,
      title,
      price,
      currency,
      inventory,
      status,
      createdAt: new Date().toISOString(),
    },
  };
}

export async function persistMarketplaceProduct(product: {
  sellerId: string;
  title: string;
  price: number;
  currency: string;
  inventory: number;
  status: ProductStatus;
}) {
  const client = createServerSupabaseClient();

  if (!client) return { ok: true, saved: false, source: "memory", product };

  const { data, error } = await client
    .from("marketplace_products")
    .insert({
      seller_id: product.sellerId,
      title: product.title,
      price: product.price,
      currency: product.currency,
      inventory: product.inventory,
      status: product.status,
    })
    .select(
      "id, seller_id, title, price, currency, inventory, status, created_at",
    )
    .single();

  if (error || !data) {
    return {
      ok: false,
      saved: false,
      source: "supabase",
      reason: error?.message ?? "Product could not be saved.",
    };
  }

  return { ok: true, saved: true, source: "supabase", product: data };
}
