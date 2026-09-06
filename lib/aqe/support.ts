export type SupportCategory =
  | 'ACCOUNT'
  | 'QC'
  | 'PAYMENT'
  | 'CREATOR'
  | 'SUBSCRIPTION'
  | 'MARKETPLACE'
  | 'WITHDRAWAL'
  | 'REFERRAL'
  | 'REPORT'
  | 'TECHNICAL'
  | 'OTHER'

export type SupportStatus =
  | 'OPEN'
  | 'IN_PROGRESS'
  | 'WAITING_FOR_USER'
  | 'WAITING_FOR_MANAGER'
  | 'RESOLVED'
  | 'CLOSED'

export type SupportTicketInput = {
  userId: string
  category: SupportCategory
  subject: string
  message: string
  priority?: 'LOW' | 'MEDIUM' | 'HIGH' | 'URGENT'
}

export function createSupportTicket(input: SupportTicketInput) {
  const subject = (input.subject || 'New support request').trim()
  const message = (input.message || 'No details provided').trim()

  if (!subject || !message) {
    throw new Error('Subject and message are required for a support ticket.')
  }

  return {
    ok: true,
    ticket: {
      id: `ticket-${Date.now()}`,
      userId: input.userId,
      category: input.category,
      subject,
      status: 'OPEN' as SupportStatus,
      priority: input.priority ?? 'MEDIUM',
      createdAt: new Date().toISOString(),
      message,
      managerNote: 'Ticket received and queued for manager review.'
    }
  }
}

export const SUPPORT_QUEUE = [
  { category: 'QC', count: 4, status: 'OPEN' },
  { category: 'PAYMENT', count: 3, status: 'IN_PROGRESS' },
  { category: 'WITHDRAWAL', count: 2, status: 'WAITING_FOR_USER' },
  { category: 'CREATOR', count: 1, status: 'RESOLVED' }
] as const
