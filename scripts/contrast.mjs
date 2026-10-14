// contrast.mjs — 按 WCAG 2.1 审计 tokens.css 的配色对比度
// 用法: node scripts/contrast.mjs
//
// 设计系统的价值在于「约束可被验证」。这个脚本把配色规范变成机器可验收的检查，
// 任何改色的人（或 agent）都必须让它通过。
import { readFile } from "node:fs/promises";
import path from "node:path";

const css = await readFile(path.resolve("templates/tokens.css"), "utf8");
const tokens = {};
const rootBlock = css.split(":root")[1]?.split("}")[0] ?? "";
for (const m of rootBlock.matchAll(/--([a-z0-9-]+):\s*(#[0-9a-fA-F]{3,8})/g)) {
  tokens[m[1]] = m[2];
}
const T = (k) => {
  if (!tokens[k]) throw new Error(`tokens.css 缺少 --${k}`);
  return tokens[k];
};

const hex2rgb = (h) => {
  h = String(h).replace("#", "");
  if (h.length === 3) h = h.split("").map((c) => c + c).join("");
  return [0, 2, 4].map((i) => parseInt(h.slice(i, i + 2), 16));
};
const lum = (hex) =>
  hex2rgb(hex)
    .map((v) => {
      const s = v / 255;
      return s <= 0.03928 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4);
    })
    .reduce((a, v, i) => a + v * [0.2126, 0.7152, 0.0722][i], 0);
const ratio = (a, b) => {
  const [l1, l2] = [lum(a), lum(b)].sort((x, y) => y - x);
  return (l1 + 0.05) / (l2 + 0.05);
};

// [说明, 前景 token, 背景 token, 等级]
// 等级：body=4.5（正文）｜large=3（大字/图形）｜deco=1.2（纯装饰）
const checks = [
  ["正文（主）", "ink", "bg", "body"],
  ["正文（次）", "ink-2", "bg", "body"],
  ["弱化文字", "ink-3", "bg", "body"],
  ["超弱文字（大字）", "ink-4", "bg", "large"],
  ["橙色小标签字", "brand-700", "bg", "body"],
  ["橙色强调字", "brand-600", "bg", "large"],
  // 品牌填充卡的真实用法：亮橙底 + 深字（这是选定方案）
  ["主色底 + 深字（正文）", "on-brand", "brand-500", "body"],
  ["主色底 + 深字（大字）", "on-brand", "brand-500", "body"],
  ["浅橙底 + 深字", "on-brand", "brand-200", "body"],
  ["次底卡片正文", "ink-2", "surface-2", "body"],
  ["次底卡片弱字", "ink-3", "surface-2", "body"],
  [
    "白字压深橙（备选方案）",
    "surface",
    "brand-700",
    "body",
  ],
  ["深色条 + 白字", "surface", "ink", "body"],
  ["深色条 + 亮橙字", "brand-400", "ink", "large"],
  ["卡片描边（装饰）", "line-strong", "bg", "deco"],
  ["分隔线（装饰）", "line", "bg", "deco"],
];

// 被明确否决的组合：只记录、不计入失败，防止有人「顺手改回去」
const rejected = [
  ["【已否决】白字压亮橙——对比度不足，正文会糊", "surface", "brand-500"],
  ["【已否决】浅橙字压亮橙——对比度不足", "brand-200", "brand-500"],
];
const NEED = { body: 4.5, large: 3, deco: 1.2 };

console.log("=== 配色对比度审计（WCAG 2.1）===\n");
console.log("正文需 >=4.5:1 ｜ 大字与图形需 >=3:1 ｜ 装饰 >=1.2:1\n");
console.log(["组合", "前景", "背景", "对比度", "要求", "结果"].join("\t"));

let fails = 0;
for (const [name, fgKey, bgKey, level] of checks) {
  const fg = T(fgKey);
  const bg = T(bgKey);
  const r = ratio(fg, bg);
  const need = NEED[level];
  const ok = r >= need;
  if (!ok) fails++;
  console.log(
    [
      name,
      `--${fgKey} ${fg}`,
      `--${bgKey} ${bg}`,
      r.toFixed(2) + ":1",
      `>=${need}`,
      ok ? "PASS" : "FAIL <<<",
    ].join("\t")
  );
}
console.log(`\n结果：${checks.length} 组检查，${fails} 组不通过。`);

console.log("\n--- 已否决组合（仅记录，不计入失败）---");
for (const [name, fgKey, bgKey] of rejected) {
  const r = ratio(T(fgKey), T(bgKey));
  console.log(`${name}\t${r.toFixed(2)}:1\t${r < 4.5 ? "确认不可用" : "★ 现在居然可用，需要复核"}`);
}

if (fails) process.exitCode = 1;
