import pg from "pg";

const baseUrl = process.env.BAAK_TEST_URL ?? "http://localhost:3010";
const apiKey = process.env.INTERNAL_API_KEY;
if (!apiKey) throw new Error("INTERNAL_API_KEY wajib tersedia.");
const headers = { authorization: `Bearer ${apiKey}`, "content-type": "application/json" };
const client = new pg.Client({ connectionString: process.env.DATABASE_URL });
const token = `handoff-e2e-${Date.now()}`;
const sessions = ["a", "b", "c", "d"].map((suffix) => `${token}-${suffix}`);
const unknown = (label) => `opera plutonium ${token} ${label}`;
const post = async (path, body) => {
  const response = await fetch(`${baseUrl}${path}`, { method: "POST", headers, body: JSON.stringify(body) });
  const payload = await response.json();
  if (!response.ok) throw new Error(`${path} ${response.status}: ${JSON.stringify(payload)}`);
  return payload;
};
const rag = (message, sessionId) => post("/api/rag/context", { message, sessionId, sender: `sender-${sessionId}` });

await client.connect();
const original = (await client.query(`
  SELECT human_handoff_enabled, human_handoff_after_unanswered, human_handoff_message,
         human_handoff_phone, human_handoff_url
  FROM bot_settings WHERE id = 'default'
`)).rows[0];

try {
  await client.query(`
    UPDATE bot_settings SET
      human_handoff_enabled = true,
      human_handoff_after_unanswered = 1,
      human_handoff_message = 'Runtime test: hubungi admin PMB.',
      human_handoff_phone = '628111222333',
      human_handoff_url = 'https://pmb.example/handoff'
    WHERE id = 'default'
  `);

  const caseA = await rag(unknown("case-a-1"), sessions[0]);
  const cooldown = await rag(unknown("case-a-2"), sessions[0]);
  if (!caseA.requiresHuman || caseA.handoff?.phone !== "628111222333" || caseA.handoff?.url !== "https://pmb.example/handoff") throw new Error(`CASE A/E gagal: ${JSON.stringify(caseA)}`);
  if (!cooldown.requiresHuman || cooldown.handoff !== null || !cooldown.handoffCooldown?.detailsSuppressed) throw new Error(`Cooldown gagal: ${JSON.stringify(cooldown)}`);

  await client.query("UPDATE bot_settings SET human_handoff_after_unanswered = 2 WHERE id = 'default'");
  const caseB1 = await rag(unknown("case-b-1"), sessions[1]);
  const caseB2 = await rag(unknown("case-b-2"), sessions[1]);
  if (caseB1.requiresHuman || !caseB2.requiresHuman) throw new Error(`CASE B gagal: ${JSON.stringify([caseB1, caseB2])}`);

  const caseC1 = await rag(unknown("case-c-1"), sessions[2]);
  const caseCFound = await rag("kapan libur semester", sessions[2]);
  const caseC2 = await rag(unknown("case-c-2"), sessions[2]);
  if (caseC1.requiresHuman || !caseCFound.found || caseC2.requiresHuman || caseC2.handoffCooldown?.streak !== 1) throw new Error(`CASE C gagal: ${JSON.stringify([caseC1, caseCFound, caseC2])}`);

  const caseD1 = await rag(unknown("case-d-1"), sessions[3]);
  const beforeGreeting = Number((await client.query("SELECT consecutive_unanswered FROM chat_sessions WHERE session_id = $1", [sessions[3]])).rows[0].consecutive_unanswered);
  const greeting = await post("/api/bot/resolve", { message: "halo" });
  const afterGreeting = Number((await client.query("SELECT consecutive_unanswered FROM chat_sessions WHERE session_id = $1", [sessions[3]])).rows[0].consecutive_unanswered);
  if (caseD1.requiresHuman || greeting.route !== "WELCOME" || beforeGreeting !== 1 || afterGreeting !== 1) throw new Error(`CASE D gagal: ${JSON.stringify({ caseD1, greeting, beforeGreeting, afterGreeting })}`);

  console.log(JSON.stringify({
    result: "RUNTIME_HANDOFF_PASS",
    caseA: { requiresHuman: caseA.requiresHuman, handoff: caseA.handoff, streak: caseA.handoffCooldown.streak },
    caseB: [{ requiresHuman: caseB1.requiresHuman, streak: caseB1.handoffCooldown.streak }, { requiresHuman: caseB2.requiresHuman, streak: caseB2.handoffCooldown.streak }],
    caseC: { firstNotFound: caseC1.handoffCooldown.streak, found: caseCFound.found, afterReset: caseC2.handoffCooldown.streak, requiresHuman: caseC2.requiresHuman },
    caseD: { route: greeting.route, streakBefore: beforeGreeting, streakAfter: afterGreeting },
    cooldown: { requiresHuman: cooldown.requiresHuman, handoff: cooldown.handoff, detailsSuppressed: cooldown.handoffCooldown.detailsSuppressed },
  }));
} finally {
  await client.query(`
    UPDATE bot_settings SET
      human_handoff_enabled = $1,
      human_handoff_after_unanswered = $2,
      human_handoff_message = $3,
      human_handoff_phone = $4,
      human_handoff_url = $5
    WHERE id = 'default'
  `, [original.human_handoff_enabled, original.human_handoff_after_unanswered, original.human_handoff_message, original.human_handoff_phone, original.human_handoff_url]);
  await client.query("DELETE FROM unanswered_questions WHERE session_id = ANY($1::varchar[])", [sessions]);
  await client.query("DELETE FROM retrieval_logs WHERE session_id = ANY($1::varchar[])", [sessions]);
  await client.query("DELETE FROM chat_sessions WHERE session_id = ANY($1::varchar[])", [sessions]);
  await client.query("DELETE FROM bot_analytics_events WHERE normalized_question LIKE $1", [`%${token}%`]);
  await client.end();
}
