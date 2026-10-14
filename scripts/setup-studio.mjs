#!/usr/bin/env node
/**
 * setup-studio.mjs — 为 HyperFrames 工程接上图文的设计系统
 *
 * 为什么需要这一步：
 *   HyperFrames 会把资源路径**钳制在工程根目录内**，`../templates/xxx.css`
 *   这类向上穿越的路径在 render/preview 时会被改写或直接加载失败
 *   （lint 报 `invalid_parent_traversal_in_asset_path`）。
 *
 * 解法：
 *   在 `studio/` 下建两个目录联接（Windows junction / 类 Unix 目录软链）——
 *     studio/design -> templates/
 *     studio/fonts  -> fonts/
 *   这样 composition 里写 `./design/components.css`（不越界），
 *   而**设计的唯一出处仍然是 templates/，不产生第二份拷贝**。
 *
 * 注意：`components.css` 内部 `@import "../fonts/fonts.css"`，
 *   从 studio/design/components.css 解析为 studio/fonts/fonts.css，仍在工程内，合法。
 *
 * 用法：node scripts/setup-studio.mjs
 */
import { existsSync, symlinkSync, lstatSync, mkdirSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const repo = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const studio = join(repo, "studio");

const LINKS = [
  { link: join(studio, "design"), target: join(repo, "templates"), what: "设计系统" },
  { link: join(studio, "fonts"), target: join(repo, "fonts"), what: "本地字体" },
];

if (!existsSync(studio)) {
  console.error(`✗ 找不到 HyperFrames 工程目录：${studio}`);
  console.error(`  先初始化：npx hyperframes init studio --example blank --resolution portrait --non-interactive`);
  process.exit(1);
}

let created = 0;
let skipped = 0;

for (const { link, target, what } of LINKS) {
  if (!existsSync(target)) {
    console.error(`✗ ${what}目录不存在：${target}`);
    process.exit(1);
  }
  if (existsSync(link)) {
    const stat = lstatSync(link);
    if (stat.isSymbolicLink()) {
      console.log(`· 已存在，跳过：${link}`);
      skipped++;
      continue;
    }
    console.error(`✗ ${link} 已存在且不是联接（是真实目录）。`);
    console.error(`  请先确认里面没有需要保留的文件，然后手动删除再重跑。`);
    process.exit(1);
  }
  mkdirSync(dirname(link), { recursive: true });
  // Windows 上 type='junction' 不需要管理员权限；其他平台退化为目录软链
  symlinkSync(target, link, process.platform === "win32" ? "junction" : "dir");
  console.log(`✓ ${link} -> ${target}`);
  created++;
}

console.log(`\n完成：新建 ${created} 个，跳过 ${skipped} 个。`);
console.log(`自检：`);
for (const rel of ["design/components.css", "fonts/SmileySans-Oblique.woff2"]) {
  const p = join(studio, rel);
  console.log(`  ${existsSync(p) ? "✓" : "✗"} studio/${rel}`);
}
