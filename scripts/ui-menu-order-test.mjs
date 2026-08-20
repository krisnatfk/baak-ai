const appUrl = process.env.BAAK_TEST_URL ?? "http://localhost:3010";
const apiKey = process.env.INTERNAL_API_KEY;
if (!apiKey) throw new Error("INTERNAL_API_KEY wajib tersedia.");
const scheduleId = "b1d6481f-8df5-4b49-b4cb-a878baa08758";
const brochureId = "489b98ec-d83f-429f-88e4-b9fd66dcae29";
const target = await fetch(`http://127.0.0.1:9222/json/new?${appUrl}/login`, { method: "PUT" }).then((r) => r.json());
const ws = new WebSocket(target.webSocketDebuggerUrl);
await new Promise((resolve, reject) => { ws.addEventListener("open", resolve, { once: true }); ws.addEventListener("error", reject, { once: true }); });
let nextId = 0;
const pending = new Map();
ws.addEventListener("message", (event) => { const message = JSON.parse(event.data); const waiter = pending.get(message.id); if (!waiter) return; pending.delete(message.id); if (message.error) waiter.reject(new Error(JSON.stringify(message.error))); else waiter.resolve(message.result); });
const send = (method, params = {}) => { const id = ++nextId; ws.send(JSON.stringify({ id, method, params })); return new Promise((resolve, reject) => pending.set(id, { resolve, reject })); };
const evaluate = async (expression) => { const result = await send("Runtime.evaluate", { expression, awaitPromise: true, returnByValue: true }); if (result.exceptionDetails) throw new Error(result.exceptionDetails.text); return result.result.value; };
const waitFor = async (expression, timeout = 30000) => { const end = Date.now() + timeout; while (Date.now() < end) { if (await evaluate(expression)) return; await new Promise((resolve) => setTimeout(resolve, 200)); } throw new Error(`Timeout: ${expression}`); };
const navigate = async (path) => { await send("Page.navigate", { url: `${appUrl}${path}` }); await waitFor(`location.pathname === ${JSON.stringify(path)} && document.readyState === 'complete'`); await new Promise((resolve) => setTimeout(resolve, 350)); };
const setInput = async (selector, value) => { const ok = await evaluate(`(() => { const input=document.querySelector(${JSON.stringify(selector)}); if(!input)return false; Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set.call(input,${JSON.stringify(value)}); input.dispatchEvent(new Event('input',{bubbles:true})); input.dispatchEvent(new Event('change',{bubbles:true})); return true; })()`); if (!ok) throw new Error(`Input not found: ${selector}`); };
const click = async (selector) => { const ok = await evaluate(`(() => { const item=document.querySelector(${JSON.stringify(selector)}); if(!item)return false; item.click(); return true; })()`); if (!ok) throw new Error(`Element not found: ${selector}`); };
const clickButton = async (label) => { const ok = await evaluate(`(() => { const button=[...document.querySelectorAll('button')].find((item)=>item.textContent.trim().includes(${JSON.stringify(label)})&&!item.disabled); if(!button)return false; button.click(); return true; })()`); if (!ok) throw new Error(`Button not found: ${label}`); };
const editMenu = async (id, enabled, order) => {
  await navigate(`/knowledge/faq/${id}/edit`); await waitFor("document.querySelector('#showInMainMenu') !== null");
  const checked = await evaluate("document.querySelector('#showInMainMenu').getAttribute('data-state') === 'checked'");
  if (checked !== enabled) await click("#showInMainMenu");
  await setInput("#mainMenuOrder", order === null ? "" : String(order));
  await clickButton("Simpan Perubahan"); await waitFor("location.pathname === '/knowledge/faq'", 40000);
};
const menu = () => fetch(`${appUrl}/api/bot/menu`, { headers: { authorization: `Bearer ${apiKey}` } }).then((r) => r.json());

try {
  await send("Page.enable"); await send("Runtime.enable"); await waitFor("document.querySelector('#email') !== null");
  await setInput("#email", process.env.E2E_ADMIN_EMAIL ?? "superadmin@baak.test"); await setInput("#password", process.env.E2E_ADMIN_PASSWORD ?? "SuperAdmin@123");
  await clickButton("Masuk"); await waitFor("location.pathname !== '/login'");
  await editMenu(brochureId, true, 1); await editMenu(scheduleId, true, 2);
  const first = await menu();
  await editMenu(brochureId, true, 2); await editMenu(scheduleId, true, 1);
  const second = await menu();
  if (first.items[0]?.faqId !== brochureId || second.items[0]?.faqId !== scheduleId) throw new Error("Urutan menu API tidak mengikuti perubahan admin.");
  await editMenu(brochureId, false, null); await editMenu(scheduleId, true, 1);
  console.log(JSON.stringify({ result: "UI_MENU_ORDER_PASS", before: first.items.map((item) => item.question), after: second.items.map((item) => item.question), restored: true }));
} finally { ws.close(); }
