import { describe, expect, it } from 'vitest'
import { getSessionFromRequest, normalizeRole, resolveRoleFromClaims, resolveRoleFromToken } from '../lib/aqe/auth'

function makeJwtPayload(payload: Record<string, unknown>) {
  const encoded = btoa(JSON.stringify(payload))
  return `header.${encoded}.signature`
}

describe('AQE auth', () => {
  it('normalizes manager admin roles from standard claim names', () => {
    expect(normalizeRole('Manager')).toBe('manager')
    expect(normalizeRole('ADMIN')).toBe('admin')
    expect(resolveRoleFromClaims({ user_role: 'manager' })).toBe('manager')
    expect(resolveRoleFromClaims({ roles: ['customer', 'admin'] })).toBe('customer')
  })

  it('builds a session object from request headers', () => {
    const request = new Request('https://example.com/api/auth/session', {
      headers: new Headers({
        authorization: 'Bearer demo-token',
        'x-user-id': 'user-123',
        'x-user-role': 'manager',
        'x-user-email': 'manager@aqe.test'
      })
    })

    expect(getSessionFromRequest(request)).toMatchObject({
      authenticated: true,
      userId: 'user-123',
      role: 'manager',
      email: 'manager@aqe.test'
    })
  })

  it('reads the role from a bearer token payload when no explicit header is present', () => {
    const token = makeJwtPayload({ user_role: 'admin' })
    expect(resolveRoleFromToken(token)).toBe('admin')

    const request = new Request('https://example.com/api/auth/session', {
      headers: new Headers({
        authorization: `Bearer ${token}`,
        'x-user-id': 'user-99'
      })
    })

    expect(getSessionFromRequest(request)).toMatchObject({
      authenticated: true,
      userId: 'user-99',
      role: 'admin'
    })
  })
})
