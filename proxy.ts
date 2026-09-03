import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { createServerClient } from '@supabase/ssr';

/**
 * Next.js 16 Proxy — runs on every matched request before it hits the page/API.
 *
 * Critical responsibilities:
 * 1. Refresh Supabase session tokens on every request (prevents random logouts)
 * 2. Protect authenticated routes — redirect to /login if no valid session
 * 3. Redirect already-authenticated users away from /login and /signup
 *
 * IMPORTANT: Do not add any logic between createServerClient and
 * supabase.auth.getUser() — it can cause random logout bugs per Supabase docs.
 */
export async function proxy(request: NextRequest) {
  let supabaseResponse = NextResponse.next({ request });

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet) {
          // Write cookies to both the request and the response so the
          // refreshed session token propagates correctly to the browser.
          cookiesToSet.forEach(({ name, value }) =>
            request.cookies.set(name, value)
          );
          supabaseResponse = NextResponse.next({ request });
          cookiesToSet.forEach(({ name, value, options }) =>
            supabaseResponse.cookies.set(name, value, options)
          );
        },
      },
    }
  );

  // Refresh session — MUST be called before any route logic.
  // This keeps the session alive and writes updated tokens to cookies.
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const { pathname } = request.nextUrl;

  // Routes accessible without a session
  const isPublicRoute =
    pathname === '/' ||
    pathname === '/login' ||
    pathname === '/signup' ||
    pathname.startsWith('/auth/');

  // Not authenticated + trying to access a protected route → redirect to login
  if (!user && !isPublicRoute) {
    const url = request.nextUrl.clone();
    url.pathname = '/login';
    url.searchParams.set('redirectTo', pathname);
    return NextResponse.redirect(url);
  }

  // Authenticated + trying to access login/signup → redirect to documents
  if (user && (pathname === '/login' || pathname === '/signup')) {
    const url = request.nextUrl.clone();
    url.pathname = '/documents';
    return NextResponse.redirect(url);
  }

  // Return supabaseResponse — it carries the refreshed session cookies.
  // Never return a plain NextResponse.next() here or the session won't persist.
  return supabaseResponse;
}

export const config = {
  matcher: [
    /*
     * Match all request paths except:
     * - _next/static (static files)
     * - _next/image (image optimization)
     * - favicon.ico
     * - public folder assets (svg, png, jpg, jpeg, gif, webp)
     */
    '/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)',
  ],
};
