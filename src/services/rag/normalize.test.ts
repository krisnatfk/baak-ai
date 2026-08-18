import { describe, expect, it } from "vitest";
import { normalizeText } from "./normalize";

describe("normalizeText", () => {
  it("menurunkan kapitalisasi", () => {
    expect(normalizeText("SIDANG SKRIPSI Semester Ganjil")).toBe(
      "sidang skripsi semester ganjil",
    );
  });

  it("melakukan NFKC normalization (fullwidth → ASCII)", () => {
    expect(normalizeText("Ｊａｄｗａｌ Ｕｊｉａｎ")).toBe("jadwal ujian");
  });

  it("menggabungkan karakter combining accent (NFKC)", () => {
    expect(normalizeText("kafé")).toBe("kafé");
  });

  it("menyeragamkan tanda kutip", () => {
    expect(normalizeText("“kutipan” dan ‘kutip’")).toBe(
      '"kutipan" dan \'kutip\'',
    );
    expect(normalizeText("teks — pemisah")).toBe("teks - pemisah");
  });

  it("membuang emoji", () => {
    expect(normalizeText("halo 😀 apa kabar 🎉")).toBe("halo apa kabar");
  });

  it("membuang simbol di luar allowlist", () => {
    expect(normalizeText("biaya § 100")).toBe("biaya 100");
  });

  it("mempertahankan tanda baca dasar", () => {
    expect(normalizeText('"sidang, 2024/2025" (A-)?')).toBe(
      '"sidang, 2024/2025" (a-)?',
    );
  });

  it("meratakan spasi ganda dan whitespace", () => {
    expect(normalizeText("a   b\t\tc")).toBe("a b c");
  });

  it("memotong spasi di ujung string", () => {
    expect(normalizeText("  berapa biaya herregistrasi?  ")).toBe(
      "berapa biaya herregistrasi?",
    );
  });

  it("mengembalikan string kosong untuk input kosong", () => {
    expect(normalizeText("")).toBe("");
  });

  it("idempotent — hasil normalisasi sama bila dipanggil dua kali", () => {
    const once = normalizeText("Her-Registrasi (Lulusan) — 2024");
    const twice = normalizeText(once);
    expect(once).toBe(twice);
  });
});
