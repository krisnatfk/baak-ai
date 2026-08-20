const mode = process.argv[2];
if (!new Set(["replace", "delete"]).has(mode)) {
  throw new Error("Usage: node scripts/ui-asset-lifecycle-test.mjs <replace|delete>");
}

const debuggerUrl = "http://127.0.0.1:9222";
const faqId = "489b98ec-d83f-429f-88e4-b9fd66dcae29";
const target = await fetch(
  `${debuggerUrl}/json/new?http://localhost:3010/login`,
  { method: "PUT" },
).then((response) => response.json());
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
  const result = await send("Runtime.evaluate", {
    expression,
    awaitPromise: true,
    returnByValue: true,
  });
  if (result.exceptionDetails) throw new Error(result.exceptionDetails.text);
  return result.result.value;
}

async function waitFor(expression, timeoutMs = 20_000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (await evaluate(expression)) return;
    await new Promise((resolve) => setTimeout(resolve, 200));
  }
  throw new Error(`Timeout: ${expression}`);
}

async function setInput(selector, value) {
  const changed = await evaluate(`(() => {
    const input = document.querySelector(${JSON.stringify(selector)});
    if (!input) return false;
    const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value").set;
    setter.call(input, ${JSON.stringify(value)});
    input.dispatchEvent(new Event("input", { bubbles: true }));
    input.dispatchEvent(new Event("change", { bubbles: true }));
    return true;
  })()`);
  if (!changed) throw new Error(`Input not found: ${selector}`);
}

async function clickButton(text) {
  const clicked = await evaluate(`(() => {
    const button = [...document.querySelectorAll("button")]
      .find((element) => element.textContent.trim().includes(${JSON.stringify(text)}));
    if (!button) return false;
    button.click();
    return true;
  })()`);
  if (!clicked) throw new Error(`Button not found: ${text}`);
}

async function setLastFile(selector, filePath) {
  const { root } = await send("DOM.getDocument", { depth: -1 });
  const { nodeIds } = await send("DOM.querySelectorAll", {
    nodeId: root.nodeId,
    selector,
  });
  const nodeId = nodeIds.at(-1);
  if (!nodeId) throw new Error(`File input not found: ${selector}`);
  await send("DOM.setFileInputFiles", { nodeId, files: [filePath] });
}

async function removeLastRow(inputSelector) {
  const removed = await evaluate(`(() => {
    const input = [...document.querySelectorAll(${JSON.stringify(inputSelector)})].at(-1);
    const row = input?.closest("div.space-y-2.rounded-md.border.p-3");
    const button = [...(row?.querySelectorAll("button") ?? [])]
      .find((element) => element.querySelector("svg.lucide-trash-2"));
    if (!button) return false;
    button.click();
    return true;
  })()`);
  if (!removed) throw new Error(`Asset row not found: ${inputSelector}`);
}

await send("Page.enable");
await send("Runtime.enable");
await waitFor("document.querySelector('#email') !== null");
await setInput("#email", "superadmin@baak.test");
await setInput("#password", "SuperAdmin@123");
await clickButton("Masuk");
await waitFor("location.pathname !== '/login'");
await send("Page.navigate", {
  url: `http://localhost:3010/knowledge/faq/${faqId}/edit`,
});
await waitFor("document.readyState === 'complete' && document.querySelector('form') !== null");

const imageSelector = 'input[type=file][accept*=".png"]';
const attachmentSelector = 'input[type=file][accept*=".pdf"]';
if (mode === "replace") {
  await setLastFile(
    imageSelector,
    "C:\\AI-CENTER\\apps\\baak-ai\\uploads\\screenshot-2026-08-03-113055-mt02jfye-cccc51.png",
  );
  await setLastFile(
    attachmentSelector,
    "C:\\AI-CENTER\\apps\\baak-ai\\uploads\\041_skk_ftik_viii_2026-mt02jfyg-08d329.pdf",
  );
} else {
  await removeLastRow(imageSelector);
  await removeLastRow(attachmentSelector);
}

await clickButton("Simpan Perubahan");
try {
  await waitFor("location.pathname === '/knowledge/faq'", 30_000);
} catch (error) {
  console.error(await evaluate("document.body.innerText"));
  throw error;
}
console.log(`UI_ASSET_${mode.toUpperCase()}=PASS`);
ws.close();
