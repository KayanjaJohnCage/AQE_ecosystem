import { createServerSupabaseClient } from "../supabaseServer";

export type SupportCategory =
  | "ACCOUNT"
  | "PAYMENT"
  | "PROFILE"
  | "TECHNICAL"
  | "OTHER";
export type SupportPriority = "LOW" | "MEDIUM" | "HIGH" | "URGENT";

export function createSupportTicket({
  userId,
  category,
  subject,
  message,
  priority,
}: {
  userId: string;
  category: SupportCategory;
  subject: string;
  message: string;
  priority: SupportPriority;
}) {
  if (!userId || !subject.trim() || !message.trim()) {
    return {
      ok: false,
      reason: "User ID, subject, and message are required.",
    };
  }

  return {
    ok: true,
    ticketId: `support-${Date.now()}`,
    userId,
    category,
    subject,
    message,
    priority,
    status: "OPEN",
  };
}

export async function persistSupportTicket(ticket: {
  userId: string;
  category: SupportCategory;
  subject: string;
  message: string;
  priority: SupportPriority;
}) {
  const client = createServerSupabaseClient();

  if (!client) {
    return {
      ok: true,
      saved: false,
      source: "memory",
      ticket: createSupportTicket(ticket),
    };
  }

  const { data, error } = await client
    .from("support_ticket")
    .insert({
      user_id: ticket.userId,
      category: ticket.category,
      subject: ticket.subject,
      priority: ticket.priority,
      status: "OPEN",
    })
    .select("id, user_id, category, subject, priority, status")
    .single();

  if (error || !data) {
    return {
      ok: false,
      saved: false,
      source: "supabase",
      reason: error?.message ?? "Support ticket could not be saved.",
    };
  }

  const messageResult = await client.from("support_message").insert({
    ticket_id: data.id,
    sender_id: ticket.userId,
    sender_role: "USER",
    message: ticket.message,
  });

  if (messageResult.error) {
    return {
      ok: false,
      saved: false,
      source: "supabase",
      reason: messageResult.error.message,
    };
  }

  return {
    ok: true,
    saved: true,
    source: "supabase",
    ticket: {
      ok: true,
      ticketId: data.id,
      userId: data.user_id,
      category: data.category,
      subject: data.subject,
      message: ticket.message,
      priority: data.priority,
      status: data.status,
    },
  };
}
