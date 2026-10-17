import type { NextConfig } from "next";

const isDev = process.env.NODE_ENV !== "production";

const csp = [
  "default-src 'self'",
  // Next.js injects inline bootstrap scripts; Snap Kit powers the Snapchat button.
  `script-src 'self' 'unsafe-inline' ${isDev ? "'unsafe-eval'" : ""} https://sdk.snapkit.com`,
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data: blob: https://*.snapchat.com https://*.snapkit.com",
  "font-src 'self' data:",
  "connect-src 'self' https://*.snapkit.com https://*.snapchat.com",
  "frame-src https://*.snapchat.com https://*.snapkit.com",
  "media-src 'self' blob:",
  "frame-ancestors 'none'",
  "base-uri 'self'",
  "form-action 'self'",
].join("; ");

const nextConfig: NextConfig = {
  reactStrictMode: true,
  poweredByHeader: false,
  transpilePackages: ["@venix/core", "@venix/database", "@venix/game-2d", "@venix/sharing", "@venix/analytics"],
  serverExternalPackages: ["postgres"],
  outputFileTracingIncludes: {
    "/api/scorecard/[code]": ["./node_modules/@fontsource/bricolage-grotesque/files/*-latin-800-normal.woff", "./node_modules/@fontsource/bricolage-grotesque/files/*-latin-700-normal.woff"],
    "/c/[code]/opengraph-image": ["./node_modules/@fontsource/bricolage-grotesque/files/*-latin-800-normal.woff", "./node_modules/@fontsource/bricolage-grotesque/files/*-latin-700-normal.woff"],
  },
  async headers() {
    return [
      {
        source: "/:path*",
        headers: [
          { key: "Content-Security-Policy", value: csp },
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
          { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=(), interest-cohort=()" },
          { key: "Strict-Transport-Security", value: "max-age=31536000; includeSubDomains" },
        ],
      },
    ];
  },
};

export default nextConfig;
