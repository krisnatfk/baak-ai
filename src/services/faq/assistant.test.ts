import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
import { factPreservationIssues } from "./assistant";

describe("factPreservationIssues", () => {
  const original = "Pendaftaran dilakukan online melalui website PMB.";

  it("menerima perbaikan bahasa tanpa fakta baru", () => {
    expect(
      factPreservationIssues(
        original,
        "Pendaftaran mahasiswa baru dapat dilakukan secara online melalui website PMB.",
      ),
    ).toEqual([]);
  });

  it.each([
    ["biaya", "Pendaftaran dilakukan online dengan biaya Rp 200.000."],
    ["tanggal", "Pendaftaran dilakukan online pada tanggal 1 September."],
    ["syarat", "Pendaftaran dilakukan online dengan syarat membawa KTP."],
    ["nomor", "Hubungi nomor WhatsApp 08123456789 untuk mendaftar."],
    ["URL", "Daftar melalui https://contoh.invalid."],
  ])("menolak tambahan %s", (_label, suggestion) => {
    expect(factPreservationIssues(original, suggestion).length).toBeGreaterThan(0);
  });
});
