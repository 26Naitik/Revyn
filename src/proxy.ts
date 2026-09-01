import { NextRequest, NextResponse } from "next/server";

/**
 * Revyn proxy (Next.js 16 replacement for `middleware`).
 *
 * Runs before all `/api/*` requests. Layered protections are deliberately
 * lightweight and Vercel-compatible (edge runtime, no external store):
 *
 *  - Razorpay webhooks are NEVER blocked (auth/rate-limit exempt) so retries
 *    from Razorpay always get through; signature verification still happens
 *    inside the webhook route handler.
 *  - Rate limiting on the sensitive mutation endpoints.
 *  - Optional admin-token protection for all non-GET /api routes. Enabled by
 *    setting ADMIN_TOKEN. Without it, the app degrades to public (rate-limited)
 *    mode so the demo dashboard keeps working.
 *
 * Dashboard credential flow (no token in browser bundles):
 *   1. Operator opens /api/admin/unlock?token=ADMIN_TOKEN once in a browser.
 *   2. Proxy validates the token, sets an httpOnly cookie, redirects to /dashboard.
 *   3. Every dashboard button request carries the cookie and is authorized.
 *   Programmatic access: send header `x-revyn-admin-token: ADMIN_TOKEN`.
 */

const WEBHOOK_PREFIX = "/api/webhooks";
const UNLOCK_PATH = "/api/admin/unlock";
const ADMIN_COOKIE = "revyn_admin";
const COOKIE_MAX_AGE_SECONDS = 60 * 60 * 24 * 7;

const RATE_LIMITED_PREFIXES = [
  "/api/detect",
  "/api/diagnose",
  "/api/pipeline",
  "/api/simulate",
  "/api/recover",
];

const RATE_LIMIT_WINDOW_MS = 60_000;
const RATE_LIMIT_MAX_PER_WINDOW = 40;

const buckets = new Map<string, { count: number; resetAt: number }>();

function isRateLimitedPath(pathname: string): boolean {
  return RATE_LIMITED_PREFIXES.some(
    (p) => pathname === p || pathname.startsWith(`${p}/`)
  );
}

function clientIp(request: NextRequest): string {
  const forwarded = request.headers.get("x-forwarded-for");
  if (forwarded) {
    const first = forwarded.split(",")[0]?.trim();
    if (first) return first;
  }
  return request.headers.get("x-real-ip")?.trim() || "unknown";
}

function sweepBuckets(now: number): void {
  if (buckets.size > 5000) {
    for (const [ip, b] of buckets) {
      if (b.resetAt <= now) buckets.delete(ip);
    }
  }
}

/**
 * Returns remaining seconds until the limit resets, or null when allowed.
 */
function takeRateLimitSlot(request: NextRequest): number | null {
  const now = Date.now();
  sweepBuckets(now);

  const ip = clientIp(request);
  const bucket = buckets.get(ip);

  if (!bucket || bucket.resetAt <= now) {
    buckets.set(ip, { count: 1, resetAt: now + RATE_LIMIT_WINDOW_MS });
    return null;
  }

  bucket.count += 1;
  if (bucket.count > RATE_LIMIT_MAX_PER_WINDOW) {
    return Math.max(1, Math.ceil((bucket.resetAt - now) / 1000));
  }
  return null;
}

async function sha256Hex(input: string): Promise<string> {
  const data = new TextEncoder().encode(input);
  const digest = await crypto.subtle.digest("SHA-256", data);
  return Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

async function timingSafeEqual(a: string, b: string): Promise<boolean> {
  const ha = await sha256Hex(a);
  const hb = await sha256Hex(b);
  if (ha.length !== hb.length) return false;
  let diff = 0;
  for (let i = 0; i < ha.length; i += 1) {
    diff |= ha.charCodeAt(i) ^ hb.charCodeAt(i);
  }
  return diff === 0;
}

async function handleUnlock(request: NextRequest): Promise<NextResponse> {
  const adminToken = process.env.ADMIN_TOKEN?.trim();
  if (!adminToken) {
    return NextResponse.json(
      { error: "admin_not_configured" },
      { status: 503 }
    );
  }

  const token = request.nextUrl.searchParams.get("token")?.trim();
  if (!token) {
    return NextResponse.json({ error: "missing_token" }, { status: 400 });
  }

  const valid = await timingSafeEqual(token, adminToken);
  if (!valid) {
    return NextResponse.json({ error: "invalid_token" }, { status: 401 });
  }

  const response = NextResponse.redirect(
    new URL("/dashboard", request.nextUrl)
  );
  response.cookies.set({
    name: ADMIN_COOKIE,
    value: await sha256Hex(adminToken),
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: COOKIE_MAX_AGE_SECONDS,
  });
  return response;
}

async function isAuthorized(
  request: NextRequest,
  adminToken: string
): Promise<boolean> {
  const headerToken = request.headers.get("x-revyn-admin-token")?.trim();
  if (headerToken && (await timingSafeEqual(headerToken, adminToken))) {
    return true;
  }

  const cookieValue = request.cookies.get(ADMIN_COOKIE)?.value;
  if (cookieValue) {
    const expected = await sha256Hex(adminToken);
    if (await timingSafeEqual(cookieValue, expected)) {
      return true;
    }
  }

  return false;
}

let warnedMissingAdminToken = false;

export async function proxy(request: NextRequest): Promise<NextResponse> {
  const pathname = request.nextUrl.pathname;

  // Razorpay webhooks must stay reachable for Razorpay's retry delivery.
  if (pathname.startsWith(WEBHOOK_PREFIX)) {
    return NextResponse.next();
  }

  if (pathname === UNLOCK_PATH) {
    return handleUnlock(request);
  }

  const method = request.method;

  // Lightweight rate limiting on the mutation endpoints.
  if (method === "POST" && isRateLimitedPath(pathname)) {
    const retryAfter = takeRateLimitSlot(request);
    if (retryAfter !== null) {
      return NextResponse.json(
        { error: "rate_limited" },
        {
          status: 429,
          headers: { "Retry-After": String(retryAfter) },
        }
      );
    }
  }

  // Admin-token protection for all non-GET mutations when configured.
  const adminToken = process.env.ADMIN_TOKEN?.trim();
  if (adminToken && method !== "GET" && method !== "HEAD") {
    const authorized = await isAuthorized(request, adminToken);
    if (!authorized) {
      return NextResponse.json({ error: "unauthorized" }, { status: 401 });
    }
  } else if (!adminToken && method !== "GET" && method !== "HEAD") {
    if (!warnedMissingAdminToken) {
      warnedMissingAdminToken = true;
      console.warn(
        "[revyn] ADMIN_TOKEN is not set - /api mutations are unprotected (rate-limited only). " +
          "Set ADMIN_TOKEN in production to enable the admin guard."
      );
    }
  }

  return NextResponse.next();
}

export const config = {
  matcher: "/api/:path*",
};