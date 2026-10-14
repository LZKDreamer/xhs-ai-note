// net-probe.mjs — 抓取页面加载期间的网络失败原因（诊断 CSS/字体/图片为何没生效）
// 用法: node scripts/net-probe.mjs <html文件>
import { spawn } from "node:child_process";
import { existsSync } from "node:fs";
import { pathToFileURL } from "node:url";
import path from "node:path";
import os from "node:os";

const CHROME = [
  "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe",
  "C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe",
].find(existsSync);

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const htmlPath = path.resolve(process.argv[2]);
const port = 9222 + Math.floor(Math.random() * 500);
const userDataDir = path.join(os.tmpdir(), `dsh-net-${Date.now()}`);

const child = spawn(CHROME, [
  "--headless=new", "--disable-gpu", "--no-first-run", "--hide-scrollbars",
  "--allow-file-access-from-files",
  `--remote-debugging-port=${port}`, `--user-data-dir=${userDataDir}`,
  "--window-size=1200,1500", "about:blank",
], { stdio: "ignore" });

let wsUrl = null;
for (let i = 0; i < 60; i++) {
  await sleep(300);
  try { const r = await fetch(`http://127.0.0.1:${port}/json/version`); if (r.ok) { wsUrl = (await r.json()).webSocketDebuggerUrl; break; } } catch {}
}
const ws = new WebSocket(wsUrl);
await new Promise((res) => ws.addEventListener("open", res, { once: true }));
let id = 0; const pending = new Map();
const events = [];
ws.addEventListener("message", (ev) => {
  const m = JSON.parse(ev.data);
  if (m.id && pending.has(m.id)) { pending.get(m.id)(m.result ?? m.error); pending.delete(m.id); }
  if (m.method) events.push(m);
});
const send = (method, params = {}, sessionId) => new Promise((res) => {
  const i = ++id; pending.set(i, res);
  ws.send(JSON.stringify({ id: i, method, params, sessionId }));
});
const { targetId } = await send("Target.createTarget", { url: "about:blank" });
const { sessionId } = await send("Target.attachToTarget", { targetId, flatten: true });
const S = (m, p) => send(m, p, sessionId);
await S("Page.enable"); await S("Runtime.enable"); await S("Network.enable"); await S("Log.enable");

await S("Page.navigate", { url: pathToFileURL(htmlPath).href });
await sleep(2500);

const short = (u) => (u || "").replace(/^file:\/\/\//, "").replace(/^.*ai-study\//, "");

// requestId → url 映射，才能知道失败的是谁
const urlOf = new Map();
for (const e of events) {
  if (e.method === "Network.requestWillBeSent") {
    urlOf.set(e.params.requestId, e.params.request.url);
  }
}

console.log("=== 请求失败的资源 ===");
let any = false;
for (const e of events) {
  if (e.method === "Network.loadingFailed") {
    any = true;
    const u = urlOf.get(e.params.requestId);
    console.log(`  FAIL  ${String(e.params.type).padEnd(12)} ${e.params.errorText}`);
    console.log(`        ${short(u) || "(未知 URL)"}`);
  }
  if (e.method === "Network.responseReceived") {
    const r = e.params.response;
    if (r.status >= 400 || r.status === 0) {
      any = true;
      console.log(`  HTTP ${r.status}  ${short(r.url)}`);
    }
  }
}
if (!any) console.log("  （没有失败请求）");

console.log("\n=== 所有请求过的资源（按加载顺序）===");
for (const e of events) {
  if (e.method === "Network.requestWillBeSent") {
    const u = e.params.request.url;
    if (u.startsWith("file:")) console.log(`  ${short(u)}`);
  }
}

console.log("\n=== 成功加载的样式表与字体 ===");
for (const e of events) {
  if (e.method === "Network.responseReceived") {
    const r = e.params.response;
    if (/css|font|woff/.test(r.mimeType) || /\.(css|woff2)$/.test(r.url)) {
      console.log(`  ${r.status}  ${r.mimeType.padEnd(18)} ${short(r.url)}`);
    }
  }
}

console.log("\n=== 控制台日志 ===");
const logs = events.filter((e) => e.method === "Log.entryAdded");
if (!logs.length) console.log("  （无）");
for (const l of logs) console.log(`  [${l.params.entry.level}] ${l.params.entry.text.slice(0, 220)}`);

console.log("\n=== 最终样式表清单（含 @import 展开）===");
const r = await S("Runtime.evaluate", {
  expression: `JSON.stringify([...document.styleSheets].map(s => ({
    href: s.href ? s.href.replace(/^.*ai-study\\//,'') : '(inline)',
    rules: (()=>{ try { return s.cssRules.length } catch(e) { return 'BLOCKED' } })(),
    imports: (()=>{ try { return [...s.cssRules].filter(r=>r.type===3).map(r=>r.href.replace(/^.*ai-study\\//,'')) } catch(e){ return 'n/a' } })()
  })), null, 1)`,
  returnByValue: true,
});
console.log(r.result.value);
ws.close(); child.kill();
