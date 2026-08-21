import { describe, expect, it } from "vitest";
import ExcelJS from "exceljs";
import JSZip from "jszip";
import {
  ARRAY_SEPARATOR,
  parseFaqImportFile,
  splitList,
  type ParsedFaqRow,
} from "./import-parser";
import {
  mapAudience,
  mapStatus,
  validateFaqRow,
} from "./import-validate";
import { cosineSimilarity } from "./duplicate";
import { parseJsonRobust } from "@/services/llm/client";
import { buildTemplateBuffer, buildXlsxBuffer, exportRowToCells } from "./export";

function makeRow(overrides: Partial<ParsedFaqRow> = {}): ParsedFaqRow {
  return {
    rowNumber: 2,
    question: "Bagaimana cara mendaftar PKL?",
    answer: "Ajukan surat permohonan ke BAAK.",
    category: "PKL",
    audience: "MAHASISWA",
    status: "DRAFT",
    keywords: ["PKL", "magang"],
    referenceUrl: "",
    primarySource: "Panduan PKL",
    officialSources: [],
    relatedQuestions: [],
    alternativeQuestions: [],
    media: [],
    attachments: [],
    internalNote: "",
    sourceDocument: "",
    sourcePage: "",
    validationStatus: "",
    confidence: "",
    ...overrides,
  };
}

describe("splitList", () => {
  it("memisahkan dengan separator || dan memangkas spasi", () => {
    expect(splitList("PKL || magang || praktik kerja lapangan")).toEqual([
      "PKL",
      "magang",
      "praktik kerja lapangan",
    ]);
  });

  it("aman terhadap field kosong", () => {
    expect(splitList("")).toEqual([]);
    expect(splitList("   ")).toEqual([]);
    expect(splitList("a ||  || b")).toEqual(["a", "b"]);
  });

  it("mendukung unicode Indonesia", () => {
    expect(splitList("Syarat || pendaftaran ulang || KRS")).toEqual([
      "Syarat",
      "pendaftaran ulang",
      "KRS",
    ]);
  });

  it(`menggunakan separator "${ARRAY_SEPARATOR}"`, () => {
    expect(ARRAY_SEPARATOR).toBe("||");
  });
});

describe("mapStatus", () => {
  it("memetakan alias ke enum existing", () => {
    expect(mapStatus("PUBLISHED")).toBe("ACTIVE");
    expect(mapStatus("published")).toBe("ACTIVE");
    expect(mapStatus("Aktif")).toBe("ACTIVE");
    expect(mapStatus("ARCHIVED")).toBe("INACTIVE");
    expect(mapStatus("Nonaktif")).toBe("INACTIVE");
    expect(mapStatus("DRAFT")).toBe("DRAFT");
    expect(mapStatus("needs_review")).toBe("NEEDS_REVIEW");
  });
  it("mengembalikan null untuk nilai tidak dikenal", () => {
    expect(mapStatus("random")).toBeNull();
    expect(mapStatus("")).toBeNull();
  });
});

describe("mapAudience", () => {
  it("memetakan enum + alias Indonesia", () => {
    expect(mapAudience("MAHASISWA")).toBe("MAHASISWA");
    expect(mapAudience("Calon Mahasiswa")).toBe("CALON_MAHASISWA");
    expect(mapAudience("Orang Tua")).toBe("ORANG_TUA");
    expect(mapAudience("umum")).toBe("UMUM");
  });
  it("mengembalikan null untuk tidak dikenal", () => {
    expect(mapAudience("dosen")).toBeNull();
  });
});

describe("validateFaqRow", () => {
  const ctx = { categories: new Set(["pkl", "akademik"]) };

  it("VALID bila lengkap", () => {
    const r = validateFaqRow(makeRow(), ctx);
    expect(r.status).toBe("VALID");
    expect(r.mappedStatus).toBe("DRAFT");
    expect(r.mappedAudience).toBe("MAHASISWA");
  });

  it("ERROR bila question kosong", () => {
    const r = validateFaqRow(makeRow({ question: "  " }), ctx);
    expect(r.status).toBe("ERROR");
    expect(r.message).toContain("Pertanyaan");
  });

  it("ERROR bila answer kosong", () => {
    const r = validateFaqRow(makeRow({ answer: "" }), ctx);
    expect(r.status).toBe("ERROR");
  });

  it("ERROR bila audiens tidak valid", () => {
    const r = validateFaqRow(makeRow({ audience: "DOSEN" }), ctx);
    expect(r.status).toBe("ERROR");
    expect(r.message).toContain("Audiens");
  });

  it("WARNING bila kategori belum ada", () => {
    const r = validateFaqRow(makeRow({ category: "Beasiswa Baru" }), ctx);
    expect(r.status).toBe("WARNING");
    expect(r.categoryUnknown).toBe(true);
  });

  it("default status DRAFT bila status kosong", () => {
    const r = validateFaqRow(makeRow({ status: "" }), ctx);
    expect(r.mappedStatus).toBe("DRAFT");
  });
});

describe("parseFaqImportFile (CSV)", () => {
  it("memparse CSV dengan kolom wajib + array", async () => {
    const csv = [
      "question,answer,category,audience,status,keywords,alternative_questions",
      '"Bagaimana cara daftar PKL?","Ajukan ke BAAK.",PKL,MAHASISWA,DRAFT,"PKL || magang","Gimana daftar PKL? || Cara ngajuin PKL?"',
      "Kapan cuti akademik?,Pengajuan sebelum registrasi.,Akademik,MAHASISWA,DRAFT,,,",
    ].join("\n");

    const rows = await parseFaqImportFile(Buffer.from(csv), "test.csv");
    expect(rows).toHaveLength(2);
    expect(rows[0].question).toBe("Bagaimana cara daftar PKL?");
    expect(rows[0].keywords).toEqual(["PKL", "magang"]);
    expect(rows[0].alternativeQuestions).toEqual([
      "Gimana daftar PKL?",
      "Cara ngajuin PKL?",
    ]);
    expect(rows[1].keywords).toEqual([]);
  });

  it("melempar error bila kolom question tidak ada", async () => {
    const csv = ["answer,category", "jawab,PKL"].join("\n");
    await expect(
      parseFaqImportFile(Buffer.from(csv), "test.csv"),
    ).rejects.toThrow(/question/);
  });
});

describe("parseFaqImportFile (XLSX)", () => {
  it("membaca kembali template yang dihasilkan (regresi error 'sheets')", async () => {
    // Template asli yang diunduh dari aplikasi (binary .xlsx nyata).
    const buffer = await buildTemplateBuffer(["PKL", "Akademik"]);
    const rows = await parseFaqImportFile(buffer, "template.xlsx");
    expect(rows.length).toBeGreaterThan(0);
    // Header wajib terbaca → question/answer terpetakan.
    expect(rows[0].question).toContain("[CONTOH]");
    expect(rows[0].answer).toContain("pendaftaran");
    expect(rows[0].category).toBe("Pendaftaran");
  });

  it("membaca file XLSX ber-prefix namespace (gaya generator WPS/lain)", async () => {
    // Simulasi file yang menulis semua elemen dengan prefix x: (mis. WPS
    // Office / exporter lain): <x:workbook>, <x:sheet>, <x:row>, dst.
    const buffer = await buildPrefixedXlsx(
      ["question", "answer", "category", "audience", "status"],
      [["Q ber-prefix?", "A ber-prefix.", "PKL", "MAHASISWA", "DRAFT"]],
    );
    const rows = await parseFaqImportFile(buffer, "prefixed.xlsx");
    expect(rows).toHaveLength(1);
    expect(rows[0].question).toBe("Q ber-prefix?");
    expect(rows[0].answer).toBe("A ber-prefix.");
    expect(rows[0].category).toBe("PKL");
    expect(rows[0].audience).toBe("MAHASISWA");
    expect(rows[0].status).toBe("DRAFT");
  });

  it("memprioritaskan sheet 'FAQ Import' walau bukan sheet pertama", async () => {
    const wb = new ExcelJS.Workbook();
    const guide = wb.addWorksheet("Petunjuk");
    guide.addRow(["INI BUKAN DATA"]);
    const data = wb.addWorksheet("FAQ Import");
    data.addRow(["question", "answer", "category", "audience", "status"]);
    data.addRow(["Q dari FAQ Import?", "A dari FAQ Import.", "PKL", "MAHASISWA", "DRAFT"]);
    const buffer = Buffer.from(await wb.xlsx.writeBuffer());

    const rows = await parseFaqImportFile(buffer, "multi.xlsx");
    expect(rows).toHaveLength(1);
    expect(rows[0].question).toBe("Q dari FAQ Import?");
    expect(rows[0].category).toBe("PKL");
  });

  it("fallback ke worksheet pertama bila 'FAQ Import' tidak ada", async () => {
    const buffer = await buildXlsxBuffer(
      "SheetLain",
      ["question", "answer", "category"],
      [["Q fallback?", "A fallback.", "PKL"]],
    );
    const rows = await parseFaqImportFile(buffer, "other.xlsx");
    expect(rows).toHaveLength(1);
    expect(rows[0].question).toBe("Q fallback?");
  });

  it("melempar error jelas untuk buffer kosong", async () => {
    await expect(
      parseFaqImportFile(Buffer.alloc(0), "empty.xlsx"),
    ).rejects.toThrow(/kosong|tidak ada data/i);
  });

  it("melempar error jelas untuk file yang bukan xlsx valid", async () => {
    await expect(
      parseFaqImportFile(Buffer.from("bukan konten zip"), "broken.xlsx"),
    ).rejects.toThrow(/Gagal membaca file XLSX/);
  });
});

describe("cosineSimilarity", () => {
  it("identik = 1, ortogonal = 0", () => {
    expect(cosineSimilarity([1, 0, 0], [1, 0, 0])).toBeCloseTo(1, 5);
    expect(cosineSimilarity([1, 0], [0, 1])).toBeCloseTo(0, 5);
  });
});

describe("parseJsonRobust", () => {
  it("memparse JSON murni", () => {
    expect(parseJsonRobust('[{"a":1}]')).toEqual([{ a: 1 }]);
  });
  it("memparse JSON dengan prolog/epilog", () => {
    expect(parseJsonRobust('Berikut hasil: [{"a":1}] selesai')).toEqual([
      { a: 1 },
    ]);
  });
});

// ---------------------------------------------------------------------------
// Helper — bangun XLSX ber-prefix namespace (meniru file dari WPS/lain).
// ---------------------------------------------------------------------------

async function buildPrefixedXlsx(
  headers: string[],
  rows: string[][],
): Promise<Buffer> {
  const base = await buildXlsxBuffer("FAQ Import", headers, rows);
  const zip = await JSZip.loadAsync(base);
  const out = new JSZip();
  for (const name of Object.keys(zip.files)) {
    const entry = zip.files[name];
    if (entry.dir) continue;
    let content = await entry.async("nodebuffer");
    if (
      name.endsWith(".xml") &&
      content
        .toString("utf8")
        .includes("http://schemas.openxmlformats.org/spreadsheetml/2006/main")
    ) {
      // Ubah default namespace jadi xmlns:x dan beri prefix x: pada semua
      // nama elemen (atribut seperti r:id / xml:space dibiarkan).
      const text = content
        .toString("utf8")
        .replace(
          'xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"',
          'xmlns:x="http://schemas.openxmlformats.org/spreadsheetml/2006/main"',
        )
        .replace(/(<\/?)([A-Za-z_][\w.-]*)(?=[\s>\/])/g, "$1x:$2");
      content = Buffer.from(text, "utf8");
    }
    out.file(name, content);
  }
  return Buffer.from(await out.generateAsync({ type: "nodebuffer" }));
}

describe("exportRowToCells", () => {
  it("menggabungkan array dengan separator", () => {
    const cells = exportRowToCells({
      question: "Q",
      answer: "A",
      category: "PKL",
      audience: "MAHASISWA",
      status: "DRAFT",
      keywords: ["a", "b"],
      referenceUrl: "",
      primarySource: "",
      officialSources: [{ title: "S", url: "https://x" }],
      relatedQuestions: ["r1"],
      alternativeQuestions: ["alt1"],
      media: [],
      attachments: [],
      internalNote: "",
    });
    expect(cells[5]).toBe("a || b");
    expect(cells[8]).toBe("S|https://x");
  });
});
