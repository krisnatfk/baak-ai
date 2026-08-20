import { eq, sql } from "drizzle-orm";
import { chatMessages, chatSessions } from "@/db/schema";
import { db } from "@/db/client";
import { isUniqueViolation } from "@/lib/server/db-errors";

export type ChatRole = "USER" | "AI" | "SYSTEM";

export interface RecordChatInput {
  /** ID sesi dari WhatsApp/n8n (bukan PK DB). */
  sessionId: string;
  sender?: string | null;
  channel?: string;
  role: ChatRole;
  content: string;
  metadata?: Record<string, unknown> | null;
  topic?: string | null;
}

/**
 * Rekam satu pesan percakapan + pastikan sesi tersedia.
 * - Jika sesi belum ada → dibuat (ACTIVE).
 * - message_count di-increment, last_message_at diperbarui.
 * - topic diisi hanya bila masih kosong (pertanyaan pertama).
 */
export async function recordChatMessage(input: RecordChatInput): Promise<void> {
  const { sessionId, sender, channel, role, content, metadata, topic } = input;

  const chatId = await ensureSession(sessionId, sender, channel);

  await db.insert(chatMessages).values({
    sessionId: chatId,
    role,
    content,
    metadata: metadata ?? null,
  });

  await db
    .update(chatSessions)
    .set({
      messageCount: sql`${chatSessions.messageCount} + 1`,
      lastMessageAt: new Date(),
      sender:
        sender != null
          ? sql`COALESCE(NULLIF(${chatSessions.sender}, ''), ${sender})`
          : undefined,
      topic:
        topic != null
          ? sql`COALESCE(NULLIF(${chatSessions.topic}, ''), ${topic})`
          : undefined,
    })
    .where(eq(chatSessions.id, chatId));
}

async function ensureSession(
  sessionId: string,
  sender?: string | null,
  channel?: string,
): Promise<string> {
  const existing = await db.query.chatSessions.findFirst({
    where: eq(chatSessions.sessionId, sessionId),
    columns: { id: true },
  });
  if (existing) return existing.id;

  try {
    const [created] = await db
      .insert(chatSessions)
      .values({
        sessionId,
        sender: sender ?? null,
        channel: channel ?? "WHATSAPP",
        lastMessageAt: new Date(),
      })
      .returning({ id: chatSessions.id });
    return created.id;
  } catch (err) {
    // Race: sesi dibuat request lain — gunakan yang sudah ada.
    if (isUniqueViolation(err)) {
      const other = await db.query.chatSessions.findFirst({
        where: eq(chatSessions.sessionId, sessionId),
        columns: { id: true },
      });
      if (other) return other.id;
    }
    throw err;
  }
}
