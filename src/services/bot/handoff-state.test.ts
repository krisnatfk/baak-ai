import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
vi.mock("@/db/client", () => ({ db: {} }));

import {
  buildHandoffDetails,
  calculateHandoffTransition,
} from "./handoff-state";

const transition = (
  currentStreak: number,
  afterUnanswered: number,
  event: "RAG_NOT_FOUND" | "RAG_FOUND" | "GREETING" = "RAG_NOT_FOUND",
  alreadyShown = false,
) => calculateHandoffTransition({
  event,
  currentStreak,
  enabled: true,
  afterUnanswered,
  alreadyShown,
});

describe("human handoff consecutive streak", () => {
  beforeEach(() => vi.clearAllMocks());

  it("CASE A: threshold 1 aktif pada NOT FOUND pertama", () => {
    expect(transition(0, 1)).toMatchObject({
      streak: 1,
      requiresHuman: true,
      includeDetails: true,
    });
  });

  it("CASE B: threshold 2 aktif tepat pada NOT FOUND kedua", () => {
    const first = transition(0, 2);
    const second = transition(first.streak, 2);
    expect(first.requiresHuman).toBe(false);
    expect(second).toMatchObject({ streak: 2, requiresHuman: true, includeDetails: true });
  });

  it("CASE C: FOUND mereset streak sebelum NOT FOUND berikutnya", () => {
    const first = transition(0, 2);
    const found = transition(first.streak, 2, "RAG_FOUND");
    const afterReset = transition(found.streak, 2);
    expect(found.streak).toBe(0);
    expect(afterReset).toMatchObject({ streak: 1, requiresHuman: false });
  });

  it.each(["GREETING", "NOISE", "MENU_SELECTION"] as const)(
    "CASE D: %s tidak menaikkan atau memicu handoff",
    (event) => {
    const first = transition(0, 2);
      const neutral = calculateHandoffTransition({
        event,
        currentStreak: first.streak,
        enabled: true,
        afterUnanswered: 2,
        alreadyShown: false,
      });
      expect(neutral).toMatchObject({ streak: 1, requiresHuman: false, includeDetails: false });
    },
  );

  it("cooldown menyembunyikan detail setelah pernah ditampilkan", () => {
    expect(transition(2, 2, "RAG_NOT_FOUND", true)).toMatchObject({
      streak: 3,
      requiresHuman: true,
      includeDetails: false,
    });
  });

  it("CASE E: payload memakai message, phone, dan url dari settings", () => {
    expect(buildHandoffDetails(true, {
      message: "Silakan hubungi admin PMB.",
      phone: "628111222333",
      url: "https://pmb.example/handoff",
    })).toEqual({
      message: "Silakan hubungi admin PMB.",
      phone: "628111222333",
      url: "https://pmb.example/handoff",
    });
  });
});
