#!/usr/bin/env node
/**
 * tts.mjs — 把「口播稿.md」变成「narration.mp3」+「script.json」
 *
 * 用法：
 *   node scripts/tts.mjs "<口播稿.md>" "<输出目录>"
 *   选项：--voice=zh-CN-XiaomengNeural  --speed=1.2  --pitch=25
 *
 * 产出（写到输出目录）：
 *   script.json    —— 解析出的场景文本，供 align.py 复用（只解析一次，避免两种语言各写一份解析器）
 *   narration.mp3  —— 整段口播
 *
 * ⚠ 两个实测踩过的坑：
 *   1. 本机 edge-tts 直连与走代理都 403，**只能走这个网站的 HTTP 接口**。
 *   2. 该接口不带浏览器 UA / Referer / Origin 会返回 403。
 *      用 PowerShell 默认 UA 请求必失败——这不是网络问题，别去查网络。
 *   3. `pitch` 传**数字 25**（不是 "+25Hz"，转换在服务端做）。
 */
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { join, resolve } from "node:path";

const API = "https://tts.wangwangit.com/v1/audio/speech";
const UA =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/143.0.0.0 Safari/537.36";

function arg(name, fallback) {
  const hit = process.argv.find((a) => a.startsWith(`--${name}=`));
  return hit ? hit.slice(name.length + 3) : fallback;
}

/** 从口播稿.md 里抽出场景文本。格式约定见 references/口播稿规范.md §八。 */
function parseScript(md) {
  const scenes = [];
  let cur = null;
  for (const raw of md.split(/\r?\n/)) {
    const line = raw.trim();
    const m = line.match(/^\*\*【场景\s*(\d+)([^】]*)】\*\*$/);
    if (m) {
      if (cur) scenes.push(cur);
      cur = { n: Number(m[1]), head: `【场景 ${m[1]}${m[2]}】`, lines: [] };
      continue;
    }
    if (cur) {
      if (line.startsWith("---") || line.startsWith("##")) {
        scenes.push(cur);
        cur = null;
        continue;
      }
      if (line && !line.startsWith(">")) cur.lines.push(line);
    }
  }
  if (cur) scenes.push(cur);

  if (scenes.length === 0) {
    throw new Error("没解析出任何场景。口播稿里的场景标题必须是 **【场景 N · …】** 这种独占一行的写法。");
  }
  return scenes.map((s) => ({
    n: s.n,
    head: s.head,
    // 场景内部按行保留，逐行是一个语气块；文本用换行分隔喂给 TTS，得到自然的气口
    text: s.lines.join(""),
    paragraphs: s.lines,
  }));
}

const [, , mdPath, outDirArg] = process.argv;
if (!mdPath || !outDirArg) {
  console.error("用法：node scripts/tts.mjs \"<口播稿.md>\" \"<输出目录>\" [--voice=… --speed=… --pitch=…]");
  process.exit(1);
}

const outDir = resolve(outDirArg);
mkdirSync(outDir, { recursive: true });

const scenes = parseScript(readFileSync(resolve(mdPath), "utf8"));
const scriptJson = { source: resolve(mdPath), scenes };
writeFileSync(join(outDir, "script.json"), JSON.stringify(scriptJson, null, 2), "utf8");

// 场景之间用换行分隔 → TTS 会在句末标点处给出自然停顿
const input = scenes.map((s) => s.text).join("\n");
const chars = input.replace(/\s/g, "").length;

const voice = arg("voice", "zh-CN-XiaomengNeural");
const speed = Number(arg("speed", "1.2"));
const pitch = Number(arg("pitch", "25"));

console.log(`场景数     = ${scenes.length}`);
for (const s of scenes) console.log(`  ${s.head}  ${s.text.replace(/\s/g, "").length} 字`);
console.log(`可口播字数 = ${chars}`);
console.log(`音色/语速/音调 = ${voice} / ${speed}x / ${pitch}Hz`);
console.log(`预估时长   = ${(chars / 6.35).toFixed(1)}s（按 6.35 字/秒）`);
console.log(`→ POST ${API}`);

const t0 = Date.now();
const res = await fetch(API, {
  method: "POST",
  headers: {
    "Content-Type": "application/json",
    // 这三个头缺一不可，缺了就是 403
    "User-Agent": UA,
    Referer: "https://tts.wangwangit.com/",
    Origin: "https://tts.wangwangit.com",
  },
  body: JSON.stringify({ input, voice, speed, pitch, style: "general" }),
});

if (!res.ok) {
  const body = await res.text().catch(() => "");
  console.error(`✗ HTTP ${res.status} ${res.statusText}`);
  if (body) console.error(body.slice(0, 500));
  process.exit(1);
}

const buf = Buffer.from(await res.arrayBuffer());
const mp3 = join(outDir, "narration.mp3");
writeFileSync(mp3, buf);

console.log(`✓ ${mp3}`);
console.log(`  ${(buf.length / 1024).toFixed(1)} KB · 请求耗时 ${((Date.now() - t0) / 1000).toFixed(1)}s`);
console.log(`下一步：python scripts/align.py "${outDir}"`);
