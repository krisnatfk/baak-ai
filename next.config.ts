import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  output: "standalone",
  // pg is pure JS but keep it external so Next never tries to bundle it.
  // exceljs must stay external too: when bundled by Next/Turbopack, its
  // internal `xlsx.load()` stream parsing (readable-stream object-mode
  // PassThrough + saxes async generator) breaks and throws
  // "Cannot read properties of undefined (reading 'sheets')".
  serverExternalPackages: ["pg", "exceljs"],
  experimental: {
    // Form FAQ dapat membawa satu media + satu attachment (masing-masing
    // divalidasi MAX_UPLOAD_MB=15 di server), plus overhead multipart.
    serverActions: { bodySizeLimit: "32mb" },
  },
  // Langkah aman: hanya origin lokal yang boleh memanggil Server Actions.
  // Pada deployment LAN tanpa domain, biarkan origin bawaan. Sesuaikan bila
  // di belakang reverse-proxy dengan hostname lain.
  async headers() {
    return [
      {
        source: "/(.*)",
        headers: [
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
            value: "same-origin",
          },
          {
            key: "Content-Security-Policy",
            value: [
              "default-src 'self'",
              "script-src 'self' 'unsafe-inline' 'unsafe-eval'",
              "style-src 'self' 'unsafe-inline'",
              "img-src 'self' data: blob:",
              "font-src 'self' data:",
              "connect-src 'self'",
              "frame-ancestors 'none'",
              "base-uri 'self'",
              "form-action 'self'",
            ].join("; "),
          },
        ],
      },
    ];
  },
};

export default nextConfig;
