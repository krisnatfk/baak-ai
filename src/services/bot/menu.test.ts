import { describe, expect, it } from "vitest";
import { vi } from "vitest";

vi.mock("server-only", () => ({}));
import { composeMenuSelections } from "./menu";

describe("composeMenuSelections", () => {
  it("MANUAL hanya memakai urutan pin", () => {
    expect(composeMenuSelections("MANUAL", ["a", "b", "c"], ["x"], 2)).toEqual([
      { id: "a", source: "MANUAL" }, { id: "b", source: "MANUAL" },
    ]);
  });
  it("POPULAR hanya memakai ranking popular", () => {
    expect(composeMenuSelections("POPULAR", ["a"], ["x", "y"], 2)).toEqual([
      { id: "x", source: "POPULAR" }, { id: "y", source: "POPULAR" },
    ]);
  });
  it("HYBRID mendahulukan pin, dedupe, lalu mengisi slot popular", () => {
    expect(composeMenuSelections("HYBRID", ["a", "b"], ["b", "x", "y"], 4)).toEqual([
      { id: "a", source: "PINNED" }, { id: "b", source: "PINNED" },
      { id: "x", source: "POPULAR" }, { id: "y", source: "POPULAR" },
    ]);
  });
});
