import { NextResponse, type NextRequest } from "next/server";

// The conversation log (app/admin) sits behind HTTP Basic auth. Any user name works; the password
// is CHAT_ADMIN_PASSWORD. Without that variable the pages do not exist at all.
export const config = { matcher: ["/admin", "/admin/:path*"] };

function same(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

export function middleware(req: NextRequest) {
  const password = process.env.CHAT_ADMIN_PASSWORD;
  if (!password) return new NextResponse("Not found", { status: 404 });

  const header = req.headers.get("authorization") ?? "";
  if (header.startsWith("Basic ")) {
    try {
      const decoded = atob(header.slice(6));
      const given = decoded.slice(decoded.indexOf(":") + 1);
      if (same(given, password)) {
        const res = NextResponse.next();
        res.headers.set("X-Robots-Tag", "noindex, nofollow");
        res.headers.set("Cache-Control", "private, no-store");
        return res;
      }
    } catch {
      // Malformed header: ask again.
    }
  }
  return new NextResponse("Sign in to read the conversation log.", {
    status: 401,
    headers: { "WWW-Authenticate": 'Basic realm="Conversations", charset="UTF-8"', "Cache-Control": "no-store" },
  });
}
