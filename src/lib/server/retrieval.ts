/**
 * Pencatatan retrieval ke `retrieval_logs` (server-only).
 *
 * Dipanggil dari route internal `/api/rag/search` dan `/api/rag/context`
 * sebagai efek samping (best-effort — kegagalan log tidak menggagalkan
 * respons RAG, hanya dicatat lewat console.error).
 */
import { db } from "@/db/client";
import { retrievalLogs } from "@/db/schema";

export interface LogRetrievalInput {
  query: string;
  sessionId?: string | null;
  sender?: string | null;
  embedTimeMs?: number | null;
  searchTimeMs?: number | null;
  topScore?: number | null;
  confidence?: string | null;
  bestKnowledgeId?: string | null;
  bestSourceType?: string | null;
  topScores?: Array<Record<string, unknown>> | null;
  thresholdHigh?: number | null;
  thresholdMedium?: number | null;
  resultCount: number;
}

/** Bulatkan ke 4 desimal untuk kolom numeric(6,4). */
function round4(n?: number | null): string | null {
  return n == null ? null : n.toFixed(4);
}

/** Simpan satu baris retrieval_logs. */
export async function logRetrieval(input: LogRetrievalInput): Promise<void> {
  await db.insert(retrievalLogs).values({
    query: input.query,
    sessionId: input.sessionId ?? null,
    sender: input.sender ?? null,
    embedTimeMs: input.embedTimeMs ?? null,
    searchTimeMs: input.searchTimeMs ?? null,
    topScore: round4(input.topScore),
    confidence: input.confidence ?? null,
    bestKnowledgeId: input.bestKnowledgeId ?? null,
    bestSourceType: input.bestSourceType ?? null,
    topScores: input.topScores ?? null,
    thresholdHigh: round4(input.thresholdHigh),
    thresholdMedium: round4(input.thresholdMedium),
    resultCount: input.resultCount,
  });
}
