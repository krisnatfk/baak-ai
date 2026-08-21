import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  resolve: vi.fn(),
  record: vi.fn(),
}));
vi.mock("@/lib/server/internal-auth", () => ({ verifyInternalApiKey: () => true }));
vi.mock("@/lib/server/rate-limit", () => ({ rateLimit: () => ({ allowed: true }) }));
vi.mock("@/lib/server/api-errors", () => ({
  clientIp: () => "test",
  apiError: (status: number, error: string, message: string) => Response.json({ error, message }, { status }),
}));
vi.mock("@/services/bot/resolver", () => ({ resolveBotMessage: mocks.resolve }));
vi.mock("@/lib/server/chat", () => ({ recordChatMessage: mocks.record }));

import { POST } from "./route";

const welcome = {
  success: true,
  route: "WELCOME",
  reason: "GREETING",
  normalizedMessage: "halo kak",
  responseText: "Halo Kak",
  ragQuery: null,
  resolvedMenuItem: null,
  requiresHuman: false,
  botStatus: "ACTIVE",
  matchedCanonicalRule: "halo",
  matchMethod: "NORMALIZED",
  greeting: { detected: true, canonical: "halo", reply: "Halo Kak" },
};

function request(body: unknown) {
  return new Request("http://localhost/api/bot/resolve", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}

describe("POST /api/bot/resolve conversation capture", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.resolve.mockResolvedValue(welcome);
    mocks.record.mockResolvedValue(undefined);
  });

  it("mencatat USER dan AI untuk WELCOME jika session tersedia", async () => {
    const response = await POST(request({ message: "halo kak", sessionId: "wa-1", sender: "6281" }));
    expect((await response.json()).conversationRecorded).toBe(true);
    expect(mocks.record).toHaveBeenNthCalledWith(1, expect.objectContaining({ sessionId: "wa-1", role: "USER", content: "halo kak" }));
    expect(mocks.record).toHaveBeenNthCalledWith(2, expect.objectContaining({ sessionId: "wa-1", role: "AI", content: "Halo Kak" }));
  });

  it("menerima alias sender dan membuat fallback session", async () => {
    const response = await POST(request({ message: "halo", from: "6282" }));
    expect((await response.json()).conversationRecorded).toBe(true);
    expect(mocks.record).toHaveBeenCalledWith(expect.objectContaining({ sessionId: "sender:6282", sender: "6282" }));
  });

  it("tidak menggandakan QUESTION yang akan dicatat oleh RAG", async () => {
    mocks.resolve.mockResolvedValue({ ...welcome, route: "QUESTION", reason: "QUESTION", responseText: null, ragQuery: "biaya?" });
    const response = await POST(request({ message: "biaya?", sessionId: "wa-2" }));
    expect((await response.json()).conversationRecorded).toBe(false);
    expect(mocks.record).not.toHaveBeenCalled();
  });

  it("mencatat USER untuk THANKS jika session tersedia", async () => {
    mocks.resolve.mockResolvedValue({
      ...welcome,
      route: "THANKS",
      reason: "THANKS",
      responseText: null,
      ragQuery: null,
      normalizedMessage: "terima kasih kak",
    });
    const response = await POST(request({ message: "terima kasih kak", sessionId: "wa-3", sender: "6283" }));
    expect((await response.json()).conversationRecorded).toBe(true);
    expect(mocks.record).toHaveBeenCalledWith(expect.objectContaining({ sessionId: "wa-3", role: "USER", content: "terima kasih kak" }));
  });
});
