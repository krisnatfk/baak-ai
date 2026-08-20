import pg from "pg";

const appUrl = process.env.BAAK_TEST_URL ?? "http://localhost:3010";
const apiKey = process.env.INTERNAL_API_KEY;
if (!apiKey) throw new Error("INTERNAL_API_KEY wajib tersedia.");
const externalSessionId = `live-conversation-${Date.now()}`;
const target = await fetch(`http://127.0.0.1:9222/json/new?${appUrl}/login`, { method: "PUT" }).then((response) => response.json());
const ws = new WebSocket(target.webSocketDebuggerUrl);
await new Promise((resolve, reject) => { ws.addEventListener("open", resolve, { once: true }); ws.addEventListener("error", reject, { once: true }); });
let nextId = 0;
const pending = new Map();
ws.addEventListener("message", (event) => { const message = JSON.parse(event.data); const waiter = pending.get(message.id); if (!waiter) return; pending.delete(message.id); if (message.error) waiter.reject(new Error(JSON.stringify(message.error))); else waiter.resolve(message.result); });
const send = (method, params = {}) => { const id = ++nextId; ws.send(JSON.stringify({ id, method, params })); return new Promise((resolve, reject) => pending.set(id, { resolve, reject })); };
const evaluate = async (expression) => { const result = await send("Runtime.evaluate", { expression, awaitPromise: true, returnByValue: true }); if (result.exceptionDetails) throw new Error(result.exceptionDetails.text); return result.result.value; };
const waitFor = async (expression, timeout = 30000) => { const end = Date.now() + timeout; while (Date.now() < end) { if (await evaluate(expression)) return; await new Promise((resolve) => setTimeout(resolve, 250)); } throw new Error(`Timeout: ${expression}`); };
const setInput = async (selector, value) => { const ok = await evaluate(`(() => { const input=document.querySelector(${JSON.stringify(selector)}); if(!input)return false; Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set.call(input,${JSON.stringify(value)}); input.dispatchEvent(new Event('input',{bubbles:true})); return true; })()`); if (!ok) throw new Error(`Input tidak ditemukan: ${selector}`); };
const clickButton = async (label) => { const ok = await evaluate(`(() => { const button=[...document.querySelectorAll('button')].find((item)=>item.textContent.includes(${JSON.stringify(label)})); if(!button)return false; button.click(); return true; })()`); if (!ok) throw new Error(`Button tidak ditemukan: ${label}`); };
const client = new pg.Client({ connectionString: process.env.DATABASE_URL });

try {
  await client.connect(); await send("Page.enable"); await send("Runtime.enable"); await waitFor("document.querySelector('#email') !== null");
  await setInput("#email", process.env.E2E_ADMIN_EMAIL ?? "superadmin@baak.test"); await setInput("#password", process.env.E2E_ADMIN_PASSWORD ?? "SuperAdmin@123");
  await clickButton("Masuk"); await waitFor("location.pathname !== '/login'");
  await send("Page.navigate", { url: `${appUrl}/conversations` });
  await waitFor("location.pathname === '/conversations' && document.body.innerText.includes('Live · 2.5 detik')");
  if (await evaluate(`document.body.innerText.includes(${JSON.stringify(externalSessionId)})`)) throw new Error("Session test sudah ada sebelum request.");

  const response = await fetch(`${appUrl}/api/bot/resolve`, {
    method: "POST",
    headers: { authorization: `Bearer ${apiKey}`, "content-type": "application/json" },
    body: JSON.stringify({ message: "halo kak", sessionId: externalSessionId, sender: "628-live-test" }),
  });
  const body = await response.json();
  if (!response.ok || !body.conversationRecorded) throw new Error(`Resolver tidak merekam chat: ${JSON.stringify(body)}`);

  await waitFor(`document.body.innerText.includes(${JSON.stringify(externalSessionId)})`, 12000);
  const stored = await client.query(`
    SELECT s.message_count, array_agg(m.role ORDER BY m.created_at) AS roles
    FROM chat_sessions s JOIN chat_messages m ON m.session_id = s.id
    WHERE s.session_id = $1 GROUP BY s.id
  `, [externalSessionId]);
  const roles = Array.isArray(stored.rows[0]?.roles)
    ? stored.rows[0].roles
    : String(stored.rows[0]?.roles ?? "").replace(/[{}]/g, "").split(",").filter(Boolean);
  if (Number(stored.rows[0]?.message_count) !== 2 || roles.join(",") !== "USER,AI") throw new Error(`Chat database tidak lengkap: ${JSON.stringify(stored.rows)}`);
  console.log(JSON.stringify({ result: "UI_CONVERSATION_LIVE_PASS", appearedWithoutManualRefresh: true, conversationRecorded: true, messageCount: 2, roles }));
} finally {
  if (!client.ended) {
    await client.query("DELETE FROM chat_sessions WHERE session_id = $1", [externalSessionId]).catch(() => undefined);
    await client.end();
  }
  ws.close();
}
