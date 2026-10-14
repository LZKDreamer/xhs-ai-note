// probe.mjs — 诊断工具：打开 HTML，打印样式表加载状态、卡片尺寸、指定元素计算样式
// 用法:
//   node scripts/probe.mjs <html文件>                  # 概览：尺寸 + 溢出
//   node scripts/probe.mjs <html文件> --sel=".p-end .ask"   # 查某个元素的样式
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
const argv = process.argv.slice(2);
const htmlArg = argv.find((a) => !a.startsWith("--"));
const selFlag = argv.find((a) => a.startsWith("--sel="));
const SEL = selFlag ? selFlag.replace("--sel=", "").replace(/^"|"$/g, "") : null;

const htmlPath = path.resolve(htmlArg);
const port = 9222 + Math.floor(Math.random() * 500);
const userDataDir = path.join(os.tmpdir(), `dsh-probe-${Date.now()}`);

const child = spawn(CHROME, [
  "--headless=new", "--disable-gpu", "--no-first-run",
  "--hide-scrollbars", "--force-device-scale-factor=1",
  `--remote-debugging-port=${port}`, `--user-data-dir=${userDataDir}`,
  "--window-size=1200,1500", "about:blank",
], { stdio: "ignore" });

let wsUrl = null;
for (let i = 0; i < 60; i++) {
  await sleep(300);
  try {
    const r = await fetch(`http://127.0.0.1:${port}/json/version`);
    if (r.ok) { wsUrl = (await r.json()).webSocketDebuggerUrl; break; }
  } catch {}
}
const ws = new WebSocket(wsUrl);
await new Promise((res) => ws.addEventListener("open", res, { once: true }));
let id = 0; const pending = new Map();
ws.addEventListener("message", (ev) => {
  const m = JSON.parse(ev.data);
  if (m.id && pending.has(m.id)) { pending.get(m.id)(m.result ?? m.error); pending.delete(m.id); }
});
const send = (method, params = {}, sessionId) => new Promise((res) => {
  const i = ++id; pending.set(i, res);
  ws.send(JSON.stringify({ id: i, method, params, sessionId }));
});
const { targetId } = await send("Target.createTarget", { url: "about:blank" });
const { sessionId } = await send("Target.attachToTarget", { targetId, flatten: true });
const S = (m, p) => send(m, p, sessionId);
await S("Page.enable"); await S("Runtime.enable");
await S("Page.navigate", { url: pathToFileURL(htmlPath).href });
await sleep(1500);
await S("Runtime.evaluate", { expression: "document.fonts.ready", awaitPromise: true, returnByValue: true });

const expression = SEL
  ? `(() => {
      const el = document.querySelector(${JSON.stringify(SEL)});
      if (!el) return 'NOT FOUND: ' + ${JSON.stringify(SEL)};
      const cs = getComputedStyle(el);
      const r = el.getBoundingClientRect();
      const rng = document.createRange(); rng.selectNodeContents(el);
      const cr = rng.getBoundingClientRect();
      const keys = ['color','backgroundColor','fontSize','fontWeight','fontFamily','display','width','height','padding','margin','zoom','opacity','visibility'];
      const out = { rect: [Math.round(r.width), Math.round(r.height)], textBox: [Math.round(cr.width), Math.round(cr.height)] };
      for (const k of keys) out[k] = cs[k];
      out.text = el.textContent.trim().slice(0, 40);
      return JSON.stringify(out, null, 1);
    })()`
  : `JSON.stringify({
      sheets: [...document.styleSheets].map(s => ({ href: s.href ? s.href.split('/').slice(-1)[0] : null, rules: (()=>{try{return s.cssRules.length}catch(e){return 'BLOCKED'}})() })),
      fontsLoaded: document.fonts.size,
      tokenCheck: (() => {
        const cs = getComputedStyle(document.documentElement);
        const keys = ['--w','--h','--bg','--ink','--brand-500','--on-brand','--on-ink','--sp-4','--fs-3'];
        return keys.map(k => k + '=' + (cs.getPropertyValue(k).trim() || 'MISSING'));
      })(),
      cards: [...document.querySelectorAll('.card')].map((el, i) => {
        const cs = getComputedStyle(el); const r = el.getBoundingClientRect();
        return { i: i+1, cls: el.className.split(' ').slice(0,2).join(' '),
          rect: [Math.round(r.width), Math.round(r.height)],
          display: cs.display, height: cs.height,
          scrollH: el.scrollHeight, clientH: el.clientHeight,
          overflow: el.scrollHeight - el.clientHeight };
      })
    }, null, 1)`;

const out = await S("Runtime.evaluate", { expression, returnByValue: true });
console.log(typeof out.result?.value === "string" ? out.result.value : JSON.stringify(out, null, 1));
ws.close(); child.kill();
