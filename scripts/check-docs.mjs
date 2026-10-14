// check-docs.mjs — 文档与实现一致性守卫
// 用法: node scripts/check-docs.mjs
//
// 为什么需要它：
//   第 14 轮把「图左标注右」的两栏方案（layout: "split"）撤掉了 —— CSS 改了、CHANGELOG 记了，
//   但 SKILL.md 里那句「竖图加 "layout": "split"」忘了改，一直挂到第 16 轮才发现。
//   这是和「规则写了而脚本不拦」同一类的病：**文档说 A，实现是 B，没人拦。**
//
// 检查项：
//   D1  文档里提到的组件 class，必须在 templates/*.css 里真实存在
//   D2  文档里 shots.json 示例用到的字段，build-shots.py 必须真的读它
import { readFile, readdir } from "node:fs/promises";
import { existsSync } from "node:fs";
import path from "node:path";

const ROOT = path.resolve(".");

// 只检查这些前缀的 class —— 避免把 .md / .mjs / .css / .py 这类文件名当组件
const PREFIXES = ["p-", "c-", "t-", "ic-", "motif", "annot", "split-", "sprite-", "codebox", "flexcol", "mt-", "sm-", "lg-"];
// 几个不带前缀的、有意义的名字，逐个精确匹配
const EXACT = new Set(["frame", "marks", "chain"]);

const stripCssComments = (css) => css.replace(/\/\*[\s\S]*?\*\//g, "");

async function cssClassSet() {
  const dir = path.join(ROOT, "templates");
  const set = new Set();
  for (const f of await readdir(dir)) {
    if (!f.endsWith(".css")) continue;
    const css = stripCssComments(await readFile(path.join(dir, f), "utf8"));
    for (const m of css.matchAll(/\.(-?[A-Za-z_][\w-]*)/g)) set.add(m[1]);
  }
  return set;
}

// 只扫反引号内联码与围栏代码块，避免正文里的普通句号被当 class
function codeChunks(md) {
  const out = [];
  for (const m of md.matchAll(/```[\s\S]*?```/g)) out.push(m[0]);
  for (const m of md.matchAll(/`[^`\n]+`/g)) out.push(m[0]);
  return out;
}

function classesIn(text) {
  const found = new Set();
  for (const m of text.matchAll(/\.(-?[A-Za-z_][\w-]*)/g)) {
    const t = m[1];
    if (EXACT.has(t) || PREFIXES.some((p) => t.startsWith(p))) found.add(t);
  }
  return found;
}

// ---------- 执行 ----------
const errors = [];
const cssClasses = await cssClassSet();

// ---- D1 ----
const docPaths = [path.join(ROOT, "SKILL.md")];
const refDir = path.join(ROOT, "references");
if (existsSync(refDir)) {
  for (const f of await readdir(refDir)) {
    if (f.endsWith(".md")) docPaths.push(path.join(refDir, f));
  }
}
let d1Checked = 0;
for (const p of docPaths) {
  const rel = path.relative(ROOT, p);
  const md = await readFile(p, "utf8");
  const mentioned = new Set();
  for (const chunk of codeChunks(md)) for (const c of classesIn(chunk)) mentioned.add(c);
  for (const c of mentioned) {
    d1Checked++;
    if (!cssClasses.has(c)) {
      errors.push(
        `D1  ${rel} 提到了 .${c}，但 templates/*.css 里没有这个 class —— ` +
          "要么 class 被改名/删掉了（文档没跟上），要么文档写错了名字"
      );
    }
  }
}

// ---- D2 ----
const shotsScript = await readFile(path.join(ROOT, "scripts", "build-shots.py"), "utf8");
const known = new Set();
// 同时收 s[...] / s.get(...) / m[...] / spec[...] —— 顶层键走的是 spec
for (const m of shotsScript.matchAll(/(?:spec|[sm])(?:\.get\(|\[)["']([a-z_]+)["']/g)) {
  known.add(m[1]);
}

let d2Checked = 0;
const skillMd = await readFile(path.join(ROOT, "SKILL.md"), "utf8");
const jsonBlocks = [...skillMd.matchAll(/```json\n([\s\S]*?)```/g)].map((m) => m[1]);
for (const block of jsonBlocks) {
  for (const m of block.matchAll(/"([a-z_][a-z_0-9]*)":/g)) {
    const k = m[1];
    if (k.startsWith("_")) continue;
    d2Checked++;
    if (!known.has(k)) {
      errors.push(
        `D2  SKILL.md 的 shots.json 示例用了字段 "${k}"，但 scripts/build-shots.py 根本不读它 —— ` +
          "要么脚本漏了实现，要么字段名写错了"
      );
    }
  }
}

// ---------- 输出 ----------
console.log("=== 文档一致性守卫 ===");
console.log(`扫描文档 ${docPaths.length} 个；CSS class 白名单 ${cssClasses.size} 个`);
console.log(`D1 核对了 ${d1Checked} 处 class 引用；D2 核对了 ${d2Checked} 处 shots.json 字段`);
if (errors.length) {
  console.log(`\n发现 ${errors.length} 处不一致：\n`);
  for (const e of errors) console.log("  x " + e);
  console.log("\n结果：不通过。文档和实现必须一致——不一致的那一份就是在骗下一个人。");
  process.exitCode = 1;
} else {
  console.log("\n结果：通过，文档里提到的组件和字段都真实存在。");
}
