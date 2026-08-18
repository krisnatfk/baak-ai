import { NextResponse } from "next/server";
import { db } from "@/db/client";
import { sql } from "drizzle-orm";

export const dynamic = "force-dynamic";

/**
 * Healthcheck endpoint (publik).
 * Dipakai docker-compose healthcheck aplikasi. Return 200 hanya bila DB
 * bisa diakses.
 */
export async function GET() {
  try {
    await db.execute(sql`SELECT 1`);
    return NextResponse.json({ status: "ok", db: "up" }, { status: 200 });
  } catch {
    return NextResponse.json({ status: "degraded", db: "down" }, { status: 503 });
  } finally {
    // pool tetap hidup — jangan ditutup per request.
  }
}
