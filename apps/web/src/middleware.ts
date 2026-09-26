import { NextResponse, type NextRequest } from "next/server";

/**
 * Records the path being rendered so Server Components can read it.
 *
 * `next/headers` exposes request headers but not the URL, and a page that needs
 * to send an expired session to `/login?next=…` has to know where the user was.
 * Passing it down as a prop is not an option — the layout that discovers the
 * expiry is not the page that knows the route.
 *
 * Deliberately not where the session is refreshed: middleware runs on
 * prefetches too, and several of those arriving at once would each present the
 * same refresh token. The API rotates refresh tokens and treats a reused one as
 * theft, so that would end the session rather than extend it.
 */
export function middleware(request: NextRequest): NextResponse {
  const headers = new Headers(request.headers);
  headers.set("x-pathname", request.nextUrl.pathname + request.nextUrl.search);
  return NextResponse.next({ request: { headers } });
}

export const config = {
  matcher: [
    // Everything except static assets and the icons the mask URLs pull in.
    "/((?!_next/static|_next/image|icons/|favicon.ico).*)",
  ],
};
