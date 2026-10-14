#!/usr/bin/env node
/**
 * fetch-icons.mjs — 按清单拉取 Lucide 图标 SVG（只取用到的，不装整包）
 *
 * 为什么不用 npm 包：`lucide-static` 解包 **51.8 MB**，而本项目只用约 24 个图标。
 * 为什么内联：内联的 SVG 才能直接做 `stroke-dashoffset` 动画（自己画出来的效果），
 *            而且渲染时零网络请求。
 *
 * 授权：Lucide 为 ISC（可商用），其中部分图标派生自 Feather（MIT）。
 *      两个许可都要求"在副本中保留版权声明"，所以同步写 LICENSES.md。
 *
 * 用法：node scripts/fetch-icons.mjs
 */
import { mkdirSync, writeFileSync, existsSync, readFileSync } from "node:fs";
import { join, resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const VERSION = "1.57.0";
const BASE = `https://cdn.jsdelivr.net/npm/lucide-static@${VERSION}/icons`;

/** 按图元归组的图标清单。加图标只改这里。 */
const ICONS = [
  // 时间轴对比：一次对话 → 长期
  "message-circle", "infinity", "clock", "x-circle",
  // 容器剖面：能装什么
  "folder", "type", "layers", "file-text", "terminal", "layout-template", "image",
  // 触发图：谁主动发起
  "user", "bot", "mouse-pointer-click", "zap",
  // 前后流程
  "repeat", "refresh-cw", "check-circle",
  // 堆叠量 / 判定 / 母题
  "copy", "git-branch", "check", "sparkles", "hard-drive", "plus",
];

const repo = resolve(dirname(fileURLToPath(import.meta.url)), "..");
// ⚠ 放在 templates/icons/ 而不是 studio/ 下：
//   这样图文（templates/*.html）和视频（studio/index.html → ./design/icons/，
//   因为 studio/design 是 templates/ 的目录联接）**共用同一份图标**，不产生第二份。
const outDir = join(repo, "templates", "icons");
mkdirSync(outDir, { recursive: true });

let ok = 0, skip = 0, fail = 0;
const manifest = [];

for (const name of ICONS) {
  const file = join(outDir, `${name}.svg`);
  if (existsSync(file)) {
    manifest.push({ name, bytes: readFileSync(file).length, cached: true });
    skip++;
    continue;
  }
  try {
    const res = await fetch(`${BASE}/${name}.svg`, {
      headers: { "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/143.0.0.0 Safari/537.36" },
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const svg = (await res.text()).trim();
    // ⚠ Lucide 的 SVG 开头带一行 `<!-- @license lucide-static vX - ISC -->`，
    //   那是授权要求的版权声明，必须保留。所以用 includes 而不是 startsWith。
    if (!svg.includes("<svg")) throw new Error("不是 SVG");
    writeFileSync(file, svg + "\n", "utf8");
    manifest.push({ name, bytes: svg.length, cached: false });
    ok++;
  } catch (e) {
    console.error(`✗ ${name}: ${e.message}`);
    fail++;
  }
}

const license = `# 图标授权声明

本目录下的 SVG 图标来自 **Lucide**（https://github.com/lucide-icons/lucide），版本 ${VERSION}。

- Lucide 本体：**ISC License**，Copyright (c) Lucide Icons and Contributors
- 其中部分图标派生自 **Feather**（https://github.com/feathericons/feather）：**MIT License**，Copyright (c) 2013-present Cole Bemis

两个许可都要求在副本中保留版权声明，因此本文件随图标一同入库。

---

## ISC License

Permission to use, copy, modify, and/or distribute this software for any
purpose with or without fee is hereby granted, provided that the above
copyright notice and this permission notice appear in all copies.

THE SOFTWARE IS PROVIDED "AS IS" AND THE AUTHOR DISCLAIMS ALL WARRANTIES
WITH REGARD TO THIS SOFTWARE INCLUDING ALL IMPLIED WARRANTIES OF
MERCHANTABILITY AND FITNESS. IN NO EVENT SHALL THE AUTHOR BE LIABLE FOR
ANY SPECIAL, DIRECT, INDIRECT, OR CONSEQUENTIAL DAMAGES OR ANY DAMAGES
WHATSOEVER RESULTING FROM LOSS OF USE, DATA OR PROFITS, WHETHER IN AN
ACTION OF CONTRACT, NEGLIGENCE OR OTHER TORTIOUS ACTION, ARISING OUT OF
OR IN CONNECTION WITH THE USE OR PERFORMANCE OF THIS SOFTWARE.

---

## MIT License (Feather 派生图标)

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.
`;
writeFileSync(join(outDir, "LICENSES.md"), license, "utf8");
writeFileSync(join(outDir, "_manifest.json"), JSON.stringify({ version: VERSION, icons: manifest }, null, 2), "utf8");

console.log(`Lucide ${VERSION} → studio/vendor/icons/`);
console.log(`  已下载 ${ok} · 已存在 ${skip} · 失败 ${fail}`);
const total = manifest.reduce((s, m) => s + m.bytes, 0);
console.log(`  合计 ${manifest.length} 个图标，${(total / 1024).toFixed(1)} KB`);
console.log(`  授权声明已写入 LICENSES.md`);
if (fail) process.exit(1);
