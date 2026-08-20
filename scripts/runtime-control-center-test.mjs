const base = process.env.BAAK_TEST_URL ?? "http://localhost:3010";
const headers = { authorization: `Bearer ${process.env.INTERNAL_API_KEY}`, "content-type": "application/json" };
const request = async (path, options = {}) => { const response = await fetch(base + path, { ...options, headers: { ...headers, ...(options.headers ?? {}) } }); return { status: response.status, body: await response.json() }; };
const post = (path, body) => request(path, { method: "POST", body: JSON.stringify(body) });
const health = await fetch(base + "/api/health");
const config = await request("/api/bot/config");
const menu = await request("/api/bot/menu");
const resolve = {};
for (const message of ["halo", "hallo", "assalamualaikum", "p", "....", "biaya?", "berapa biaya kuliah?", "1", "999"]) resolve[message] = await post("/api/bot/resolve", { message });
const known = await post("/api/rag/context", { message: "kapan libur semester?" });
const unknown = await post("/api/rag/context", { message: "tiket konser antariksa" });
const similar = await post("/api/rag/context", { message: "informasi jadwal dan brosur PMB" });
const result = {
  health: health.status,
  config: { status: config.status, keys: Object.keys(config.body.config), leaked: Object.keys(config.body.config).filter((key) => /secret|key|password|credential/i.test(key)) },
  menu: { status: menu.status, mode: menu.body.mode, count: menu.body.items.length, legacyCount: menu.body.menu.length },
  resolve: Object.fromEntries(Object.entries(resolve).map(([key, value]) => [key, { status: value.status, route: value.body.route, reason: value.body.reason, faqId: value.body.resolvedMenuItem?.faqId ?? null }])),
  known: { status: known.status, found: known.body.found, error: known.body.error, media: known.body.media?.length ?? null, attachments: known.body.attachments?.length ?? null, suggestions: known.body.suggestions },
  unknown: { status: unknown.status, found: unknown.body.found, context: unknown.body.context?.slice(0, 180), suggestions: unknown.body.suggestions, requiresHuman: unknown.body.requiresHuman, menuCount: unknown.body.menu?.length ?? null },
  similar: { status: similar.status, found: similar.body.found, score: similar.body.score, suggestions: similar.body.suggestions },
};
if ([health.status, config.status, menu.status, ...Object.values(resolve).map((value) => value.status), known.status, unknown.status, similar.status].some((status) => status !== 200)) throw new Error(JSON.stringify(result));
if (result.config.leaked.length > 0) throw new Error(`Config membocorkan field: ${result.config.leaked.join(", ")}`);
console.log(JSON.stringify(result));
