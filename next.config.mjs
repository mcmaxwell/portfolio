/** @type {import('next').NextConfig} */

// Content-Security-Policy — allows what the site actually uses:
// - self for app code/styles/fonts (next/font self-hosts)
// - OpenAI Realtime (ephemeral token + SDP POST to api.openai.com)
// - Google Analytics (gtag)
// WebRTC media (mic/audio) is not governed by CSP; the mic is gated by
// Permissions-Policy below.
// Next.js dev (React Fast Refresh) needs 'unsafe-eval'; production bundles
// don't, so we only relax it in development.
const isDev = process.env.NODE_ENV !== "production";
const scriptSrc = [
  "script-src 'self' 'unsafe-inline'",
  // 'wasm-unsafe-eval' lets three.js instantiate its KTX2 texture transcoder
  // (WebAssembly) without allowing general eval. Dev additionally needs
  // 'unsafe-eval' for React Fast Refresh.
  "'wasm-unsafe-eval'",
  isDev ? "'unsafe-eval'" : "",
  "https://www.googletagmanager.com",
]
  .filter(Boolean)
  .join(" ");

const csp = [
  "default-src 'self'",
  "base-uri 'self'",
  "object-src 'none'",
  "frame-ancestors 'none'",
  scriptSrc,
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data: blob: https://www.googletagmanager.com https://www.google-analytics.com",
  "font-src 'self' data:",
  "connect-src 'self' blob: data: https://api.openai.com https://*.openai.com https://www.google-analytics.com https://region1.google-analytics.com https://www.googletagmanager.com",
  "media-src 'self' blob:",
  "worker-src 'self' blob:",
  "manifest-src 'self'",
].join("; ");

const securityHeaders = [
  { key: "Content-Security-Policy", value: csp },
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "X-Frame-Options", value: "DENY" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  {
    key: "Permissions-Policy",
    value: "microphone=(self), camera=(), geolocation=(), browsing-topics=()",
  },
  {
    key: "Strict-Transport-Security",
    value: "max-age=63072000; includeSubDomains; preload",
  },
];

const nextConfig = {
  async headers() {
    return [{ source: "/:path*", headers: securityHeaders }];
  },
};

export default nextConfig;
