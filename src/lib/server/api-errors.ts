import { NextResponse } from "next/server";

/**
 * Respons error standar internal API (konsisten dengan API_SPEC.md):
 *   { success: false, error: "CODE", message: "..." }
 */
export function apiError(status: number, error: string, message: string): NextResponse {
  return NextResponse.json({ success: false, error, message }, { status });
}

/** Ambil IP klien dari header proxy (n8n/WAHA biasanya lewat reverse proxy). */
export function clientIp(request: Request): string {
  const fwd = request.headers.get("x-forwarded-for");
  if (fwd) return fwd.split(",")[0].trim();
  return request.headers.get("x-real-ip") ?? "unknown";
}
