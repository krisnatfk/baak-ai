/**
 * Chunking teks dokumen untuk RAG (pure function — mudah diuji).
 *
 * Strategi:
 * 1. Normalisasi line-ending (\r\n → \n) dan gabungkan baris kosong berlebih.
 * 2. Pecah teks per paragraf (dipisah oleh baris kosong).
 * 3. Paragraf yang lebih panjang dari batas dipecah pada batas kalimat.
 * 4. Paragraf digabung secara serakah ke dalam chunk dengan perkiraan token
 *    maksimum `maxTokens` (heuristik: karakter ÷ 4).
 *
 * Estimasi token murni heuristik — cukup untuk memastikan setiap chunk tidak
 * terlalu besar untuk model embedding, bukan pengganti tokenizer asli.
 */

export const DEFAULT_MAX_TOKENS = 700;
export const DEFAULT_CHARS_PER_TOKEN = 4;

export interface Chunk {
  content: string;
  tokenEstimate: number;
}

export interface ChunkOptions {
  /** Target maksimum token per chunk. */
  maxTokens?: number;
  /** Heuristik karakter per token (default 4). */
  charsPerToken?: number;
}

/** Estimasi jumlah token dari panjang teks (heuristik karakter ÷ 4). */
export function estimateTokens(
  text: string,
  charsPerToken = DEFAULT_CHARS_PER_TOKEN,
): number {
  return Math.max(1, Math.ceil(text.length / charsPerToken));
}

/** Normalisasi line-ending dan paragraf agar konsisten antar format file. */
export function normalizeParagraphs(text: string): string {
  return text.replace(/\r\n/g, "\n").replace(/\n{3,}/g, "\n\n").trim();
}

/**
 * Pecah teks menjadi chunk. Mengembalikan array kosong bila teks kosong.
 * Setiap chunk memiliki `content` (trimmed) dan `tokenEstimate`.
 */
export function chunkText(text: string, options: ChunkOptions = {}): Chunk[] {
  const maxTokens = options.maxTokens ?? DEFAULT_MAX_TOKENS;
  const charsPerToken = options.charsPerToken ?? DEFAULT_CHARS_PER_TOKEN;
  const maxChars = Math.max(1, maxTokens * charsPerToken);

  const normalized = normalizeParagraphs(text);
  if (!normalized) return [];

  const paragraphs = normalized.split(/\n{2,}/);

  const chunks: Chunk[] = [];

  const pushChunk = (content: string) => {
    const trimmed = content.trim();
    if (!trimmed) return;
    chunks.push({
      content: trimmed,
      tokenEstimate: estimateTokens(trimmed, charsPerToken),
    });
  };

  let current = "";
  let currentChars = 0;

  for (const paragraph of paragraphs) {
    const pieces = splitLongParagraph(paragraph, maxChars);
    for (const piece of pieces) {
      const pieceChars = piece.length;

      // Chunk penuh? Tutup chunk berjalan sebelum menambahkan potongan baru.
      if (currentChars > 0 && currentChars + pieceChars > maxChars) {
        pushChunk(current);
        current = "";
        currentChars = 0;
      }

      if (pieceChars > maxChars) {
        // Potongan tetap lebih panjang dari batas → pecah per kata.
        for (const word of piece.split(/\s+/)) {
          if (currentChars > 0 && currentChars + word.length + 1 > maxChars) {
            pushChunk(current);
            current = "";
            currentChars = 0;
          }
          current += (current ? " " : "") + word;
          currentChars = current.length;
        }
        continue;
      }

      current += (current ? "\n\n" : "") + piece;
      currentChars = current.length;
    }
  }
  pushChunk(current);

  return chunks;
}

/**
 * Pecah satu paragraf panjang menjadi potongan berbatas kalimat
 * (pemisah `.`, `!`, `?`, `…` diikuti spasi). Kalimat yang sendiri lebih
 * panjang dari `maxChars` tetap dipertahankan utuh — diproses lebih lanjut
 * oleh word-splitting di `chunkText`.
 */
function splitLongParagraph(paragraph: string, maxChars: number): string[] {
  if (paragraph.length <= maxChars) return [paragraph];

  const sentences = paragraph.split(/(?<=[.!?…])\s+/);
  const pieces: string[] = [];
  let buf = "";

  for (const sentence of sentences) {
    if (buf && buf.length + sentence.length + 1 > maxChars) {
      pieces.push(buf);
      buf = sentence;
    } else {
      buf += (buf ? " " : "") + sentence;
    }
  }
  if (buf) pieces.push(buf);

  return pieces.length > 0 ? pieces : [paragraph];
}
