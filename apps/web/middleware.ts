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
    const { data, error } = await supabase
      .from('users')
      .select('role, is_super_admin')
      .eq('id', user.id)
      .single()

    const VALID_ROLES: UserRole[] = ['owner', 'manager', 'server', 'kitchen']
    const raw = (error === null && data !== null) ? (data as { role: string }).role : null
    const role = (raw !== null && VALID_ROLES.includes(raw as UserRole)) ? (raw as UserRole) : null
    const isSuperAdmin = (error === null && data !== null)
      ? Boolean((data as { is_super_admin?: boolean }).is_super_admin)
      : false

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
