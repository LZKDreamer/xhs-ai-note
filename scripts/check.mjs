// check.mjs — 全套验收，一条命令跑完
// 用法: node scripts/check.mjs
//
// 设计系统的价值在于约束可被强制执行。这个脚本把所有约束串成一条流水线：
//   1. 令牌守卫   —— 不许出现裸色值、内联样式、魔法数字间距
//   2. 配色审计   —— 对比度必须达标（WCAG 2.1）
//   3. 组件总览   —— styleguide 必须能正常渲染
//   4. 压力测试   —— 溢出兜底逻辑必须生效
//   5. 成品笔记   —— output/ 下每条笔记都必须零溢出且尺寸正确
//
// 任何一项失败，退出码非 0。
import { spawn } from "node:child_process";
import { readdir, stat } from "node:fs/promises";
import { existsSync } from "node:fs";
import path from "node:path";

const ROOT = path.resolve(".");
const results = [];

function run(args) {
  return new Promise((resolve) => {
    const child = spawn(process.execPath, args, { cwd: ROOT, stdio: ["ignore", "pipe", "pipe"] });
    let out = "";
    child.stdout.on("data", (d) => (out += d.toString()));
    child.stderr.on("data", (d) => (out += d.toString()));
    child.on("close", (code) => resolve({ code, out }));
  });
}

async function step(name, fn) {
  process.stdout.write(`\n${"─".repeat(64)}\n▶ ${name}\n${"─".repeat(64)}\n`);
  const ok = await fn();
  results.push({ name, ok });
}

// ---------- 1. 令牌守卫 ----------
await step("令牌守卫（裸色值 / 内联样式 / 魔法数字）", async () => {
  const r = await run(["scripts/lint-tokens.mjs"]);
  process.stdout.write(r.out.split("\n").slice(-6).join("\n") + "\n");
  return r.code === 0;
});

// ---------- 2. 配色审计 ----------
await step("配色审计（WCAG 2.1 对比度）", async () => {
  const r = await run(["scripts/contrast.mjs"]);
  const tail = r.out.trim().split("\n");
  process.stdout.write(tail.slice(-8).join("\n") + "\n");
  return r.code === 0;
});

// ---------- 3. 组件总览 ----------
await step("组件总览（styleguide 渲染）", async () => {
  const r = await run(["scripts/render.mjs", "templates/styleguide.html", "templates/_styleguide-out"]);
  process.stdout.write(r.out + "\n");
  return r.code === 0;
});

// ---------- 4. 压力测试：必须触发兜底，但不得留下溢出 ----------
await step("压力测试（溢出兜底生效 + 无残留溢出）", async () => {
  const r = await run([
    "scripts/render.mjs",
    "templates/fit-test.html",
    "templates/_fit-out",
    "--min-zoom=0.55",
  ]);
  process.stdout.write(r.out + "\n");
  const triggered = /自动适配：\d+ 张做了缩放/.test(r.out);
  if (!triggered) {
    process.stdout.write("  ✗ 压力测试页没有触发缩放，兜底逻辑可能失效\n");
    return false;
  }
  if (r.code !== 0) {
    process.stdout.write("  ✗ 仍有残留溢出（退出码非 0）\n");
    return false;
  }
  process.stdout.write("  ✓ 兜底已触发，且缩放后无残留溢出\n");
  return true;
});

// ---------- 5. 成品笔记 ----------
await step("成品笔记（output/ 下逐条渲染）", async () => {
  const outDir = path.join(ROOT, "output");
  if (!existsSync(outDir)) {
    process.stdout.write("  （output/ 下暂无笔记，跳过）\n");
    return true;
  }
  const notes = [];
  for (const e of await readdir(outDir, { withFileTypes: true })) {
    if (!e.isDirectory()) continue;
    const html = path.join(outDir, e.name, "note.html");
    if (existsSync(html)) notes.push({ name: e.name, html });
  }
  if (!notes.length) {
    process.stdout.write("  （没有找到 note.html，跳过）\n");
    return true;
  }
  let allOk = true;
  for (const n of notes) {
    const r = await run([
      "scripts/render.mjs",
      n.html,
      path.join(outDir, n.name, "images"),
    ]);
    const scaled = /自动适配：(\d+) 张做了缩放/.exec(r.out);
    const sizeOk = /均为 1080×1440/.test(r.out);
    const ok = r.code === 0 && sizeOk;
    if (!ok) allOk = false;
    process.stdout.write(
      `  ${ok ? "✓" : "✗"} ${n.name}` +
        `  尺寸${sizeOk ? "正确" : "异常"}` +
        `${scaled ? `，${scaled[1]} 张被缩放` : "，无需缩放"}` +
        `${r.code === 0 ? "" : "，有残留溢出"}\n`
    );
    if (!ok) process.stdout.write(r.out + "\n");
  }
  return allOk;
});

// ---------- 汇总 ----------
console.log(`\n${"═".repeat(64)}\n汇总\n${"═".repeat(64)}`);
for (const r of results) console.log(`  ${r.ok ? "通过" : "失败"}   ${r.name}`);
const failed = results.filter((r) => !r.ok);
console.log(
  `\n${failed.length ? `${failed.length} 项未通过` : "全部通过"}（共 ${results.length} 项）`
);
if (failed.length) process.exitCode = 1;
