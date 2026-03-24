import { createServerClient } from '@supabase/ssr'
import { NextResponse, type NextRequest } from 'next/server'
import { isAdminRole, type UserRole } from '@/lib/user-role'

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
    // Use service role key for authoritative server-side role lookup
    const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY!
    const adminClient = createServerClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      serviceRoleKey,
      {
        cookies: {
          getAll() {
            return request.cookies.getAll()
          },
          setAll() {
            // Service role client — no cookie mutations needed
          },
        },
      }
    )

    const { data, error } = await adminClient
      .from('users')
      .select('role')
      .eq('id', user.id)
      .single()

    const VALID_ROLES: UserRole[] = ['owner', 'manager', 'server', 'kitchen']
    const raw = (error === null && data !== null) ? (data as { role: string }).role : null
    const role = (raw !== null && VALID_ROLES.includes(raw as UserRole)) ? (raw as UserRole) : null

    if (!isAdminRole(role)) {
      const url = request.nextUrl.clone()
      url.pathname = '/tables'
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
