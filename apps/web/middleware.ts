import { createServerClient } from '@supabase/ssr'
import { NextResponse, type NextRequest } from 'next/server'
import { isAdminRole, type UserRole } from '@/lib/user-role'

/** Routes that require is_super_admin = true (in addition to any admin role). */
const SUPER_ADMIN_PATHS = ['/admin/restaurants']

export async function middleware(request: NextRequest): Promise<NextResponse> {
  let supabaseResponse = NextResponse.next({ request })

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll()
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value }) =>
            request.cookies.set(name, value)
          )
          supabaseResponse = NextResponse.next({ request })
          cookiesToSet.forEach(({ name, value, options }) =>
            supabaseResponse.cookies.set(name, value, options)
          )
        },
      },
    }
  )

  const {
    data: { user },
  } = await supabase.auth.getUser()

  const { pathname } = request.nextUrl

  // /kitchen is a PIN-protected (or open) display page for kitchen devices.
  // It handles its own lightweight auth so the standard JWT middleware is skipped.
  // /register is a publicly accessible restaurant onboarding page — no auth required
  // to view it (though the form still needs a super-admin token to submit).
  if (pathname.startsWith('/kitchen') || pathname.startsWith('/register')) {
    return supabaseResponse
  }

  // Authenticated user hitting /login → redirect to /tables
  if (user !== null && pathname === '/login') {
    const url = request.nextUrl.clone()
    url.pathname = '/tables'
    return NextResponse.redirect(url)
  }

  // Unauthenticated user → redirect to /login
  if (user === null && pathname !== '/login') {
    const url = request.nextUrl.clone()
    url.pathname = '/login'
    return NextResponse.redirect(url)
  }

  // Role-based access control: /admin/* requires owner or manager role
  if (user !== null && pathname.startsWith('/admin')) {
    // Use the user's own session client — RLS on the users table ensures
    // each authenticated user can only read their own row, so no service
    // role key is needed and Vercel does not require SUPABASE_SERVICE_ROLE_KEY.
    // Fetch role and super-admin flag.  The is_super_admin column was added in
    // migration 20260327110000; if it doesn't exist yet (e.g. a migration hasn't
    // been applied) we fall back to a role-only query so that regular admin
    // access is never accidentally blocked.
    const { data, error } = await supabase
      .from('users')
      .select('role, is_super_admin')
      .eq('id', user.id)
      .single()

    const VALID_ROLES: UserRole[] = ['owner', 'manager', 'server', 'kitchen']

    // If the combined query failed (e.g. column not yet migrated), retry with
    // just `role` so legitimate admin users are never locked out.
    let roleRaw: string | null = null
    let isSuperAdmin = false

    if (error === null && data !== null) {
      roleRaw = (data as { role: string }).role
      isSuperAdmin = Boolean((data as { is_super_admin?: boolean }).is_super_admin)
    } else {
      // Fallback: query only role (always safe)
      const { data: fallback, error: fallbackErr } = await supabase
        .from('users')
        .select('role')
        .eq('id', user.id)
        .single()
      if (fallbackErr === null && fallback !== null) {
        roleRaw = (fallback as { role: string }).role
      }
    }

    const raw = roleRaw
    const role = (raw !== null && VALID_ROLES.includes(raw as UserRole)) ? (raw as UserRole) : null

    if (!isAdminRole(role)) {
      const url = request.nextUrl.clone()
      url.pathname = '/tables'
      return NextResponse.redirect(url)
    }

    // Super-admin-only routes: redirect non-super-admins back to /admin
    const requiresSuperAdmin = SUPER_ADMIN_PATHS.some((p) => pathname.startsWith(p))
    if (requiresSuperAdmin && !isSuperAdmin) {
      const url = request.nextUrl.clone()
      url.pathname = '/admin'
      return NextResponse.redirect(url)
    }
  }

  return supabaseResponse
}

export const config = {
  matcher: [
    '/((?!_next/static|_next/image|favicon.ico|manifest.json|sw.js|workbox-.*|icons/.*).*)',
  ],
}
