// lint-tokens.mjs — 令牌守卫
// 用法: node scripts/lint-tokens.mjs [目录...]   默认检查 templates/ 和 output/*/*.html
//
// 设计系统的价值在于「约束可被强制执行」。这个脚本是闸门：
//   1. templates/*.css 里不允许出现字面色值（必须用令牌）
//   2. note.html 里不允许写内联 style（必须用组件 class）
//   3. components.css 里不允许出现魔法数字间距
//   4. 检查是否误用已否决的配色组合
import { readFile, readdir } from "node:fs/promises";
import path from "node:path";
import { existsSync } from "node:fs";

const ROOT = path.resolve(".");

const NAMED = new Set([
  "transparent", "inherit", "currentcolor", "none", "initial", "unset", "auto",
]);

const errors = [];
const warnings = [];

const isHex = (v) => /^#([0-9a-fA-F]{3,8})$/.test(v);
const isRgb = (v) => /^rgba?\(/i.test(v);

function stripComments(css) {
  return css.replace(/\/\*[\s\S]*?\*\//g, "");
}

async function lintCssFile(file) {
  const raw = await readFile(file, "utf8");
  const css = stripComments(raw);
  const rel = path.relative(ROOT, file);
  const isTokens = path.basename(file) === "tokens.css";
  const lines = css.split("\n");

  lines.forEach((line, i) => {
    const at = `${rel}:${i + 1}`;
    const trimmed = line.trim();
    if (!trimmed) return;

    // 1) 字面色值：tokens.css 之外一律禁止
    if (!isTokens) {
      const m = trimmed.match(
        /:\s*(#[0-9a-fA-F]{3,8}\b|rgba?\([^)]*\))/g
      );
      if (m) {
        // 允许 shadow 里的黑色透明（只有 shadow 类声明可用）
        const isShadow = /box-shadow|text-shadow/i.test(trimmed);
        for (const hit of m) {
          const val = hit.replace(/^\s*:\s*/, "");
          if (isShadow && /^rgba?\(\s*0[,\s]/.test(val)) continue;
          if (NAMED.has(val.toLowerCase())) continue;
          errors.push(
            `${at}  字面色值 ${val} —— 必须使用令牌（如 var(--ink-2)），不要在组件里写死颜色`
          );
        }
      }
    }

    // 2) 否决的配色组合
    if (/\bcolor:\s*#fff\b|\bcolor:\s*var\(--surface\)/.test(trimmed)) {
      warnings.push(
        `${at}  白色文字 —— 确认它不在 --brand-500 亮橙底上（对比度仅 2.80:1，已否决）`
      );
    }

    // 3) 魔法数字间距（仅 components.css）
    if (path.basename(file) === "components.css") {
      const m = trimmed.match(
        /\b(margin|padding|gap)(-\w+)?:\s*(-?\d+)px/
      );
      if (m) {
        const px = Math.abs(Number(m[3]));
        if (px !== 0 && px % 8 !== 0) {
          errors.push(
            `${at}  间距 ${m[0].trim()} —— ${px}px 不在 8px 栅格上，请改用 var(--sp-N)`
          );
        }
      }
    }
  });
}

async function lintHtmlFile(file) {
  const raw = await readFile(file, "utf8");
  const rel = path.relative(ROOT, file);
  const lines = raw.split("\n");

  lines.forEach((line, i) => {
    const at = `${rel}:${i + 1}`;
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("<!--")) return;

    // 1) 内联 style：必须用组件 class
    if (/\sstyle\s*=\s*"/.test(trimmed)) {
      errors.push(
        `${at}  内联 style —— 请改用组件 class（见 templates/components.css），不要把样式散进内容`
      );
    }

    // 2) 内联字面色值
    if (/(#[0-9a-fA-F]{6}|rgba?\()/.test(trimmed) && !/href|src|alt/.test(trimmed)) {
      errors.push(`${at}  内联字面色值 —— 请使用令牌或组件 class`);
    }

    // 3) 废弃的页眉页脚
    if (/class="[^"]*\bc-(head|foot)\b/.test(trimmed)) {
      errors.push(`${at}  使用了已废弃的 .c-head / .c-foot —— 版式铁律禁止页眉页脚`);
    }
  });
}

async function collect(dir, ext) {
  const out = [];
  if (!existsSync(dir)) return out;
  for (const e of await readdir(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) out.push(...(await collect(p, ext)));
    else if (e.name.endsWith(ext)) out.push(p);
  }
  return out;
}

// ---------- 执行 ----------
const cssFiles = await collect(path.join(ROOT, "templates"), ".css");
for (const f of cssFiles) await lintCssFile(f);

const outDir = path.join(ROOT, "output");
const tplDir = path.join(ROOT, "templates");
const htmlFiles = [
  ...(await collect(tplDir, ".html")),
  ...(await collect(outDir, ".html")),
];
for (const f of htmlFiles) await lintHtmlFile(f);

console.log("=== 令牌守卫 ===");
console.log(`检查 CSS ${cssFiles.length} 个、HTML ${htmlFiles.length} 个\n`);

if (warnings.length) {
  console.log(`提醒 ${warnings.length} 条：`);
  for (const w of warnings) console.log("  ? " + w);
  console.log("");
}

if (errors.length) {
  console.log(`发现 ${errors.length} 个违规：\n`);
  for (const e of errors) console.log("  x " + e);
  console.log("\n结果：不通过。请改用令牌或组件 class 后重跑。");
  process.exitCode = 1;
} else {
  console.log("结果：通过，没有裸色值、内联样式或魔法数字间距。");
}
