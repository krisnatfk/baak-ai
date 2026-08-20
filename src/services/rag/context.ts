import { getRagConfig } from "@/lib/env";
import type { SearchResult } from "./search";

export interface RagContextAssets {
  media?: Array<{ caption?: string | null }>;
  attachments?: Array<{ title: string; fileName: string }>;
}

/**
 * Bangun prompt konteks untuk LLM (n8n / bot WhatsApp).
 *
 * Anti-halusinasi: model menjawab HANYA dari blok knowledge base, dalam bahasa
 * Indonesia, dan mengakui ketidaktahuan bila jawaban tidak ada di konteks.
 * Prompt TIDAK memuat ID, skor kemiripan, atau detail internal apa pun.
 */
export function buildRagContext(
  results: SearchResult[],
  assets: RagContextAssets = {},
): string {
  const blocks = results
    .map((r, i) => {
      const lines = [
        `Sumber ${i + 1}:`,
        r.type === "CHUNK"
          ? `[Dokumen] ${r.source ?? "Tanpa sumber"}`
          : `[FAQ] ${r.question}`,
        r.answer,
      ];
      return lines.join("\n");
    })
    .join("\n\n");

  const parts: string[] = [];

  parts.push(
    "Kamu adalah asisten virtual resmi Penerimaan Mahasiswa Baru (PMB) Universitas Teknokrat Indonesia. " +
      "Jawablah pertanyaan calon mahasiswa, orang tua/wali, dan masyarakat umum dengan bahasa Indonesia yang ramah, sopan, jelas, dan singkat.",
  );

  parts.push("=== KNOWLEDGE BASE ===");

  if (results.length === 0) {
    parts.push(
      "(Tidak ada data relevan pada knowledge base informasi penerimaan mahasiswa baru — jangan berasumsi atau mengarang informasi. " +
        "Bila tidak ada jawaban di konteks, katakan secara jujur bahwa informasi tersebut belum tersedia di database informasi penerimaan mahasiswa baru kami.)",
    );
  } else {
    parts.push(blocks);
  }

  parts.push("=== AKHIR KNOWLEDGE BASE ===");

  const media = assets.media ?? [];
  const attachments = assets.attachments ?? [];
  if (media.length > 0 || attachments.length > 0) {
    const assetLines = [
      "Aset berikut akan dikirim oleh sistem WhatsApp setelah jawaban teks:",
      ...media.map(
        (item, index) =>
          `- Gambar ${index + 1}${item.caption?.trim() ? `: ${item.caption.trim()}` : ""}`,
      ),
      ...attachments.map(
        (item, index) =>
          `- Lampiran ${index + 1}: ${item.title} (${item.fileName})`,
      ),
    ];
    parts.push(
      `=== ASET TERLAMPIR ===\n${assetLines.join("\n")}\n=== AKHIR ASET TERLAMPIR ===`,
    );
  }

  parts.push(
    "Aturan Wajib:\n" +
      "1. Gunakan HANYA informasi yang terdapat pada KNOWLEDGE BASE di atas.\n" +
      "2. DILARANG mengarang informasi mengenai biaya kuliah/pendaftaran, tanggal/jadwal, syarat pendaftaran, program studi, jalur penerimaan, beasiswa, atau ketentuan lain yang tidak tertulis pada KNOWLEDGE BASE.\n" +
      "3. DILARANG menambahkan fakta umum atau asumsi di luar konteks.\n" +
      "4. DILARANG mencampur informasi layanan mahasiswa aktif (seperti PKL, KRS, Wisuda, KHS).\n" +
      "5. Jika informasi tidak tersedia pada KNOWLEDGE BASE dan tidak tersedia pada ASET TERLAMPIR, katakan secara jujur dan sopan bahwa informasi tersebut belum tersedia di database informasi penerimaan mahasiswa baru kami, dan sarankan untuk menghubungi panitia PMB / admin Universitas Teknokrat Indonesia.\n" +
      "6. Jika jawaban KNOWLEDGE BASE mengarahkan pengguna untuk melihat gambar/file dan bagian ASET TERLAMPIR tersedia, JANGAN mengatakan informasi tidak tersedia. Beri tahu pengguna secara singkat untuk melihat gambar atau lampiran yang dikirim setelah pesan ini. Jangan menuliskan URL internal aset.\n" +
      "7. Tulis hanya isi jawaban. JANGAN membuka dengan salam atau greeting seperti Halo, Hai, Assalamualaikum, Waalaikumsalam, atau Selamat pagi/siang/sore/malam. Sistem akan menambahkan greeting yang sesuai secara terpisah bila pengguna memang mengirim greeting.",
  );

  return parts.join("\n\n");
}

export function confidenceThresholds(): { high: number; medium: number } {
  const { thresholdHigh, thresholdMedium } = getRagConfig();
  return {
    high: thresholdHigh,
    medium: thresholdMedium,
  };
}
