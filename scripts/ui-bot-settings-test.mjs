const appUrl = process.env.BAAK_TEST_URL ?? "http://localhost:3010";
const apiKey = process.env.INTERNAL_API_KEY;
if (!apiKey) throw new Error("INTERNAL_API_KEY wajib tersedia.");
const headers = { authorization: `Bearer ${apiKey}` };
const originalConfig = await fetch(`${appUrl}/api/bot/config`, { headers }).then((r) => r.json()).then((body) => body.config);
const cleanWelcomeIntro = originalConfig.welcomeIntro.replace(/\n*\[CONTROL CENTER UI TEST\]\s*/g, "").trim();

const target = await fetch(`http://127.0.0.1:9222/json/new?${appUrl}/login`, { method: "PUT" }).then((r) => r.json());
const ws = new WebSocket(target.webSocketDebuggerUrl);
await new Promise((resolve, reject) => { ws.addEventListener("open", resolve, { once: true }); ws.addEventListener("error", reject, { once: true }); });
let nextId = 0;
const pending = new Map();
ws.addEventListener("message", (event) => { const message = JSON.parse(event.data); const waiter = pending.get(message.id); if (!waiter) return; pending.delete(message.id); if (message.error) waiter.reject(new Error(JSON.stringify(message.error))); else waiter.resolve(message.result); });
const send = (method, params = {}) => { const id = ++nextId; ws.send(JSON.stringify({ id, method, params })); return new Promise((resolve, reject) => pending.set(id, { resolve, reject })); };
const evaluate = async (expression) => { const result = await send("Runtime.evaluate", { expression, awaitPromise: true, returnByValue: true }); if (result.exceptionDetails) throw new Error(result.exceptionDetails.text); return result.result.value; };
const waitFor = async (expression, timeout = 20000) => { const end = Date.now() + timeout; while (Date.now() < end) { if (await evaluate(expression)) return; await new Promise((resolve) => setTimeout(resolve, 200)); } throw new Error(`Timeout: ${expression}`); };
const navigate = async (path) => { await send("Page.navigate", { url: `${appUrl}${path}` }); await waitFor(`location.pathname === ${JSON.stringify(path)} && document.readyState === 'complete'`); await new Promise((resolve) => setTimeout(resolve, 400)); };
const clickButton = async (text) => { const ok = await evaluate(`(() => { const button=[...document.querySelectorAll('button')].find((item)=>item.textContent.trim().includes(${JSON.stringify(text)})); if(!button)return false; button.click(); return true; })()`); if (!ok) throw new Error(`Button not found: ${text}`); };
const setByLabel = async (label, value, tag) => { const ok = await evaluate(`(() => { const label=[...document.querySelectorAll('label')].find((item)=>item.textContent.trim()===${JSON.stringify(label)}); const input=label?.parentElement?.querySelector(${JSON.stringify(tag)}); if(!input)return false; const proto=input instanceof HTMLTextAreaElement?HTMLTextAreaElement.prototype:HTMLInputElement.prototype; Object.getOwnPropertyDescriptor(proto,'value').set.call(input,${JSON.stringify(value)}); input.dispatchEvent(new Event('input',{bubbles:true})); input.dispatchEvent(new Event('change',{bubbles:true})); return true; })()`); if (!ok) throw new Error(`Field not found: ${label}`); };
const openMenuTab = async () => { const point = await evaluate(`(() => { const button=[...document.querySelectorAll('[data-slot="tabs-trigger"]')].find((item)=>item.textContent.trim()==='Menu'); if(!button)return null; const rect=button.getBoundingClientRect(); return {x:rect.left+rect.width/2,y:rect.top+rect.height/2}; })()`); if (!point) throw new Error("Menu tab not found."); await send("Input.dispatchMouseEvent", { type: "mousePressed", x: point.x, y: point.y, button: "left", clickCount: 1 }); await send("Input.dispatchMouseEvent", { type: "mouseReleased", x: point.x, y: point.y, button: "left", clickCount: 1 }); await waitFor("document.querySelector('[data-slot=\"select-trigger\"]') !== null"); };
const selectMenuMode = async (option) => { const opened = await evaluate(`(() => { const button=document.querySelector('[data-slot="select-trigger"]'); if(!button)return false; button.click(); return true; })()`); if (!opened) throw new Error("Menu mode select not found."); await waitFor(`[...document.querySelectorAll('[data-slot="select-item"]')].some((item)=>item.textContent.trim()===${JSON.stringify(option)})`); await evaluate(`(() => { const item=[...document.querySelectorAll('[data-slot="select-item"]')].find((entry)=>entry.textContent.trim()===${JSON.stringify(option)}); item.click(); return true; })()`); };
const save = async () => { await clickButton("Simpan Pengaturan"); await waitFor(`[...document.body.querySelectorAll('*')].some((item)=>item.textContent?.includes('Pengaturan bot PMB berhasil disimpan.'))`, 30000); };
const api = async (path, options = {}) => { const response = await fetch(`${appUrl}${path}`, { ...options, headers: { ...headers, ...(options.headers ?? {}) } }); return { status: response.status, body: await response.json() }; };

try {
  await send("Page.enable"); await send("Runtime.enable"); await waitFor("document.querySelector('#email') !== null");
  await evaluate(`(() => { for(const [selector,value] of [['#email',${JSON.stringify(process.env.E2E_ADMIN_EMAIL ?? "superadmin@baak.test")}],['#password',${JSON.stringify(process.env.E2E_ADMIN_PASSWORD ?? "SuperAdmin@123")}]] ) { const input=document.querySelector(selector); Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set.call(input,value); input.dispatchEvent(new Event('input',{bubbles:true})); } return true; })()`);
  await clickButton("Masuk"); await waitFor("location.pathname !== '/login'");

  await navigate("/bot-settings"); await waitFor("document.body.innerText.includes('Pengaturan Bot PMB')");
  const marker = "[CONTROL CENTER UI TEST]";
  await setByLabel("Pembuka", `${cleanWelcomeIntro}\n\n${marker}`, "textarea");
  await save();
  const welcome = await api("/api/bot/resolve", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ message: "halo" }) });
  if (!welcome.body.responseText?.includes(marker)) throw new Error("Welcome API tidak langsung berubah setelah save UI.");

  const modeResults = [];
  for (const [value, label] of [["POPULAR", "Popular"], ["HYBRID", "Hybrid"], ["MANUAL", "Manual"]]) {
    await navigate("/bot-settings"); await openMenuTab(); await selectMenuMode(label); await save();
    const menu = await api("/api/bot/menu");
    if (menu.body.mode !== value) throw new Error(`Mode ${value} tidak aktif.`);
    modeResults.push({ mode: value, count: menu.body.items.length, sources: menu.body.items.map((item) => item.source) });
  }

  await navigate("/bot-settings");
  await setByLabel("Pembuka", cleanWelcomeIntro, "textarea");
  await openMenuTab();
  await selectMenuMode(originalConfig.menuMode === "POPULAR" ? "Popular" : originalConfig.menuMode === "HYBRID" ? "Hybrid" : "Manual");
  await save();
  console.log(JSON.stringify({ result: "UI_BOT_SETTINGS_PASS", welcomeChangedWithoutN8n: true, modeResults }));
} finally {
  ws.close();
}
