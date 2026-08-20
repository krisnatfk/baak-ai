const appUrl = process.env.BAAK_TEST_URL ?? "http://localhost:3010";
const target = await fetch(`http://127.0.0.1:9222/json/new?${appUrl}/login`, { method: "PUT" }).then((r) => r.json());
const ws = new WebSocket(target.webSocketDebuggerUrl);
await new Promise((resolve, reject) => { ws.addEventListener("open", resolve, { once: true }); ws.addEventListener("error", reject, { once: true }); });
let nextId = 0;
const pending = new Map();
ws.addEventListener("message", (event) => { const message = JSON.parse(event.data); const waiter = pending.get(message.id); if (!waiter) return; pending.delete(message.id); if (message.error) waiter.reject(new Error(JSON.stringify(message.error))); else waiter.resolve(message.result); });
const send = (method, params = {}) => { const id = ++nextId; ws.send(JSON.stringify({ id, method, params })); return new Promise((resolve, reject) => pending.set(id, { resolve, reject })); };
const evaluate = async (expression) => { const result = await send("Runtime.evaluate", { expression, awaitPromise: true, returnByValue: true }); if (result.exceptionDetails) throw new Error(result.exceptionDetails.text); return result.result.value; };
const waitFor = async (expression, timeout = 60000) => { const end = Date.now() + timeout; while (Date.now() < end) { if (await evaluate(expression)) return; await new Promise((resolve) => setTimeout(resolve, 250)); } throw new Error(`Timeout: ${expression}`); };
const navigate = async (path) => { await send("Page.navigate", { url: `${appUrl}${path}` }); await waitFor(`location.pathname === ${JSON.stringify(path)} && document.readyState === 'complete'`); await new Promise((resolve) => setTimeout(resolve, 400)); };
const setField = async (selector, value, prototype = "HTMLTextAreaElement") => { const ok = await evaluate(`(() => { const input=document.querySelector(${JSON.stringify(selector)}); if(!input)return false; Object.getOwnPropertyDescriptor(${prototype}.prototype,'value').set.call(input,${JSON.stringify(value)}); input.dispatchEvent(new Event('input',{bubbles:true})); input.dispatchEvent(new Event('change',{bubbles:true})); return true; })()`); if (!ok) throw new Error(`Field not found: ${selector}`); };
const clickButton = async (label) => { const found = await evaluate(`(() => { const button=[...document.querySelectorAll('button')].find((item)=>item.textContent.trim().includes(${JSON.stringify(label)}) && !item.disabled); if(!button)return false; button.scrollIntoView({block:'center'}); return true; })()`); if (!found) throw new Error(`Enabled button not found: ${label}`); await new Promise((resolve) => setTimeout(resolve, 200)); const point = await evaluate(`(() => { const button=[...document.querySelectorAll('button')].find((item)=>item.textContent.trim().includes(${JSON.stringify(label)}) && !item.disabled); const rect=button.getBoundingClientRect(); return {x:rect.left+rect.width/2,y:rect.top+rect.height/2}; })()`); await send("Input.dispatchMouseEvent", { type: "mousePressed", x: point.x, y: point.y, button: "left", clickCount: 1 }); await send("Input.dispatchMouseEvent", { type: "mouseReleased", x: point.x, y: point.y, button: "left", clickCount: 1 }); };

try {
  await send("Page.enable"); await send("Runtime.enable"); await waitFor("document.querySelector('#email') !== null");
  await setField("#email", process.env.E2E_ADMIN_EMAIL ?? "superadmin@baak.test", "HTMLInputElement");
  await setField("#password", process.env.E2E_ADMIN_PASSWORD ?? "SuperAdmin@123", "HTMLInputElement");
  await clickButton("Masuk"); await waitFor("location.pathname !== '/login'");
  await navigate("/knowledge/faq/new"); await waitFor("document.querySelector('#question') !== null");
  const original = "Pendaftaran dilakukan online melalui website PMB.";
  await setField("#question", "Bagaimana cara melakukan pendaftaran PMB?");
  await setField("#answer", original);

  await waitFor("[...document.querySelectorAll('button')].some((item)=>item.textContent.includes('Perbaiki dengan AI')&&!item.disabled)");
  await clickButton("Perbaiki dengan AI");
  await waitFor("document.body.innerText.includes('Preview Perbaikan Jawaban')", 90000);
  const suggestion = await evaluate(`(() => { const values=document.querySelectorAll('.whitespace-pre-wrap'); return values.length > 1 ? values[1].textContent.trim() : ''; })()`);
  if (!/pendaftaran/i.test(suggestion) || !/online/i.test(suggestion) || !/website\s+PMB/i.test(suggestion)) throw new Error(`Saran menghilangkan fakta asli: ${suggestion}`);
  if (/\b(biaya|harga|tarif|tanggal|jadwal|syarat|persyaratan|dokumen|telepon|whatsapp|wa)\b/i.test(suggestion) || /https?:\/\//i.test(suggestion) || /\b\d{8,}\b/.test(suggestion)) throw new Error(`Saran menambah fakta sensitif: ${suggestion}`);
  await clickButton("Batal"); await waitFor("!document.body.innerText.includes('Preview Perbaikan Jawaban')");

  await clickButton("Buat Keywords"); await waitFor("document.querySelector('#keywords')?.value.trim().length > 0", 90000);
  const keywords = await evaluate("document.querySelector('#keywords').value");
  await clickButton("Buat Variasi Pertanyaan"); await waitFor("document.querySelectorAll('input[placeholder^=\"Alternatif \"]').length > 0", 90000);
  const variationCount = await evaluate("document.querySelectorAll('input[placeholder^=\"Alternatif \"]').length");
  await clickButton("Cek FAQ Mirip"); await waitFor("![...document.querySelectorAll('button')].some((item)=>item.textContent.includes('Cek FAQ Mirip')&&item.disabled)", 90000);
  const duplicateWarningVisible = await evaluate("document.body.innerText.includes('FAQ yang mungkin mirip') || document.body.innerText.includes('Tidak ditemukan FAQ yang mirip.')");
  console.log(JSON.stringify({ result: "UI_FAQ_AI_PASS", original, suggestion, keywords, variationCount, duplicateCheckCompleted: duplicateWarningVisible }));
} catch (error) {
  console.error((await evaluate("document.body.innerText")).slice(0, 5000));
  throw error;
} finally { ws.close(); }
