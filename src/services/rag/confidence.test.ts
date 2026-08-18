import { describe, expect, it } from "vitest";
import { getRagConfig } from "@/lib/env";
import { classifyConfidence } from "./confidence";

// Threshold default (jika tidak di-set via env): HIGH=0.7, MEDIUM=0.5,
// highMargin=0.02. Test membaca dari getter env agar tetap valid bila ladder
// di-override lewat .env.
const { thresholdHigh: HIGH, thresholdMedium: MEDIUM, highMargin: MARGIN } =
  getRagConfig();

describe("classifyConfidence", () => {
  it("HIGH saat skor tunggal di atas threshold HIGH", () => {
    expect(classifyConfidence(HIGH + 0.1, 1, null)).toBe("HIGH");
  });

  it("HIGH saat selisih #1 dan #2 >= highMargin", () => {
    const top = HIGH + 0.15;
    const second = top - MARGIN; // selisih tepat highMargin
    expect(classifyConfidence(top, 2, second)).toBe("HIGH");
  });

  it("HIGH saat selisih #1 dan #2 di atas highMargin", () => {
    expect(classifyConfidence(HIGH + 0.2, 2, HIGH)).toBe("HIGH");
  });

  it("MEDIUM saat skor tunggal di atas threshold HIGH tapi margin gagal", () => {
    // Dua hasil saling berdekatan → margin < highMargin → turun ke MEDIUM.
    expect(classifyConfidence(HIGH + 0.1, 2, HIGH + 0.099)).toBe("MEDIUM");
  });

  it("MEDIUM saat skor tunggal di antara MEDIUM dan HIGH", () => {
    expect(classifyConfidence(MEDIUM + 0.05, 1, null)).toBe("MEDIUM");
  });

  it("LOW saat skor di bawah threshold MEDIUM", () => {
    expect(classifyConfidence(MEDIUM - 0.1, 1, null)).toBe("LOW");
  });

  it("LOW saat tidak ada hasil (skor 0)", () => {
    expect(classifyConfidence(0, 0, null)).toBe("LOW");
  });

  it("LOW saat hasil kedua membuat margin melebihi batas walau di atas HIGH", () => {
    // Skor #1 di atas HIGH tapi #2 sangat dekat → margin gagal → MEDIUM, bukan HIGH.
    const top = HIGH + 0.01;
    const second = top - MARGIN + 0.001; // margin sedikit di bawah highMargin
    expect(classifyConfidence(top, 2, second)).toBe("MEDIUM");
  });

  it("edge: skor tepat sama dengan threshold HIGH dihitung HIGH (>=)", () => {
    expect(classifyConfidence(HIGH, 1, null)).toBe("HIGH");
  });

  it("edge: skor tepat sama dengan threshold MEDIUM dihitung MEDIUM (>=)", () => {
    expect(classifyConfidence(MEDIUM, 1, null)).toBe("MEDIUM");
  });
});
