/**
 * Shared JWT authentication & RBAC helper for iKitchen POS edge functions.
 *
 * Usage:
 *   import { verifyAndGetCaller, type RoleLevel } from '../_shared/auth.ts'
 *
 *   const caller = await verifyAndGetCaller(req, env.supabaseUrl, env.serviceKey, 'server', fetchFn)
 *   if ('error' in caller) {
 *     return new Response(JSON.stringify({ success: false, error: caller.error }), {
 *       status: caller.status,
 *       headers: { 'Content-Type': 'application/json', ...corsHeaders },
 *     })
 *   }
 *   // caller.actorId and caller.role are now available
 */

export type FetchFn = (input: string, init?: RequestInit) => Promise<Response>

export type RoleLevel = 'server' | 'manager' | 'admin' | 'owner'

/**
 * Numeric rank for each role.
 * Higher = more privileged. 'kitchen' is treated the same as 'server'.
 * 'admin' maps to 'owner' semantics in the DB (both rank 4) to handle
 * the architecture doc naming ('admin') vs DB naming ('owner') mismatch.
 */
const ROLE_RANK: Record<string, number> = {
  server: 1,
  kitchen: 1,
  manager: 2,
  admin: 4,  // architecture doc alias
  owner: 4,
}

export function hasMinRole(callerRole: string, minRole: RoleLevel): boolean {
  return (ROLE_RANK[callerRole] ?? 0) >= (ROLE_RANK[minRole] ?? 999)
}

export interface CallerInfo {
  actorId: string
  role: string
}

export interface AuthError {
  error: string
  status: 401 | 403
}

/**
 * Verifies the JWT from the Authorization header and checks the caller has
 * at least `minRole` permission. Returns CallerInfo on success, AuthError on failure.
 */
export async function verifyAndGetCaller(
  req: Request,
  supabaseUrl: string,
  serviceKey: string,
  minRole: RoleLevel,
  fetchFn: FetchFn = fetch,
): Promise<CallerInfo | AuthError> {
  const authHeader = req.headers.get('Authorization')
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return { error: 'Unauthorized', status: 401 }
  }
  const token = authHeader.slice(7).trim()
  if (!token) {
    return { error: 'Unauthorized', status: 401 }
  }

  // Verify JWT: call /auth/v1/user with the caller's token
  let userId: string
  try {
    const userRes = await fetchFn(`${supabaseUrl}/auth/v1/user`, {
      headers: {
        apikey: serviceKey,
        Authorization: `Bearer ${token}`,
      },
    })
    if (!userRes.ok) {
      return { error: 'Unauthorized', status: 401 }
    }
    const user = (await userRes.json()) as { id?: string }
    if (!user.id) {
      return { error: 'Unauthorized', status: 401 }
    }
    userId = user.id
  } catch {
    return { error: 'Unauthorized', status: 401 }
  }

  // Look up the user's role from the users table
  let role: string
  try {
    const roleRes = await fetchFn(
      `${supabaseUrl}/rest/v1/users?id=eq.${encodeURIComponent(userId)}&select=role&limit=1`,
      {
        headers: {
          apikey: serviceKey,
          Authorization: `Bearer ${serviceKey}`,
        },
      },
    )
    if (!roleRes.ok) {
      return { error: 'Unauthorized', status: 401 }
    }
    const rows = (await roleRes.json()) as Array<{ role: string }>
    if (!rows || rows.length === 0) {
      return { error: 'Unauthorized', status: 401 }
    }
    role = rows[0].role
  } catch {
    return { error: 'Unauthorized', status: 401 }
  }

  // Role check
  if (!hasMinRole(role, minRole)) {
    return { error: 'Forbidden', status: 403 }
  }

  return { actorId: userId, role }
}
