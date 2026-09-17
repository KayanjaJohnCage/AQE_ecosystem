import { createServerSupabaseClient } from '../supabaseServer'

export type BookingStatus = 'pending' | 'accepted' | 'rejected' | 'cancelled' | 'completed' | 'disputed'

export type Booking = {
  id: string
  customerId: string
  providerId: string
  service: string
  amount: number
  currency: string
  status: BookingStatus
  notes?: string
  createdAt: string
}

export function createBookingRequest({
  customerId,
  providerId,
  service,
  amount,
  currency = 'USD',
  notes
}: {
  customerId: string
  providerId: string
  service: string
  amount: number
  currency?: string
  notes?: string
}): { ok: boolean; booking?: Booking; reason?: string } {
  if (!customerId || !providerId || !service) {
    return { ok: false, reason: 'Customer, provider, and service are required.' }
  }

  if (!Number.isFinite(amount) || amount <= 0) {
    return { ok: false, reason: 'Booking amount must be greater than zero.' }
  }

  return {
    ok: true,
    booking: {
      id: `booking-${Date.now()}`,
      customerId,
      providerId,
      service,
      amount,
      currency,
      status: 'pending',
      notes,
      createdAt: new Date().toISOString()
    }
  }
}

export function transitionBookingStatus(currentStatus: BookingStatus, nextStatus: BookingStatus): { ok: boolean; reason?: string } {
  const allowedTransitions: Record<BookingStatus, BookingStatus[]> = {
    pending: ['accepted', 'rejected', 'cancelled'],
    accepted: ['completed', 'cancelled', 'disputed'],
    rejected: [],
    cancelled: [],
    completed: [],
    disputed: ['accepted', 'cancelled']
  }

  if (currentStatus === nextStatus) {
    return { ok: true }
  }

  if (!allowedTransitions[currentStatus]?.includes(nextStatus)) {
    return {
      ok: false,
      reason: `Status transition from ${currentStatus} to ${nextStatus} is not allowed.`
    }
  }

  return { ok: true }
}

export async function persistBookingRequest(booking: Booking) {
  const client = createServerSupabaseClient()

  if (!client) return { ok: true, saved: false, source: 'memory', booking }

  const { data, error } = await client
    .from('bookings')
    .insert({
      customer_id: booking.customerId,
      provider_id: booking.providerId,
      service: booking.service,
      amount: booking.amount,
      currency: booking.currency,
      status: booking.status,
      notes: booking.notes ?? null
    })
    .select('id, customer_id, provider_id, service, amount, currency, status, notes, created_at')
    .single()

  if (error || !data) {
    return { ok: false, saved: false, source: 'supabase', reason: error?.message ?? 'Booking could not be saved.' }
  }

  return { ok: true, saved: true, source: 'supabase', booking: data }
}
