#!/usr/bin/env node
/**
 * build-subs.mjs — 把 captions.json 单向生成进 composition 的字幕层
 *
 * 为什么要有这一步：
 *   字幕的**文字来自口播稿、时间来自 whisper 对齐**（见 align.py）。
 *   如果手抄进 HTML，每次改稿或重出音频都要手工同步一遍，必然出错。
 *   所以 composition 里只留两个标记区，内容由本脚本生成：
 *     HTML:  <!-- SUBS:START --> … <!-- SUBS:END -->
 *     JS:    // CAPS:START   … // CAPS:END
 *
 * 用法：node scripts/build-subs.mjs [composition.html] [captions.json]
 */
import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { join, resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const repo = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const htmlPath = resolve(process.argv[2] || join(repo, "studio", "index.html"));
const capsPath = resolve(
  process.argv[3] || join(repo, "studio", "videos", "wb-ch05-01-prompt-vs-skill", "captions.json")
);

for (const p of [htmlPath, capsPath]) {
  if (!existsSync(p)) {
    console.error(`✗ 找不到 ${p}`);
    process.exit(1);
  }
}

const { captions, scenes } = JSON.parse(readFileSync(capsPath, "utf8"));
if (!captions?.length) {
  console.error("✗ captions.json 里没有 captions");
  process.exit(1);
}

// 淡出 = 下一句起点 − 0.2；末句不淡出
const rows = captions.map((c, i) => {
  const next = captions[i + 1];
  const out = next ? Math.max(c.start + 0.3, next.start - 0.2) : null;
  return { i, start: c.start, end: out, text: c.text };
});

const esc = (s) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

const subsHtml = rows
  .map((r) => `        <div class="sub-line" data-sub="${r.i}">${esc(r.text)}</div>`)
  .join("\n");

const capsJs = rows
  .map((r) => `        [${r.i}, ${r.start.toFixed(2)}, ${r.end === null ? "null" : r.end.toFixed(2)}],`)
  .join("\n");

const MARK = {
  htmlStart: "<!-- SUBS:START -->",
  htmlEnd: "<!-- SUBS:END -->",
  jsStart: "// CAPS:START",
  jsEnd: "// CAPS:END",
};

function replaceRegion(src, startMark, endMark, body, indent) {
  const a = src.indexOf(startMark);
  const b = src.indexOf(endMark);
  if (a < 0 || b < 0 || b < a) throw new Error(`找不到标记区 ${startMark} … ${endMark}`);
  return src.slice(0, a + startMark.length) + "\n" + body + "\n" + indent + src.slice(b);
}

let html = readFileSync(htmlPath, "utf8");
html = replaceRegion(html, MARK.htmlStart, MARK.htmlEnd, subsHtml, "        ");
html = replaceRegion(html, MARK.jsStart, MARK.jsEnd, `      const CAPS = [\n${capsJs}\n      ];`, "      ");
writeFileSync(htmlPath, html, "utf8");

const longest = rows.reduce((m, r) => Math.max(m, r.text.length), 0);
// 46px 字号、904px 可用宽 → 每行约 19.6 字，所以 ≥40 字才会出现第 3 行。
// 这里按 30 字设警戒线，留足余量。
const LINE_LIMIT = 30;
const overLimit = rows.filter((r) => r.text.length > LINE_LIMIT);

console.log(`字幕已写入 ${htmlPath}`);
console.log(`  条数        = ${rows.length}（来自 ${scenes.length} 个场景）`);
console.log(`  最长一条    = ${longest} 字（每行约 19.6 字 → 最多 ${Math.ceil(longest / 19.6)} 行）`);
console.log(`  超过 ${LINE_LIMIT} 字  = ${overLimit.length} 条${overLimit.length ? " ← 有压到播放器 UI 的风险，需要再拆" : "（安全）"}`);
console.log(`  首条        = ${rows[0].start.toFixed(2)}s`);
const last = rows[rows.length - 1];
console.log(`  末条起      = ${last.start.toFixed(2)}s`);
if (overLimit.length) process.exitCode = 1;
