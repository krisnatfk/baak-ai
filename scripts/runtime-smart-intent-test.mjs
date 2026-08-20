const baseUrl = process.env.BAAK_TEST_URL ?? "http://localhost:3010";
const apiKey = process.env.INTERNAL_API_KEY;
if (!apiKey) throw new Error("INTERNAL_API_KEY wajib tersedia.");
const headers = { authorization: `Bearer ${apiKey}`, "content-type": "application/json" };
const cases = [
  ["assalamualaikum", "WELCOME", null, "assalamualaikum", "Waalaikumsalam Kak 👋"],
  ["assalamualaikum kak", "WELCOME", null, "assalamualaikum", "Waalaikumsalam Kak 👋"],
  ["Assalamualaikum, Kak 👋", "WELCOME", null, "assalamualaikum", "Waalaikumsalam Kak 👋"],
  ["assalamu alaikum min", "WELCOME", null, "assalamualaikum", "Waalaikumsalam Kak 👋"],
  ["asalamualaikum", "WELCOME", null, "assalamualaikum", "Waalaikumsalam Kak 👋"],
  ["assalamualaikum wr wb", "WELCOME", null, "assalamualaikum", "Waalaikumsalam Kak 👋"],
  ["halo kak", "WELCOME", null, "halo", "Halo Kak 👋"],
  ["hallo min", "WELCOME", null, "hallo", "Halo Kak 👋"],
  ["selamat pagi kak", "WELCOME", null, "selamat pagi", "Selamat pagi Kak 👋"],
  ["permisi admin", "WELCOME", null, "permisi", "Silakan Kak 👋"],
  ["p", "WELCOME", null, null, null],
  ["biaya?", "QUESTION", "biaya?", null, null],
  ["beasiswa?", "QUESTION", "beasiswa?", null, null],
  ["assalamualaikum kak, jadwal pmb kapan?", "QUESTION", "jadwal pmb kapan?", "assalamualaikum", "Waalaikumsalam Kak 👋"],
  ["Assalamualaikum kak, saya mau tanya apakah saya bisa minta jadwal pmb", "QUESTION", "apakah saya bisa minta jadwal pmb", "assalamualaikum", "Waalaikumsalam Kak 👋"],
  ["halo kak, jadwal pmb?", "QUESTION", "jadwal pmb?", "halo", "Halo Kak 👋"],
  ["selamat pagi min, ada beasiswa?", "QUESTION", "ada beasiswa?", "selamat pagi", "Selamat pagi Kak 👋"],
  ["gedung b dimana?", "QUESTION", "gedung b dimana?", null, null],
  ["1", "MENU", "jadwal pmb?", null, null],
];
const results = [];
for (const [message, expectedRoute, expectedQuery, expectedCanonical, expectedReply] of cases) {
  const response = await fetch(`${baseUrl}/api/bot/resolve`, {
    method: "POST",
    headers,
    body: JSON.stringify({ message }),
  });
  const body = await response.json();
  if (
    !response.ok ||
    body.route !== expectedRoute ||
    body.ragQuery !== expectedQuery ||
    body.greeting?.canonical !== expectedCanonical ||
    body.greeting?.reply !== expectedReply ||
    body.greeting?.detected !== (expectedCanonical !== null)
  ) {
    throw new Error(`${message}: ${JSON.stringify(body)}`);
  }
  if (
    expectedRoute === "WELCOME" &&
    expectedReply &&
    (!body.responseText?.startsWith(expectedReply) ||
      body.responseText.split(expectedReply).length - 1 !== 1)
  ) {
    throw new Error(`${message}: responseText greeting tidak tepat: ${body.responseText}`);
  }
  results.push({
    message,
    route: body.route,
    reason: body.reason,
    normalizedMessage: body.normalizedMessage,
    ragQuery: body.ragQuery,
    greeting: body.greeting,
    method: body.matchMethod,
  });
}
console.log(JSON.stringify({ result: "RUNTIME_SMART_INTENT_PASS", cases: results }));
