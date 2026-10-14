#!/usr/bin/env node
/**
 * build-sprite.mjs — 把 templates/icons/*.svg 生成内联 sprite，注入目标 HTML
 *
 * 为什么用 sprite + <use>：
 *   24 个图标直接内联进每张卡片会让 HTML 变得没法读；
 *   <symbol> 只定义一次，用 <svg class="ic"><use href="#i-folder"/></svg> 引用。
 *   而且 stroke / stroke-width / stroke-dashoffset 都是**可继承**属性，
 *   写在 <use> 的外层 svg 上会传进影子内容——所以图标能跟着改粗细、也能做描边动画。
 *
 * 图文和视频共用同一份源（templates/icons/）。
 *
 * 用法：
 *   node scripts/build-sprite.mjs <目标.html> [更多.html ...]
 *   目标里需要有：  <!-- ICON-SPRITE:START -->  …  <!-- ICON-SPRITE:END -->
 */
import { readdirSync, readFileSync, writeFileSync, existsSync } from "node:fs";
import { join, resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const repo = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const iconDir = join(repo, "templates", "icons");

const targets = process.argv.slice(2).map((p) => resolve(p));
if (!targets.length) {
  console.error("用法：node scripts/build-sprite.mjs <目标.html> [更多.html ...]");
  process.exit(1);
}
if (!existsSync(iconDir)) {
  console.error(`✗ 找不到图标目录 ${iconDir}，先跑 node scripts/fetch-icons.mjs`);
  process.exit(1);
}

const START = "<!-- ICON-SPRITE:START -->";
const END = "<!-- ICON-SPRITE:END -->";

const files = readdirSync(iconDir)
  .filter((f) => f.endsWith(".svg"))
  .sort();

const symbols = files.map((f) => {
  const name = f.replace(/\.svg$/, "");
  const raw = readFileSync(join(iconDir, f), "utf8");
  const m = raw.match(/<svg[^>]*>([\s\S]*)<\/svg>/);
  if (!m) throw new Error(`${f} 里找不到 <svg>`);
  const inner = m[1]
    .split("\n")
    .map((l) => l.trim())
    .filter(Boolean)
    .join(" ");
  return `        <symbol id="i-${name}" viewBox="0 0 24 24">${inner}</symbol>`;
});

const sprite = [
  START,
  '      <svg class="sprite-defs" width="0" height="0" aria-hidden="true">',
  ...symbols,
  "      </svg>",
  "      " + END,
].join("\n");

let changed = 0;
for (const t of targets) {
  if (!existsSync(t)) {
    console.error(`✗ 找不到 ${t}`);
    process.exitCode = 1;
    continue;
  }
  const src = readFileSync(t, "utf8");
  const a = src.indexOf(START);
  const b = src.indexOf(END);
  if (a < 0 || b < 0) {
    console.error(`✗ ${t} 里没有 ICON-SPRITE 标记区`);
    process.exitCode = 1;
    continue;
  }
  const next = src.slice(0, a) + sprite + src.slice(b + END.length);
  if (next === src) {
    console.log(`· ${t} 未变化`);
  } else {
    writeFileSync(t, next, "utf8");
    console.log(`✓ ${t}  注入 ${symbols.length} 个图标`);
    changed++;
  }
}
console.log(`\n图标源：templates/icons/（${symbols.length} 个）· 更新 ${changed} 个文件`);
