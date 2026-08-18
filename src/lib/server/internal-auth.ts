import { timingSafeEqual } from "node:crypto";
import { getInternalApiKey } from "@/lib/env";

/**
 * Cek header `Authorization: Bearer <key>` terhadap INTERNAL_API_KEY.
 * Perbandingan constant-time (timingSafeEqual) untuk menolak timing attack.
 */
export function verifyInternalApiKey(request: Request): boolean {
  const header = request.headers.get("authorization") ?? "";
  const [scheme, token] = header.split(" ");
  if (scheme?.toLowerCase() !== "bearer" || !token) return false;

  const expected = Buffer.from(getInternalApiKey());
  const actual = Buffer.from(token);
  if (expected.length !== actual.length) return false;

  return timingSafeEqual(expected, actual);
}
