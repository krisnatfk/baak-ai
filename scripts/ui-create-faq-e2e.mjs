const debuggerUrl = "http://127.0.0.1:9222";
const appUrl = process.env.BAAK_TEST_URL ?? "http://localhost:3010";
const question =
  process.env.E2E_FAQ_QUESTION ?? "Apa kode verifikasi integrasi FAQ PMB 4827?";
const answer =
  process.env.E2E_FAQ_ANSWER ??
  "Kode verifikasi integrasi FAQ PMB adalah TEKNO-4827. Gambar dan panduan PDF akan dikirim setelah jawaban ini.";
const imagePath =
  process.env.E2E_FAQ_IMAGE ??
  "C:\\AI-CENTER\\apps\\baak-ai\\test-assets\\storage-ui-image-test.png";
const pdfPath =
  process.env.E2E_FAQ_PDF ??
  "C:\\AI-CENTER\\apps\\baak-ai\\test-assets\\storage-ui-pdf-test.pdf";

const target = await fetch(`${debuggerUrl}/json/new?${appUrl}/login`, {
  method: "PUT",
}).then((response) => response.json());
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

async function navigate(path) {
  await send("Page.navigate", { url: `${appUrl}${path}` });
  await waitFor("document.readyState === 'complete'");
}

async function setField(selector, value, prototypeName = "HTMLInputElement") {
  const changed = await evaluate(`(() => {
    const element = document.querySelector(${JSON.stringify(selector)});
    if (!element) return false;
    const setter = Object.getOwnPropertyDescriptor(${prototypeName}.prototype, "value").set;
    setter.call(element, ${JSON.stringify(value)});
    element.dispatchEvent(new Event("input", { bubbles: true }));
    element.dispatchEvent(new Event("change", { bubbles: true }));
    return true;
  })()`);
  if (!changed) throw new Error(`Field not found: ${selector}`);
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

async function chooseSelect(triggerSelector, label) {
  const clicked = await evaluate(`(() => {
    const trigger = document.querySelector(${JSON.stringify(triggerSelector)});
    if (!trigger) return false;
    trigger.click();
    return true;
  })()`);
  if (!clicked) throw new Error(`Select not found: ${triggerSelector}`);
  await waitFor(
    `[...document.querySelectorAll('[role="option"]')].some((item) => item.textContent.trim() === ${JSON.stringify(label)})`,
  );
  const chosen = await evaluate(`(() => {
    const option = [...document.querySelectorAll('[role="option"]')]
      .find((item) => item.textContent.trim() === ${JSON.stringify(label)});
    if (!option) return false;
    option.click();
    return true;
  })()`);
  if (!chosen) throw new Error(`Option not found: ${label}`);
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

try {
  await send("Page.enable");
  await send("Runtime.enable");
  await waitFor("document.querySelector('#email') !== null");
  await setField("#email", process.env.E2E_ADMIN_EMAIL ?? "superadmin@baak.test");
  await setField("#password", process.env.E2E_ADMIN_PASSWORD ?? "SuperAdmin@123");
  await clickButton("Masuk");
  await waitFor("location.pathname !== '/login'");

  await navigate("/knowledge/faq/new");
  await waitFor("document.querySelector('form') !== null");
  await setField("#question", question, "HTMLTextAreaElement");
  await setField("#answer", answer, "HTMLTextAreaElement");
  await setField("#keywords", "integrasi, verifikasi, PMB, TEKNO-4827");
  await chooseSelect("#categoryId", "PMB");
  await chooseSelect("#audience", "Calon Mahasiswa");
  await chooseSelect("#status", "Aktif");

  await clickButton("Tambah Gambar");
  await waitFor("document.querySelector('input[type=file][accept*=\".png\"]') !== null");
  await setLastFile('input[type=file][accept*=".png"]', imagePath);
  await setField(
    'input[placeholder="Keterangan gambar (opsional)"]',
    "Gambar verifikasi integrasi FAQ PMB",
  );

  await clickButton("Tambah Lampiran");
  await waitFor("document.querySelector('input[placeholder^=\"Judul lampiran\"]') !== null");
  await setField(
    'input[placeholder^="Judul lampiran"]',
    "Panduan verifikasi integrasi FAQ PMB",
  );
  await setLastFile('input[type=file][accept*=".pdf"]', pdfPath);

  await clickButton("Simpan FAQ");
  await waitFor("location.pathname === '/knowledge/faq'", 30_000);
  console.log(JSON.stringify({ result: "UI_CREATE_FAQ_PASS", question }));
} catch (error) {
  console.error(await evaluate("document.body.innerText"));
  throw error;
} finally {
  ws.close();
}
