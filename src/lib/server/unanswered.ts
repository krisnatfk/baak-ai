import { and, eq, sql } from "drizzle-orm";
import { unansweredQuestions, type UnansweredQuestion } from "@/db/schema";
import { db } from "@/db/client";
import { isUniqueViolation } from "@/lib/server/db-errors";

export interface SaveUnansweredInput {
  question: string;
  /** Versi ternormalisasi (kelas-aware) — dasar dedup partial unique. */
  normalizedQuestion: string;
  sender?: string | null;
  sessionId?: string | null;
  bestSimilarityScore?: number | null;
}

export interface SaveUnansweredResult {
  id: string;
  timesAsked: number;
  status: UnansweredQuestion["status"];
}

/**
 * Simpan pertanyaan yang tidak terjawab (confidence LOW).
 *
 * Dedup memakai partial unique index `unanswered_questions_new_unique`
 * (lower(normalized_question) WHERE status='NEW'): pertanyaan yang sama
 * menaikkan `times_asked` + memperbarui skor tertinggi, tanpa membuat duplikat.
 */
export async function saveUnanswered(
  input: SaveUnansweredInput,
): Promise<SaveUnansweredResult> {
  const { question, normalizedQuestion, sender, sessionId, bestSimilarityScore } =
    input;

  try {
    const [row] = await db
      .insert(unansweredQuestions)
      .values({
        question,
        normalizedQuestion,
        sender: sender ?? null,
        sessionId: sessionId ?? null,
        bestSimilarityScore:
          bestSimilarityScore != null ? String(bestSimilarityScore) : null,
        timesAsked: 1,
        status: "NEW",
      })
      .returning({
        id: unansweredQuestions.id,
        timesAsked: unansweredQuestions.timesAsked,
        status: unansweredQuestions.status,
      });
    return row;
  } catch (err) {
    if (!isUniqueViolation(err)) throw err;

    // Konflik dedup: baris NEW yang sama sudah ada → increment + max(score).
    const scoreClause =
      bestSimilarityScore != null
        ? {
            bestSimilarityScore: sql`CASE
              WHEN ${unansweredQuestions.bestSimilarityScore} IS NULL
                OR ${String(bestSimilarityScore)}::numeric > ${unansweredQuestions.bestSimilarityScore}
              THEN ${String(bestSimilarityScore)}::numeric
              ELSE ${unansweredQuestions.bestSimilarityScore}
            END`,
          }
        : {};

    const updates = {
      timesAsked: sql`${unansweredQuestions.timesAsked} + 1`,
      ...scoreClause,
    };

    const [row] = await db
      .update(unansweredQuestions)
      .set(updates)
      .where(
        and(
          eq(
            sql`lower(${unansweredQuestions.normalizedQuestion})`,
            sql`lower(${normalizedQuestion})`,
          ),
          eq(unansweredQuestions.status, "NEW"),
        ),
      )
      .returning({
        id: unansweredQuestions.id,
        timesAsked: unansweredQuestions.timesAsked,
        status: unansweredQuestions.status,
      });

    // Baris tidak ditemukan (status berubah seketika) — insert ulang apa adanya.
    if (!row) {
      const [fresh] = await db
        .insert(unansweredQuestions)
        .values({
          question,
          normalizedQuestion,
          sender: sender ?? null,
          sessionId: sessionId ?? null,
          bestSimilarityScore:
            bestSimilarityScore != null ? String(bestSimilarityScore) : null,
          timesAsked: 1,
          status: "NEW",
        })
        .returning({
          id: unansweredQuestions.id,
          timesAsked: unansweredQuestions.timesAsked,
          status: unansweredQuestions.status,
        });
      return fresh;
    }

    return row;
  }
}
