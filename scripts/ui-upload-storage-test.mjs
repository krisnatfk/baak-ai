const debuggerUrl = "http://127.0.0.1:9222";
const target = await fetch(`${debuggerUrl}/json/new?http://localhost:3010/login`, { method: "PUT" }).then((r) => r.json());
const ws = new WebSocket(target.webSocketDebuggerUrl);
await new Promise((resolve, reject) => {
  ws.addEventListener("open", resolve, { once: true });
  ws.addEventListener("error", reject, { once: true });
});

let nextId = 0;
const pending = new Map();
ws.addEventListener("message", (event) => {
  const message = JSON.parse(event.data);
  if (!message.id) return;
  const waiter = pending.get(message.id);
  if (!waiter) return;
  pending.delete(message.id);
  if (message.error) waiter.reject(new Error(JSON.stringify(message.error)));
  else waiter.resolve(message.result);
});

function send(method, params = {}) {
  const id = ++nextId;
  ws.send(JSON.stringify({ id, method, params }));
  return new Promise((resolve, reject) => pending.set(id, { resolve, reject }));
}

async function evaluate(expression) {
  const result = await send("Runtime.evaluate", { expression, awaitPromise: true, returnByValue: true });
  if (result.exceptionDetails) throw new Error(result.exceptionDetails.text);
  return result.result.value;
}

async function waitFor(expression, timeoutMs = 15000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (await evaluate(expression)) return;
    await new Promise((resolve) => setTimeout(resolve, 200));
  }
  throw new Error(`Timeout: ${expression}`);
}

async function navigate(url) {
  await send("Page.navigate", { url });
  await waitFor("document.readyState === 'complete'");
}

async function clickButton(text) {
  const found = await evaluate(`(() => {
    const button = [...document.querySelectorAll('button')].find((el) => el.textContent.trim().includes(${JSON.stringify(text)}));
    if (!button) return false;
    button.click();
    return true;
  })()`);
  if (!found) throw new Error(`Button not found: ${text}`);
}

async function setInput(selector, value) {
  const ok = await evaluate(`(() => {
    const input = document.querySelector(${JSON.stringify(selector)});
    if (!input) return false;
    const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set;
    setter.call(input, ${JSON.stringify(value)});
    input.dispatchEvent(new Event('input', { bubbles: true }));
    input.dispatchEvent(new Event('change', { bubbles: true }));
    return true;
  })()`);
  if (!ok) throw new Error(`Input not found: ${selector}`);
}

async function setLastInput(selector, value) {
  const ok = await evaluate(`(() => {
    const inputs = [...document.querySelectorAll(${JSON.stringify(selector)})];
    const input = inputs.at(-1);
    if (!input) return false;
    const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set;
    setter.call(input, ${JSON.stringify(value)});
    input.dispatchEvent(new Event('input', { bubbles: true }));
    input.dispatchEvent(new Event('change', { bubbles: true }));
    return true;
  })()`);
  if (!ok) throw new Error(`Input not found: ${selector}`);
}

async function setFile(selector, filePath) {
  const { root } = await send("DOM.getDocument", { depth: -1 });
  const { nodeIds } = await send("DOM.querySelectorAll", { nodeId: root.nodeId, selector });
  const nodeId = nodeIds.at(-1);
  if (!nodeId) throw new Error(`File input not found: ${selector}`);
  await send("DOM.setFileInputFiles", { nodeId, files: [filePath] });
}

await send("Page.enable");
await send("Runtime.enable");
await waitFor("document.querySelector('#email') !== null");
await setInput("#email", "superadmin@baak.test");
await setInput("#password", "SuperAdmin@123");
await clickButton("Masuk");
await waitFor("location.pathname !== '/login'", 20000);

await navigate("http://localhost:3010/knowledge/faq/489b98ec-d83f-429f-88e4-b9fd66dcae29/edit");
await waitFor("document.querySelector('form') !== null");

await clickButton("Tambah Sumber");
await waitFor("document.querySelector('input[placeholder^=\"Judul sumber\"]') !== null");
await setLastInput('input[placeholder^="Judul sumber"]', "Official Storage UI Test");
await setLastInput('input[placeholder="https://... (opsional)"]', "https://example.com/storage-ui-test");

await clickButton("Tambah Gambar");
await waitFor("document.querySelector('input[type=file][accept*=\".png\"]') !== null");
await setFile('input[type=file][accept*=".png"]', "C:\\AI-CENTER\\apps\\baak-ai\\test-assets\\storage-ui-image-test.png");
await setLastInput('input[placeholder="Keterangan gambar (opsional)"]', "Storage UI image test");

await clickButton("Tambah Lampiran");
await waitFor("document.querySelector('input[placeholder^=\"Judul lampiran\"]') !== null");
await setLastInput('input[placeholder^="Judul lampiran"]', "Storage UI PDF Test");
await setFile('input[type=file][accept*=".pdf"]', "C:\\AI-CENTER\\apps\\baak-ai\\test-assets\\storage-ui-pdf-test.pdf");

await clickButton("Simpan Perubahan");
try {
  await waitFor("location.pathname === '/knowledge/faq'", 30000);
} catch (error) {
  console.error(await evaluate("document.body.innerText"));
  throw error;
}
console.log("UI_UPLOAD_SAVE=PASS");
ws.close();
