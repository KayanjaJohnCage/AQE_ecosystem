import { NextResponse } from "next/server";
import { requireAuthenticatedRoleAccess } from "../../../../lib/aqe/auth";
import { createServerSupabaseClient } from "../../../../lib/supabaseServer";

const CREATE_RESOURCES = new Set([
  "notifications",
  "bookings",
  "direct_messages",
  "marketplace_products",
  "campaigns",
  "aqe_prizes",
  "support_ticket",
]);

const DELETE_RESOURCES = new Set([
  "notifications",
  "bookings",
  "direct_messages",
  "marketplace_products",
  "campaigns",
  "aqe_prizes",
  "support_ticket",
  "profile_comments",
  "account_troubleshoot_requests",
  "transaction_receipts",
  "transactions",
]);

const CLEAR_RESOURCES = new Set([
  "notifications",
  "bookings",
  "direct_messages",
  "marketplace_products",
  "campaigns",
  "aqe_prizes",
  "support_ticket",
  "profile_comments",
  "account_troubleshoot_requests",
  "transaction_receipts",
  "transactions",
]);

const PROTECTED_RESOURCES = new Set([
  "payment_orders",
  "cash_wallet",
  "cash_wallet_ledger",
  "referral_earnings",
  "qc_ledger",
  "creator_earnings",
  "audit_log",
]);

function resourceName(value: unknown) {
  return String(value ?? "").trim().toLowerCase();
}

function cleanObject(input: Record<string, unknown>, allowed: string[]) {
  const output: Record<string, unknown> = {};
  for (const key of allowed) {
    if (input[key] !== undefined) output[key] = input[key];
  }
  return output;
}

async function audit(
  client: ReturnType<typeof createServerSupabaseClient>,
  actorId: string,
  action: string,
  entityType: string,
  entityId?: string,
  beforeState?: unknown,
  afterState?: unknown,
  reason?: string,
) {
  if (!client) return;
  await client.from("audit_log").insert({
    actor_id: actorId,
    actor_role: "manager",
    action,
    entity_type: entityType,
    entity_id: entityId ?? null,
    before_state: beforeState ?? null,
    after_state: afterState ?? null,
    reason: reason ?? null,
    metadata: { source: "manager-control-console" },
  });
}

export async function POST(request: Request) {
  try {
    const access = await requireAuthenticatedRoleAccess(request, ["manager", "admin"]);
    if (!access.ok) return NextResponse.json({ ok: false, reason: access.reason }, { status: 403 });

    const client = createServerSupabaseClient();
    if (!client) return NextResponse.json({ ok: false, reason: "Supabase is not configured." }, { status: 503 });

    const body = await request.json().catch(() => ({}));
    const resource = resourceName(body.resource);
    const action = resourceName(body.action);
    if (!resource || !action) return NextResponse.json({ ok: false, reason: "Resource and action are required." }, { status: 400 });

    if (action === "clear") {
      if (PROTECTED_RESOURCES.has(resource)) {
        return NextResponse.json({ ok: false, reason: "Financial and audit records are immutable and cannot be cleared." }, { status: 409 });
      }
      if (!CLEAR_RESOURCES.has(resource)) {
        return NextResponse.json({ ok: false, reason: "Clear-all is not enabled for this resource." }, { status: 400 });
      }
      const result = await client.from(resource).delete().not("id", "is", null);
      if (result.error) return NextResponse.json({ ok: false, reason: result.error.message }, { status: 500 });
      await audit(client, access.session.userId!, "CLEAR_ALL", resource, undefined, undefined, undefined, "Manager requested clear-all.");
      return NextResponse.json({ ok: true, affected: null, message: resource + " cleared." });
    }

    if (action === "block" || action === "unblock") {
      if (resource !== "profiles") return NextResponse.json({ ok: false, reason: "Block is available for customer profiles." }, { status: 400 });
      const userId = String(body.userId ?? body.id ?? "").trim();
      if (!userId || userId === access.session.userId) return NextResponse.json({ ok: false, reason: "A different customer user ID is required." }, { status: 400 });
      const targetRoles = await client.from("user_roles").select("role_name").eq("user_id", userId);
      if ((targetRoles.data ?? []).some((row) => ["manager","admin"].includes(String(row.role_name).toLowerCase()))) return NextResponse.json({ ok:false, reason:"Manager and admin accounts cannot be blocked from Manager Control." }, { status:403 });
      const current = await client.from("profiles").select("user_id,account_status,display_name").eq("user_id", userId).maybeSingle();
      if (current.error || !current.data) return NextResponse.json({ ok: false, reason: current.error?.message ?? "Profile not found." }, { status: 404 });
      const next = action === "block" ? "blocked" : "active";
      const updated = await client.from("profiles").update({ account_status: next, updated_at: new Date().toISOString() }).eq("user_id", userId).select("user_id,display_name,account_status").single();
      if (updated.error) return NextResponse.json({ ok: false, reason: updated.error.message }, { status: 500 });
      await audit(client, access.session.userId!, action.toUpperCase(), "profiles", userId, current.data, updated.data);
      return NextResponse.json({ ok: true, profile: updated.data });
    }

    if (action === "create") {
      if (!CREATE_RESOURCES.has(resource)) return NextResponse.json({ ok: false, reason: "Create is not enabled for this resource." }, { status: 400 });
      const now = new Date().toISOString();
      let insert: Record<string, unknown>;

      if (resource === "notifications") {
        const userId = String(body.userId ?? "").trim();
        const title = String(body.title ?? "").trim();
        const message = String(body.body ?? body.message ?? "").trim();
        if (!userId || !title || !message) return NextResponse.json({ ok: false, reason: "User, title and notification body are required." }, { status: 400 });
        insert = { user_id: userId, type: String(body.type ?? "manager"), title, body: message, metadata: body.metadata ?? {}, created_at: now };
      } else if (resource === "bookings") {
        insert = cleanObject(body, ["customer_id","provider_id","service","amount","currency","status","notes"]);
        insert.customer_id = String(body.customer_id ?? body.customerId ?? "");
        insert.provider_id = String(body.provider_id ?? body.providerId ?? "");
        insert.service = String(body.service ?? "").trim();
        insert.amount = Number(body.amount ?? 0);
        insert.currency = String(body.currency ?? "UGX").toUpperCase();
        insert.status = String(body.status ?? "pending");
        if (!insert.customer_id || !insert.provider_id || !insert.service || Number(insert.amount) <= 0) return NextResponse.json({ ok: false, reason: "Customer, provider, service and positive amount are required." }, { status: 400 });
      } else if (resource === "direct_messages") {
        const senderId = String(body.sender_id ?? body.senderId ?? access.session.userId).trim();
        const recipientId = String(body.recipient_id ?? body.recipientId ?? "").trim();
        const message = String(body.body ?? body.message ?? "").trim();
        if (!senderId || !recipientId || !message || senderId === recipientId) return NextResponse.json({ ok: false, reason: "Different sender, recipient and message are required." }, { status: 400 });
        insert = { sender_id: senderId, recipient_id: recipientId, body: message, created_at: now };
      } else if (resource === "marketplace_products") {
        insert = {
          seller_id: String(body.seller_id ?? body.sellerId ?? "").trim(),
          title: String(body.title ?? "").trim(),
          price: Number(body.price ?? 0),
          currency: String(body.currency ?? "UGX").toUpperCase(),
          inventory: Number(body.inventory ?? 1),
          status: ["draft","active","archived"].includes(String(body.status)) ? String(body.status) : "active",
          image_path: body.image_path ?? body.imagePath ?? null,
          image_url: body.image_url ?? body.imageUrl ?? null,
          created_at: now,
          updated_at: now,
        };
        if (!insert.seller_id || !insert.title || Number(insert.price) <= 0 || !Number.isInteger(insert.inventory) || Number(insert.inventory) < 0) return NextResponse.json({ ok: false, reason: "Seller, title, positive price and valid inventory are required." }, { status: 400 });
      } else if (resource === "campaigns") {
        insert = { name: String(body.name ?? body.title ?? "").trim(), description: String(body.description ?? "").trim() || null, starts_at: body.starts_at ?? body.startsAt ?? null, ends_at: body.ends_at ?? body.endsAt ?? null, status: String(body.status ?? "draft"), created_by: access.session.userId, created_at: now, updated_at: now };
        if (!insert.name) return NextResponse.json({ ok: false, reason: "Campaign name is required." }, { status: 400 });
      } else if (resource === "aqe_prizes") {
        insert = { ref_code: String(body.ref_code ?? body.refCode ?? ("AQE-" + Date.now())).trim(), title: String(body.title ?? "").trim(), invite_requirement: Number(body.invite_requirement ?? body.inviteRequirement ?? 1), tier_scope: String(body.tier_scope ?? body.tierScope ?? "vip"), reward_type: String(body.reward_type ?? body.rewardType ?? "physical"), reward_description: body.reward_description ?? body.rewardDescription ?? null, cash_value: body.cash_value ?? body.cashValue ?? null, image_url: body.image_url ?? body.imageUrl ?? null, active: body.active !== false, sort_order: Number(body.sort_order ?? body.sortOrder ?? 0), created_at: now, updated_at: now };
        if (!insert.title || Number(insert.invite_requirement) <= 0) return NextResponse.json({ ok: false, reason: "Prize title and positive invite requirement are required." }, { status: 400 });
      } else {
        insert = { user_id: String(body.user_id ?? body.userId ?? "").trim(), category: String(body.category ?? "GENERAL"), subject: String(body.subject ?? body.title ?? "").trim(), status: String(body.status ?? "OPEN"), priority: String(body.priority ?? "MEDIUM"), created_at: now, updated_at: now };
        if (!insert.user_id || !insert.subject) return NextResponse.json({ ok: false, reason: "Customer and support subject are required." }, { status: 400 });
      }

      const created = await client.from(resource).insert(insert).select("*").single();
      if (created.error) return NextResponse.json({ ok: false, reason: created.error.message }, { status: 400 });
      await audit(client, access.session.userId!, "CREATE", resource, String(created.data.id), undefined, created.data);
      return NextResponse.json({ ok: true, row: created.data });
    }

    if (action === "update") {
      const id = String(body.id ?? body.entityId ?? "").trim();
      if (!id) return NextResponse.json({ ok: false, reason: "Record ID is required." }, { status: 400 });
      if (PROTECTED_RESOURCES.has(resource)) return NextResponse.json({ ok: false, reason: "Financial and audit records must be changed through their dedicated workflows." }, { status: 409 });

      if (resource === "profiles" && id) {
      const roleRows = await client.from("user_roles").select("role_name").eq("user_id", id);
      if ((roleRows.data ?? []).some((row) => ["manager","admin"].includes(String(row.role_name).toLowerCase()))) {
        return NextResponse.json({ ok:false, reason:"Manager and admin accounts cannot be updated from Manager Control." }, { status:403 });
      }
    }
    const current = await client.from(resource).select("*").eq(resource === "profiles" ? "user_id" : "id", id).maybeSingle();
      if (current.error || !current.data) return NextResponse.json({ ok: false, reason: current.error?.message ?? "Record not found." }, { status: 404 });

      const allowedByResource: Record<string,string[]> = {
        profiles:["display_name","bio","phone","country","location","area","category","services","content_categories","age","gender","pronouns","headline","languages","availability","timezone","visibility","social_platforms","contact_methods"],
        notifications:["type","title","body","read_at","metadata"],
        bookings:["service","amount","currency","status","notes"],
        direct_messages:["body","read_at"],
        marketplace_products:["title","price","currency","inventory","status","image_path","image_url"],
        campaigns:["name","description","starts_at","ends_at","status"],
        aqe_prizes:["ref_code","title","invite_requirement","tier_scope","reward_type","reward_description","cash_value","image_url","active","sort_order"],
        support_ticket:["category","subject","status","priority","assigned_manager_id","closed_at"],
        profile_comments:["body"],
        account_troubleshoot_requests:["requested_change","details","status","qc_charge"],
      };
      const allowed = allowedByResource[resource];
      if (!allowed) return NextResponse.json({ ok: false, reason: "Update is not enabled for this resource." }, { status: 400 });
      const update = cleanObject(body, allowed);
      if (resource === "profiles" && body.userId && String(current.data.user_id) !== String(body.userId)) return NextResponse.json({ ok: false, reason: "Profile identity cannot be changed." }, { status: 400 });
      if (!Object.keys(update).length) return NextResponse.json({ ok: false, reason: "No editable fields supplied." }, { status: 400 });
      if ("updated_at" in current.data || ["profiles","bookings","marketplace_products","campaigns","aqe_prizes","support_ticket"].includes(resource)) update.updated_at = new Date().toISOString();

      const updated = await client.from(resource).update(update).eq(resource === "profiles" ? "user_id" : "id", id).select("*").single();
      if (updated.error) return NextResponse.json({ ok: false, reason: updated.error.message }, { status: 400 });
      await audit(client, access.session.userId!, "UPDATE", resource, id, current.data, updated.data);
      return NextResponse.json({ ok: true, row: updated.data });
    }

    return NextResponse.json({ ok: false, reason: "Unsupported manager action." }, { status: 400 });
  } catch (error) {
    return NextResponse.json({ ok: false, reason: error instanceof Error ? error.message : "Manager action failed." }, { status: 400 });
  }
}

export async function DELETE(request: Request) {
  try {
    const access = await requireAuthenticatedRoleAccess(request, ["manager", "admin"]);
    if (!access.ok) return NextResponse.json({ ok: false, reason: access.reason }, { status: 403 });
    const client = createServerSupabaseClient();
    if (!client) return NextResponse.json({ ok: false, reason: "Supabase is not configured." }, { status: 503 });

    const body = await request.json().catch(() => ({}));
    const resource = resourceName(body.resource);
    const id = String(body.id ?? body.entityId ?? "").trim();
    if (!resource || !id) return NextResponse.json({ ok: false, reason: "Resource and record ID are required." }, { status: 400 });
    if (PROTECTED_RESOURCES.has(resource)) return NextResponse.json({ ok: false, reason: "Financial and audit records are immutable." }, { status: 409 });
    if (!DELETE_RESOURCES.has(resource)) return NextResponse.json({ ok: false, reason: "Delete is not enabled for this resource." }, { status: 400 });

    if (resource === "profiles") {
      const roleRows = await client.from("user_roles").select("role_name").eq("user_id", id);
      if ((roleRows.data ?? []).some((row) => ["manager","admin"].includes(String(row.role_name).toLowerCase()))) return NextResponse.json({ ok:false, reason:"Manager and admin accounts cannot be deleted from Manager Control." }, { status:403 });
    }
    const current = await client.from(resource).select("*").eq("id", id).maybeSingle();
    if (current.error || !current.data) return NextResponse.json({ ok: false, reason: current.error?.message ?? "Record not found." }, { status: 404 });
    const deleted = await client.from(resource).delete().eq("id", id);
    if (deleted.error) return NextResponse.json({ ok: false, reason: deleted.error.message }, { status: 500 });
    await audit(client, access.session.userId!, "DELETE", resource, id, current.data, undefined);
    return NextResponse.json({ ok: true, deletedId: id });
  } catch (error) {
    return NextResponse.json({ ok: false, reason: error instanceof Error ? error.message : "Manager delete failed." }, { status: 400 });
  }
}
