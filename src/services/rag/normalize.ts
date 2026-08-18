/**
 * Normalisasi teks sebelum di-embed atau dicari.
 *
 * Tujuan: kueri dan isi knowledge base diubah lewat transformasi yang SAMA,
 * sehingga pencarian cosine lebih stabil. Aturan:
 *  - lowercase (pertahankan karakter beraksen Indonesia: é, è, dll.)
 *  - NFKC (menggabungkan gabungan Unicode, mis. a + combining-acute → á)
 *  - seragamkan tanda kutip, strip, koma, dan spasi
 *  - buang emoji dan spasi berlebih
 */

const QUOTE_REPLACEMENTS: Array<[RegExp, string]> = [
  [/[‘’′`]/g, "'"],
  [/[“”″„]/g, '"'],
  [/[–—]/g, "-"],
  [/[，、]/g, ","],
  [/[    ]/g, " "],
];

export function normalizeText(input: string): string {
  let s = input.normalize("NFKC");
  for (const [re, replacement] of QUOTE_REPLACEMENTS) {
    s = s.replace(re, replacement);
  }
  // Buang emoji (presentation emoji + ZWJ sequences).
  s = s.replace(/\p{Emoji_Presentation}|\p{Emoji}️/gu, " ");
  // Buang kontrol/simbol aneh, sisakan huruf/angka/spasi dan karakter dasar.
  s = s.replace(/[^\p{L}\p{N}\s'",.\-/()#:&@_%?!=+*[\]$€£]/gu, " ");
  s = s.toLowerCase();
  s = s.replace(/[ \t]+/g, " ");
  s = s.replace(/\s+$/g, "");
  return s.trim();
}
