import "server-only";

import { and, eq, isNull, sql } from "drizzle-orm";
import { db } from "@/db/client";
import { chatSessions } from "@/db/schema";

export type HandoffEvent =
  | "RAG_NOT_FOUND"
  | "RAG_FOUND"
  | "GREETING"
  | "NOISE"
  | "MENU_SELECTION";

export interface HandoffTransition {
  streak: number;
  requiresHuman: boolean;
  includeDetails: boolean;
  alreadyShown: boolean;
}

export function buildHandoffDetails(
  includeDetails: boolean,
  settings: { message: string; phone?: string | null; url?: string | null },
) {
  if (!includeDetails) return null;
  return {
    message: settings.message || null,
    phone: settings.phone || null,
    url: settings.url || null,
  };
}

/** Pure policy used by tests and by the persistence layer. */
export function calculateHandoffTransition(input: {
  event: HandoffEvent;
  currentStreak: number;
  enabled: boolean;
  afterUnanswered: number;
  alreadyShown: boolean;
}): HandoffTransition {
  if (input.event === "RAG_FOUND") {
    return { streak: 0, requiresHuman: false, includeDetails: false, alreadyShown: false };
  }
  if (input.event !== "RAG_NOT_FOUND") {
    return {
      streak: input.currentStreak,
      requiresHuman: false,
      includeDetails: false,
      alreadyShown: input.alreadyShown,
    };
  }
  const streak = input.currentStreak + 1;
  const requiresHuman = input.enabled && streak >= input.afterUnanswered;
  return {
    streak,
    requiresHuman,
    includeDetails: requiresHuman && !input.alreadyShown,
    alreadyShown: input.alreadyShown || requiresHuman,
  };
}

function stateSessionId(sessionId?: string | null, sender?: string | null): string | null {
  const session = sessionId?.trim();
  if (session) return session;
  const senderId = sender?.trim();
  return senderId ? `sender:${senderId}` : null;
}

/**
 * Update streak secara atomik per session.
 * Cooldown sederhana: detail handoff hanya dikirim sekali sampai RAG_FOUND
 * mereset streak dan handoffShownAt.
 */
export async function recordRagHandoffState(input: {
  found: boolean;
  sessionId?: string | null;
  sender?: string | null;
  enabled: boolean;
  afterUnanswered: number;
}): Promise<HandoffTransition> {
  const externalSessionId = stateSessionId(input.sessionId, input.sender);
  if (!externalSessionId) {
    return calculateHandoffTransition({
      event: input.found ? "RAG_FOUND" : "RAG_NOT_FOUND",
      currentStreak: 0,
      enabled: input.enabled,
      afterUnanswered: input.afterUnanswered,
      alreadyShown: false,
    });
  }

  return db.transaction(async (tx) => {
    await tx
      .insert(chatSessions)
      .values({
        sessionId: externalSessionId,
        sender: input.sender ?? null,
        channel: "WHATSAPP",
        lastMessageAt: new Date(),
      })
      .onConflictDoNothing({ target: chatSessions.sessionId });

    if (input.found) {
      await tx
        .update(chatSessions)
        .set({ consecutiveUnanswered: 0, handoffShownAt: null })
        .where(eq(chatSessions.sessionId, externalSessionId));
      return calculateHandoffTransition({
        event: "RAG_FOUND",
        currentStreak: 0,
        enabled: input.enabled,
        afterUnanswered: input.afterUnanswered,
        alreadyShown: false,
      });
    }

    const [state] = await tx
      .update(chatSessions)
      .set({
        consecutiveUnanswered: sql`${chatSessions.consecutiveUnanswered} + 1`,
        lastMessageAt: new Date(),
      })
      .where(eq(chatSessions.sessionId, externalSessionId))
      .returning({
        id: chatSessions.id,
        streak: chatSessions.consecutiveUnanswered,
        handoffShownAt: chatSessions.handoffShownAt,
      });

    const transition = calculateHandoffTransition({
      event: "RAG_NOT_FOUND",
      // UPDATE ... RETURNING sudah berisi next count, sedangkan pure policy
      // melakukan +1 sendiri.
      currentStreak: state.streak - 1,
      enabled: input.enabled,
      afterUnanswered: input.afterUnanswered,
      alreadyShown: state.handoffShownAt != null,
    });

    if (!transition.includeDetails) return transition;
    const [marked] = await tx
      .update(chatSessions)
      .set({ handoffShownAt: new Date() })
      .where(and(eq(chatSessions.id, state.id), isNull(chatSessions.handoffShownAt)))
      .returning({ id: chatSessions.id });

    return { ...transition, includeDetails: Boolean(marked), alreadyShown: true };
  });
}
