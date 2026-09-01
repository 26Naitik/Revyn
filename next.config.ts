import type { NextConfig } from "next";

/**
 * Revyn production hardening.
 *
 * Security headers are safe for the actual app the app ships:
 *  - Next.js App Router RSC payloads arrive via inline <script> blocks, so
 *    `script-src` keeps 'unsafe-inline' (no nonce plumbing in this project).
 *  - React inline `style` props (used by Recharts/SVG) need
 *    `style-src 'unsafe-inline'`.
 *  - Razorpay payment links open in a new tab on razorpay.com, so `frame-src`
 *    can stay locked down without breaking checkout.
 *  - All fonts (next/font/Inter) are self-hosted at build time; no external img
 *    or connect origins are needed.
 */
const SECURITY_HEADERS = [
  {
    key: "X-Content-Type-Options",
    value: "nosniff",
  },
  {
    key: "X-Frame-Options",
    value: "DENY",
  },
  {
    key: "Referrer-Policy",
    value: "strict-origin-when-cross-origin",
  },
  {
    key: "Permissions-Policy",
    value: "camera=(), microphone=(), geolocation=(), interest-cohort=()",
  },
  {
    key: "Content-Security-Policy",
    value: [
      "default-src 'self'",
      "script-src 'self' 'unsafe-inline'",
      "style-src 'self' 'unsafe-inline'",
      "img-src 'self' data:",
      "font-src 'self' data:",
      "connect-src 'self'",
      "object-src 'none'",
      "base-uri 'self'",
      "form-action 'self'",
      "frame-src 'none'",
      "frame-ancestors 'none'",
    ].join("; "),
  },
];

const nextConfig: NextConfig = {
  poweredByHeader: false,
  async headers() {
    return [
      {
        source: "/:path*",
        headers: SECURITY_HEADERS,
      },
    ];
  },
};

export default nextConfig;