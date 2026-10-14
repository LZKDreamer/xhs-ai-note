// check-copy.mjs — 内容守卫（和 lint-tokens.mjs 对称：那个守设计，这个守内容）
// 用法: node scripts/check-copy.mjs [笔记目录...]    默认检查 output/*/
//
// 为什么需要它：
//   check.mjs 原本 5 步全在设计层（令牌 / 对比度 / 渲染 / 溢出 / 尺寸），内容层一项都没有。
//   结果就是标题能连写两版都不命中《标题与封面规范.md》的 8 型公式，
//   9 张图能从头到尾不出现项目名——**规则写了而脚本不拦，等于没写。**
//   这个脚本把内容规范里「机械可查」的部分变成硬失败。
//
// 检查项：
//   C1  note.html 的 <html> 上必须声明 data-subject（本条笔记的主角名字）
//   C2  封面必须出现主角名（不用代词开场）
//   C3  主角名在整篇出现 ≥2 次（封面 + 至少一个内页）
//   C4  笔记.md 必须有「标题公式映射」块（公式 / 骨架 / 标题片段）
//   C5  「标题片段」必须是封面主标题的字面子串（防止声明和标题两张皮）
//   C6  封面主标题 ≤16 字、正文首行标题 ≤20 字（小红书硬规则）
//   C7  禁用词
//   C8  必须至少有一页「能带走的东西」（.p-list / .p-steps / .p-compare）
//   W1  启发式提醒：封面主标题读起来像说明书标签
import { readFile, readdir } from "node:fs/promises";
import { existsSync } from "node:fs";
import path from "node:path";

const ROOT = path.resolve(".");

const FORMULAS = [
  "数字清单", "我+代价+收获", "反转结论", "速成教程",
  "社会证明", "对比站队", "情绪短句", "概念降维",
];

const BANNED = [
  "震惊", "重磅", "炸裂", "必看", "干货满满",
  "多个", "一系列", "发布了", "盘点",
];

// 说明书式标签的启发式：一个钩子通常带有否定/对比/人称/疑问/数字里的至少一种
const HOOK_MARKERS = [
  "不是", "其实", "别", "你", "我", "为什么", "怎么", "才是", "还能", "以为", "只会",
  /\d/,
];

const stripTags = (html) =>
  html
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/\s+/g, " ")
    .trim();

// 规范里的字数算法：汉字、标点、数字、字母各算 1；空格不算
const countChars = (s) => s.replace(/\s/g, "").length;

function sectionsOf(html) {
  return html
    .split(/(?=<section class="card)/)
    .filter((s) => s.includes('<section class="card'));
}

function coverTitleFrom(md) {
  const marker = md.indexOf("**已选（封面主标题）**");
  if (marker < 0) return null;
  const tail = md.slice(marker);
  const m = tail.match(/^>\s*\*\*(.+?)\*\*\s*$/m);
  return m ? m[1].trim() : null;
}

function bodyTitleFrom(md) {
  const marker = md.indexOf("## 三、小红书正文");
  if (marker < 0) return null;
  const tail = md.slice(marker).split("\n");
  let seenHint = false;
  for (const line of tail) {
    const t = line.trim();
    if (t.startsWith("> 标题就是")) { seenHint = true; continue; }
    if (!seenHint) continue;
    if (!t || t.startsWith(">") || t.startsWith("#") || t.startsWith("---")) continue;
    return t;
  }
  return null;
}

function mappingFrom(md) {
  const block = md.match(/```text\n([\s\S]*?)```/);
  if (!block) return null;
  const out = {};
  for (const line of block[1].split("\n")) {
    const m = line.match(/^\s*([^:：]+)\s*[:：]\s*(.+?)\s*$/);
    if (m) out[m[1].trim()] = m[2].trim();
  }
  return out;
}

async function checkNote(dirName) {
  const dir = path.join(ROOT, "output", dirName);
  const htmlPath = path.join(dir, "note.html");
  const mdPath = path.join(dir, "笔记.md");
  const errors = [];
  const warns = [];

  if (!existsSync(htmlPath) || !existsSync(mdPath)) return null;
  const html = await readFile(htmlPath, "utf8");
  const md = await readFile(mdPath, "utf8");

  // ---- C1 主角名 ----
  const subjMatch = html.match(/<html[^>]*\bdata-subject="([^"]+)"/);
  const subject = subjMatch ? subjMatch[1].trim() : null;
  if (!subject) {
    errors.push(
      "C1  缺少 data-subject —— 在 note.html 的 <html> 上声明本条笔记的主角名字" +
        "（项目名 / 产品名 / 概念名），否则无法检查「有没有报出名字」"
    );
  }

  const secs = sectionsOf(html);
  const cover = secs.find((s) => s.includes("p-cover")) || "";
  const shots = secs.filter((s) => s.includes("p-shot"));
  const visible = stripTags(html);

  if (subject) {
    // ---- C2 封面出现主角名 ----
    if (!stripTags(cover).includes(subject)) {
      errors.push(
        `C2  封面没有出现主角名「${subject}」—— 读者没读过原文，第一页就要报出名字，` +
          "不能一路用「它」"
      );
    }
    // ---- C3 出现 ≥2 次 ----
    const hits = visible.split(subject).length - 1;
    if (hits < 2) {
      errors.push(
        `C3  主角名「${subject}」整篇只出现 ${hits} 次 —— 至少要封面 + 一个内页各一次`
      );
    }
  }

  // ---- C4 标题公式映射 ----
  const map = mappingFrom(md);
  if (!map) {
    errors.push(
      "C4  笔记.md 里没有「标题公式映射」块 —— 必须先选 8 型公式之一并填槽位，" +
        "再写标题（格式见 references/标题与封面规范.md §三）"
    );
  } else {
    const f = map["公式"];
    if (!f) errors.push("C4  映射块里缺少「公式:」行");
    else if (!FORMULAS.includes(f)) {
      errors.push(`C4  公式「${f}」不在 8 型之内：${FORMULAS.join(" / ")}`);
    }
    if (!map["骨架"]) errors.push("C4  映射块里缺少「骨架:」行");
  }

  // ---- C5 标题片段必须是封面主标题的子串 ----
  const coverTitle = coverTitleFrom(md);
  if (!coverTitle) {
    errors.push("C5  笔记.md 里找不到封面主标题（应为「**已选（封面主标题）**」下面的一行引用）");
  } else {
    if (map && map["标题片段"] && !coverTitle.includes(map["标题片段"])) {
      errors.push(
        `C5  「标题片段」对不上封面主标题：\n      声明片段：${map["标题片段"]}\n      实际标题：${coverTitle}`
      );
    }
    // ---- C9 页面上必须真的写着这个标题（改标题要同时改 笔记.md 和 note.html） ----
    if (map && map["标题片段"] && cover) {
      const norm = (s) => s.replace(/\s/g, "");
      if (!norm(stripTags(cover)).includes(norm(map["标题片段"]))) {
        errors.push(
          "C9  note.html 的封面里找不到「标题片段」—— 笔记.md 声明的标题和页面上写的那句对不上。" +
            "改标题时必须同时改这两处，否则「声明的公式」和「实际发出去的标题」是两张皮"
        );
      }
    }
    // ---- C6 字数 ----
    const n = countChars(coverTitle);
    if (n > 16) errors.push(`C6  封面主标题 ${n} 字，超过 16 字：${coverTitle}`);
    const bodyTitle = bodyTitleFrom(md);
    if (bodyTitle && countChars(bodyTitle) > 20) {
      errors.push(`C6  正文首行标题 ${countChars(bodyTitle)} 字，超过 20 字：${bodyTitle}`);
    }
    // ---- C7 禁用词 ----
    for (const w of BANNED) {
      if (coverTitle.includes(w)) errors.push(`C7  封面主标题含禁用词「${w}」`);
    }
    // ---- W1 说明书式标签启发式 ----
    const isHook = HOOK_MARKERS.some((m) =>
      typeof m === "string" ? coverTitle.includes(m) : m.test(coverTitle)
    );
    if (!isHook) {
      warns.push(
        `W1  封面主标题「${coverTitle}」里没有否定/对比/人称/疑问/数字任何一样，` +
          "读起来可能是说明书式标签而不是钩子"
      );
    }
  }

  // ---- C7b 整篇可见文字的禁用词 ----
  for (const w of ["震惊", "重磅", "炸裂"]) {
    if (visible.includes(w)) errors.push(`C7  页面文字里出现禁用词「${w}」`);
  }

  // ---- C8 必须有一页能带走的东西 ----
  const keepable = secs.filter((s) =>
    /p-(list|steps|compare)/.test(s.slice(0, 200))
  );
  if (!keepable.length) {
    errors.push("C8  没有任何「能带走的东西」页（.p-list / .p-steps / .p-compare）");
  }

  return { dirName, subject, errors, warns, shots: shots.length };
}

// ---------- 执行 ----------
const args = process.argv.slice(2);
let targets = args;
if (!targets.length) {
  const outDir = path.join(ROOT, "output");
  targets = existsSync(outDir)
    ? (await readdir(outDir, { withFileTypes: true }))
        .filter((e) => e.isDirectory())
        .map((e) => e.name)
    : [];
}

console.log("=== 内容守卫 ===");
let failed = 0;
let checked = 0;
for (const t of targets) {
  const r = await checkNote(t);
  if (!r) continue;
  checked++;
  const ok = r.errors.length === 0;
  if (!ok) failed++;
  console.log(`\n${ok ? "[OK]  " : "[FAIL]"} ${r.dirName}   主角=${r.subject || "(未声明)"}  截图页=${r.shots}`);
  for (const e of r.errors) console.log("   x " + e);
  for (const w of r.warns) console.log("   ? " + w);
}

if (!checked) {
  console.log("（output/ 下没有可检查的笔记）");
} else if (failed) {
  console.log(`\n结果：${failed} / ${checked} 条不合格。内容不过关就不要出图。`);
  process.exitCode = 1;
} else {
  console.log(`\n结果：${checked} 条全部通过。`);
}
