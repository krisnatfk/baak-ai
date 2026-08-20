import { describe, expect, it } from "vitest";
import { isNonPmbQuery, isNoiseQuery } from "./search";

describe("PMB query guard", () => {
  it.each(["PKL", "cara isi KRS", "lihat KHS", "syarat wisuda", "mengajukan cuti"])(
    "menolak layanan mahasiswa aktif: %s",
    (query) => expect(isNonPmbQuery(query)).toBe(true),
  );

  it("tidak menolak istilah yang memiliki konteks PMB eksplisit", () => {
    expect(isNonPmbQuery("biaya kuliah mahasiswa baru")).toBe(false);
  });

  it.each(["?", "aaa", "asdf", "qwerty"])("menolak noise: %s", (query) => {
    expect(isNoiseQuery(query)).toBe(true);
  });
});
