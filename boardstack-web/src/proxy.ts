import { auth0 } from "./lib/auth0";

// Next.js 16 renamed `middleware` to `proxy`. This intercepts requests at the
// network boundary and mounts the /auth/* routes (login, callback, logout,
// access-token, profile, ...) and keeps the session rolling.
export async function proxy(request: Request) {
  return await auth0.middleware(request);
}

export const config = {
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|sitemap.xml|robots.txt).*)",
  ],
};
