const baseUrl = process.env.BAAK_TEST_URL ?? "http://localhost:3010";
const apiKey = process.env.INTERNAL_API_KEY;
if (!apiKey) throw new Error("INTERNAL_API_KEY wajib tersedia.");
const headers = { authorization: `Bearer ${apiKey}`, "content-type": "application/json" };
const cases = [
  ["assalamualaikum", "WELCOME", null],
  ["assalamualaikum kak", "WELCOME", null],
  ["Assalamualaikum, Kak 👋", "WELCOME", null],
  ["assalamu alaikum min", "WELCOME", null],
  ["asalamualaikum", "WELCOME", null],
  ["assalamualaikum wr wb", "WELCOME", null],
  ["halo kak", "WELCOME", null],
  ["hallo min", "WELCOME", null],
  ["selamat pagi kak", "WELCOME", null],
  ["permisi admin", "WELCOME", null],
  ["p", "WELCOME", null],
  ["biaya?", "QUESTION", "biaya?"],
  ["beasiswa?", "QUESTION", "beasiswa?"],
  ["assalamualaikum kak, berapa biaya kuliah?", "QUESTION", "berapa biaya kuliah?"],
  ["halo min kapan pendaftaran dibuka?", "QUESTION", "kapan pendaftaran dibuka?"],
  ["selamat pagi kak, apakah ada beasiswa?", "QUESTION", "apakah ada beasiswa?"],
  ["gedung b dimana?", "QUESTION", "gedung b dimana?"],
  ["1", "MENU", "jadwal pmb?"],
];
const results = [];
for (const [message, expectedRoute, expectedQuery] of cases) {
  const response = await fetch(`${baseUrl}/api/bot/resolve`, {
    method: "POST",
    headers,
    body: JSON.stringify({ message }),
  });
  const body = await response.json();
  if (!response.ok || body.route !== expectedRoute || body.ragQuery !== expectedQuery) {
    throw new Error(`${message}: ${JSON.stringify(body)}`);
  }
  results.push({
    message,
    route: body.route,
    reason: body.reason,
    normalizedMessage: body.normalizedMessage,
    ragQuery: body.ragQuery,
    canonical: body.matchedCanonicalRule,
    method: body.matchMethod,
  });
}
console.log(JSON.stringify({ result: "RUNTIME_SMART_INTENT_PASS", cases: results }));
