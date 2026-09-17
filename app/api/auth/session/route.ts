import { NextResponse } from 'next/server'
import { resolveAuthenticatedSession, resolveRoleFromClaims } from '../../../../lib/aqe/auth'

export async function GET(request: Request) {
  try {
    const session = await resolveAuthenticatedSession(request)
    const authHeader = request.headers.get('authorization') ?? ''
    const claimsHeader = request.headers.get('x-user-claims') ?? ''

    let resolvedRole = session.role
    if (claimsHeader) {
      try {
        const claims = JSON.parse(claimsHeader)
        resolvedRole = resolveRoleFromClaims(claims) ?? session.role
      } catch {
        resolvedRole = session.role
      }
    }

    return NextResponse.json({
      ok: true,
      authenticated: session.authenticated,
      session: {
        userId: session.userId,
        email: session.email,
        role: resolvedRole,
        hasToken: Boolean(authHeader)
      }
    })
  } catch (error) {
    return NextResponse.json(
      {
        ok: false,
        reason: error instanceof Error ? error.message : 'Session lookup failed'
      },
      { status: 400 }
    )
  }
}
