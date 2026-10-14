#!/usr/bin/env node
/**
 * render.mjs — 把 templates 里的 HTML（多张 .card）批量导出为 3:4 PNG
 *
 * 原理：直连系统 Chrome 的 DevTools Protocol（Node 24 内置 WebSocket），
 *      不开新进程依赖、不需要 Playwright。
 *
 * 用法：
 *   node scripts/render.mjs <html文件> [输出目录] [--scale=1] [--only=1,3,5]
 *
 * 例：
 *   node scripts/render.mjs output/wb-ch05/note.html output/wb-ch05/images
 */

import { spawn } from "node:child_process";
import { mkdir, writeFile, rm, readFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import { pathToFileURL } from "node:url";
import path from "node:path";
import os from "node:os";

const CHROME_CANDIDATES = [
  "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe",
  "C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe",
  "C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe",
  "C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe",
  "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
  "/usr/bin/google-chrome",
  "/usr/bin/chromium",
];

function findBrowser() {
  for (const p of CHROME_CANDIDATES) if (existsSync(p)) return p;
  return null;
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function main() {
  const args = process.argv.slice(2);
  const positional = args.filter((a) => !a.startsWith("--"));
  const flags = Object.fromEntries(
    args
      .filter((a) => a.startsWith("--"))
      .map((a) => {
        const [k, v] = a.replace(/^--/, "").split("=");
        return [k, v ?? true];
      })
  );

  const htmlArg = positional[0];
  if (!htmlArg) {
    console.error("用法: node scripts/render.mjs <html文件> [输出目录] [--scale=1] [--only=1,3]");
    process.exit(2);
  }
  const htmlPath = path.resolve(htmlArg);
  if (!existsSync(htmlPath)) {
    console.error(`找不到 HTML: ${htmlPath}`);
    process.exit(2);
  }
  const outDir = path.resolve(
    positional[1] || path.join(path.dirname(htmlPath), "images")
  );
  const scale = Number(flags.scale || 1);
  const only = flags.only
    ? String(flags.only)
        .split(",")
        .map((n) => Number(n.trim()))
    : null;

  const browser = findBrowser();
  if (!browser) {
    console.error("❌ 没有找到 Chrome / Edge，无法自动出图。");
    console.error("   解决方案：① 安装 Chrome 后重试  ② 用浏览器打开 HTML 手动截图");
    process.exit(3);
  }

  await mkdir(outDir, { recursive: true });

  const port = 9222 + Math.floor(Math.random() * 500);
  const userDataDir = path.join(os.tmpdir(), `dsh-render-${Date.now()}`);
  const child = spawn(
    browser,
    [
      "--headless=new",
      "--disable-gpu",
      "--no-first-run",
      "--no-default-browser-check",
      "--hide-scrollbars",
      "--force-device-scale-factor=1",
      "--allow-file-access-from-files",
      `--remote-debugging-port=${port}`,
      `--user-data-dir=${userDataDir}`,
      "--window-size=1200,1500",
      "about:blank",
    ],
    { stdio: "ignore" }
  );

  let wsUrl = null;
  for (let i = 0; i < 60; i++) {
    await sleep(300);
    try {
      const res = await fetch(`http://127.0.0.1:${port}/json/version`);
      if (res.ok) {
        wsUrl = (await res.json()).webSocketDebuggerUrl;
        break;
      }
    } catch {
      /* 还没起来 */
    }
  }
  if (!wsUrl) {
    child.kill();
    console.error("❌ 浏览器调试端口没起来。请手动开浏览器截图。");
    process.exit(3);
  }

  const ws = new WebSocket(wsUrl);
  await new Promise((res, rej) => {
    ws.addEventListener("open", res, { once: true });
    ws.addEventListener("error", rej, { once: true });
  });

  let msgId = 0;
  const pending = new Map();
  ws.addEventListener("message", (ev) => {
    let m;
    try {
      m = JSON.parse(ev.data);
    } catch {
      return;
    }
    if (m.id && pending.has(m.id)) {
      const { resolve, reject } = pending.get(m.id);
      pending.delete(m.id);
      m.error ? reject(new Error(JSON.stringify(m.error))) : resolve(m.result);
    }
  });

  const send = (method, params = {}, sessionId) =>
    new Promise((resolve, reject) => {
      const id = ++msgId;
      pending.set(id, { resolve, reject });
      ws.send(JSON.stringify({ id, method, params, sessionId }));
    });

  // 新建 target 并 attach
  const { targetId } = await send("Target.createTarget", { url: "about:blank" });
  const { sessionId } = await send("Target.attachToTarget", {
    targetId,
    flatten: true,
  });
  const S = (m, p) => send(m, p, sessionId);

  await S("Page.enable");
  await S("Runtime.enable");
  await S("Emulation.setDeviceMetricsOverride", {
    width: 1080,
    height: 1440,
    deviceScaleFactor: 1,
    mobile: false,
  });

  const url = pathToFileURL(htmlPath).href;
  await S("Page.navigate", { url });
  await sleep(400);

  // 等字体和图片都就绪
  await S("Runtime.evaluate", {
    expression: `(async () => {
      try { await document.fonts.ready; } catch (e) {}
      const imgs = [...document.images];
      await Promise.all(imgs.map(i => i.complete ? null : new Promise(r => { i.onload = i.onerror = r; })));
      return document.querySelectorAll('.card').length;
    })()`,
    awaitPromise: true,
    returnByValue: true,
  });
  await sleep(600);

  // ---------- 自动适配：内容超高则整体等比缩放，而不是被裁掉 ----------
  // 原理：卡片高 1440，可用高度 = 1440 - padding(80+80) = 1280。
  //      用二分法找到最大的 zoom，使内容在 1280 内放下。
  //      用 zoom 而不是 transform：zoom 会真正改变布局尺寸，
  //      内容会重新排版（文字更早换行），比等比缩放的观感更好。
  const autoFit = flags["no-autofit"] ? false : true;
  const MIN_ZOOM = Number(flags["min-zoom"] || 0.7);
  // 容差：缩放幅度小于 1% 就不做（否则每次重渲染都在边界反复触发）。
  const TOLERANCE = 0.99;
  // 溢出容差：不足 1% 的溢出视为像素噪声。
  // 1280 × 1% ≈ 13px，眼睛看不出来；比这更小的溢出不值得触发缩放。
  const OVERFLOW_TOL = Number(flags["overflow-tol"] || 13);

  const fitReport = await S("Runtime.evaluate", {
    expression: `(() => {
      const MIN = ${MIN_ZOOM};
      const TOL = ${TOLERANCE};
      const OV = ${OVERFLOW_TOL};
      // 测量内容的真实底边。
      //
      // 这里试错了三次，把原则记下来，避免以后又踩：
      //   ✗ 子元素 rect 求并集 —— 页脚有 margin-top:auto，自动撑开的空白被算成内容，
      //     「刚好放下」的页会被误判成溢出。
      //   ✗ offsetHeight 求和 —— 同理，弹性子项被撑高后 offsetHeight 也含空白。
      //   ✗ scrollHeight 与 clientHeight 之差 —— 在 zoom ≠ 1 时不可靠，二分法会卡在下限。
      //   ✓ 测量时临时把裁剪打开（overflow:visible），量出真实内容底边，再恢复。
      //     同时用「定位元素相对卡片的偏移」来量，zoom 下依然给出 CSS 像素坐标。
      const overflowOf = (card) => {
        const prevOverflow = card.style.overflow;
        card.style.overflow = 'visible';
        const cr = card.getBoundingClientRect();
        let bottom = cr.top;
        for (const c of [...card.children, ...card.querySelectorAll('*')]) {
          const cs = getComputedStyle(c);
          if (cs.display === 'none' || cs.visibility === 'hidden') continue;
          const r = c.getBoundingClientRect();
          if (r.width === 0 && r.height === 0) continue;
          bottom = Math.max(bottom, r.bottom);
        }
        card.style.overflow = prevOverflow;
        const cs = getComputedStyle(card);
        const limit = card.clientHeight - parseFloat(cs.paddingBottom);
        return { bottom: bottom - cr.top, limit, overflow: Math.max(0, bottom - cr.top - limit) };
      };
      const results = [];
      const cards = [...document.querySelectorAll('.card')];
      cards.forEach((card, i) => {
        card.style.zoom = '';
        const base = overflowOf(card);
        const inner = Math.round(base.limit - parseFloat(getComputedStyle(card).paddingTop));
        // 判定：溢出量不超过 OV（约 1% 可用高度）视为像素噪声，不触发缩放
        if (!${autoFit} || base.overflow <= OV) {
          results.push({
            page: i + 1,
            zoom: 1,
            content: Math.round(base.bottom),
            inner,
            overflow: Math.round(base.overflow),
          });
          return;
        }
        // 二分找最大可用缩放
        let lo = MIN, hi = 1, best = null;
        for (let k = 0; k < 12; k++) {
          const mid = (lo + hi) / 2;
          card.style.zoom = String(mid);
          if (overflowOf(card).overflow <= OV) { best = mid; lo = mid; } else { hi = mid; }
        }
        const found = best === null ? MIN : best;
        const finalZoom = found >= TOL ? 1 : Math.floor(found * 1000) / 1000;
        card.style.zoom = finalZoom === 1 ? '' : String(finalZoom);
        const after = overflowOf(card);
        results.push({
          page: i + 1,
          zoom: finalZoom,
          content: Math.round(base.bottom),
          inner,
          overflow: Math.round(after.overflow),
        });
      });
      return JSON.stringify(results);
    })()`,
    returnByValue: true,
  });
  const fits = JSON.parse(fitReport.result.value);
  await sleep(150);

  const { result } = await S("Runtime.evaluate", {
    expression: `JSON.stringify([...document.querySelectorAll('.card')].map(el => {
      const r = el.getBoundingClientRect();
      const cs = getComputedStyle(el);
      return {
        w: Math.round(parseFloat(cs.width)),
        h: Math.round(parseFloat(cs.height)),
        x: r.left + window.scrollX,
        y: r.top + window.scrollY,
        cls: el.className,
        scrollH: el.scrollHeight,
        clientH: el.clientHeight,
      };
    }))`,
    returnByValue: true,
  });

  const cards = JSON.parse(result.value);
  if (!cards.length) {
    ws.close();
    child.kill();
    console.error("❌ HTML 里没有找到 .card 元素。");
    process.exit(4);
  }

  console.log(`共 ${cards.length} 张卡片，输出到 ${outDir}`);
  if (autoFit) {
    const fitted = fits.filter((f) => f.zoom < 1);
    if (fitted.length) {
      console.log(`\n自动适配：${fitted.length} 张做了缩放以避免裁切`);
      for (const f of fitted) {
        const atFloor = f.zoom <= MIN_ZOOM + 0.001;
        const tight = f.zoom < 0.9;
        const warn = atFloor
          ? "  ⚠️ 已到最小缩放，内容过多，建议拆页"
          : tight
          ? "  ! 明显缩小，建议精简文字"
          : "";
        console.log(
          `  第 ${String(f.page).padStart(2, "0")} 张  内容 ${f.content}px / 可用 ${f.inner}px` +
            ` → 缩放 ${(f.zoom * 100).toFixed(1)}%${warn}`
        );
      }
    } else {
      console.log("\n自动适配：所有页面都在安全高度内，无需缩放");
    }
  }
  console.log("");

  const report = [];

  for (let i = 0; i < cards.length; i++) {
    const idx = i + 1;
    if (only && !only.includes(idx)) continue;
    const c = cards[i];
    const fit = fits.find((f) => f.page === idx) || { zoom: 1, overflow: 0 };
    const overflow = fit.overflow;
    const file = path.join(outDir, `${String(idx).padStart(2, "0")}.png`);
    const { data } = await S("Page.captureScreenshot", {
      format: "png",
      clip: { x: c.x, y: c.y, width: c.w, height: c.h, scale },
      captureBeyondViewport: true,
      optimizeForSpeed: false,
    });
    await writeFile(file, Buffer.from(data, "base64"));
    report.push({ page: idx, file, w: c.w, h: c.h, overflow, zoom: fit.zoom });
  }

  ws.close();
  child.kill();
  await rm(userDataDir, { recursive: true, force: true }).catch(() => {});

  const bad = report.filter((r) => r.overflow > OVERFLOW_TOL);
  console.log(`✅ 导出完成：${report.length} 张（均为 ${report[0]?.w}×${report[0]?.h}）`);
  if (bad.length) {
    console.log(`⚠️ 有 ${bad.length} 张仍溢出，已缩到最小仍放不下，必须减少文字或拆页：`);
    bad.forEach((b) => console.log(`   第 ${b.page} 张，缩放 ${(b.zoom * 100).toFixed(1)}%，溢出 ${b.overflow}px`));
    process.exitCode = 5;
  }
}

main().catch((e) => {
  console.error("渲染失败:", e.message);
  process.exit(1);
});
