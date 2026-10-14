// check-copy.mjs — 内容守卫（和 lint-tokens.mjs 对称：那个守设计，这个守内容）
// 用法: node scripts/check-copy.mjs [笔记目录...]    默认检查 output/*/
//       视频模式自动扫 studio/videos/*/口播稿.md
//
// 为什么需要它：
//   check.mjs 原本 5 步全在设计层（令牌 / 对比度 / 渲染 / 溢出 / 尺寸），内容层一项都没有。
//   结果就是标题能连写两版都不命中《标题与封面规范.md》的 9 型公式，
//   9 张图能从头到尾不出现项目名——**规则写了而脚本不拦，等于没写。**
//   这个脚本把内容规范里「机械可查」的部分变成硬失败。
//
// 检查项（图文）：
//   C1  note.html 的 <html> 上必须声明 data-subject（本条笔记的主角名字）
//   C2  封面必须出现主角名（不用代词开场）——副标题里出现也算
//   C3  主角名在整篇出现 ≥2 次（封面 + 至少一个内页）
//   C4  笔记.md 必须有「标题公式映射」块（公式 / 骨架 / 标题片段 / 目标搜索词）
//   C5  「标题片段」必须是封面主标题的字面子串（防止声明和标题两张皮）
//   C6  封面主标题 ≤16 字、正文首行标题 ≤20 字（小红书硬规则）
//   C7  禁用词
//   C8  必须至少有一页「能带走的东西」（.p-list / .p-steps / .p-compare）
//   C10 正文首行标题也必须来自映射块（含标题片段 / 目标搜索词 / 命中备选标题之一），
//       禁止直接用被否掉的说明书式标签
//   C11 「不是 X 是 Y」句式全篇（页面 + 正文）合计最多 1 次，含变体（人味写作规范 §五①）
//   C12 封面主标题与内页标题不得字面重复（最长公共子串 ≥8 字判不合格；同义重复靠人判）
//   C13 目标搜索词必填，且落在正文首行标题或正文前 3 行
//   C14 话题标签 5–8 个
//   C15 封面钩子标签（.hook）不得只是项目名：含主角名且无任何钩子标记 → FAIL
//   C16 映射块 X/Y 字段任意 ≥2 字子串必须出现在「标题片段」里（防"声明 X=写稿那一小时、封面却写最累的不是写"）
//   W1  启发式提醒：封面主标题读起来像说明书标签
//   W2  启发式提醒：封面主标题"不是 X"模式且 X 是单字（如"最累的不是写"），X 端太抽象
//   W4  启发式提醒：正文没有收藏引导（知识号核心 KPI 是收藏率）
//   W5  启发式提醒：正文前 3 行没有钩子标记（人称/数字/疑问/否定/反常识）
//   W6  评分字段格式提醒（可选，标题与封面规范 §二·六）
//
// 检查项（视频 / 口播稿）：
//   C7v  口播稿禁用词
//   C11v 「不是 X 是 Y」全篇合计最多 1 次
//   W7   钩子（场景 1）末尾缺节奏标记
//   W8   钩子第一句 >17 字
//   W9   时长超出 45–90s 区间（需 narration.mp3 + ffprobe）
import { readFile, readdir } from "node:fs/promises";
import { existsSync } from "node:fs";
import { execSync } from "node:child_process";
import path from "node:path";

const ROOT = path.resolve(".");

const FORMULAS = [
  "数字清单", "我+代价+收获", "反转结论", "速成教程",
  "社会证明", "对比站队", "情绪短句", "概念降维", "身份场景",
];

const BANNED = [
  "震惊", "重磅", "炸裂", "必看", "干货满满",
  "多个", "一系列", "发布了", "盘点",
];

// 说明书式标签的启发式：一个钩子通常带有否定/对比/人称/疑问/数字里的至少一种
const HOOK_MARKERS = [
  "不是", "其实", "别", "你", "我", "为什么", "怎么", "才是", "还能", "以为", "只会",
  // 反转词（中文常见，原版漏收，导致"写稿一小时，最累的却是找素材"被误判无钩子）
  "却", "竟", "反而", "而是", "而",
  // 阿拉伯数字
  /\d/,
  // 中文数字字符集（"一/二/三/十/百/千/万"在小红书标题里频繁出现："100 遍""一小时""三件事"）
  /[一二三四五六七八九十百千万]/,
];

// 钩子末尾的节奏标记词表（口播稿规范 §五.4）
const BEAT_MARKERS = [
  "直接开始", "先说结论", "就三件事", "说三件事", "直接说",
  "开始吧", "先说问题", "说三点", "进入正题",
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
  return bodyLinesFrom(md)[0] || null;
}

// 正文区的所有行（首行 = 标题行，末行通常是话题标签行）
function bodyLinesFrom(md) {
  const marker = md.indexOf("## 三、小红书正文");
  if (marker < 0) return [];
  let tail = md.slice(marker);
  const end = tail.indexOf("\n## ");
  if (end > 0) tail = tail.slice(0, end);
  const lines = [];
  let seenHint = false;
  for (const line of tail.split("\n")) {
    const t = line.trim();
    if (t.startsWith("> 标题就是")) { seenHint = true; continue; }
    if (!seenHint) continue;
    if (!t || t.startsWith(">") || t.startsWith("---")) continue;
    if (t.startsWith("##")) continue;
    lines.push(t);
  }
  return lines;
}

// 备选标题表（「**备选」后面的 markdown 表，取第二列）
function altTitlesFrom(md) {
  const i = md.indexOf("**备选");
  if (i < 0) return [];
  let tail = md.slice(i);
  const end = tail.indexOf("\n## ");
  if (end > 0) tail = tail.slice(0, end);
  const titles = [];
  for (const line of tail.split("\n")) {
    const m = line.match(/^\|([^|]+)\|([^|]+)\|/);
    if (!m) continue;
    const cell = m[2].trim();
    if (!cell || cell === "标题" || /^-+$/.test(cell)) continue;
    titles.push(cell);
  }
  return titles;
}

// 最长公共子串长度（封面与内页标题字面重复的判据）
function lcsLen(a, b) {
  let best = 0;
  const dp = new Array(b.length + 1).fill(0);
  for (let i = 1; i <= a.length; i++) {
    let prev = 0;
    for (let j = 1; j <= b.length; j++) {
      const t = dp[j];
      if (a[i - 1] === b[j - 1]) {
        dp[j] = prev + 1;
        if (dp[j] > best) best = dp[j];
      } else dp[j] = 0;
      prev = t;
    }
  }
  return best;
}

// 「不是 X 是 Y」及其变体（人味写作规范 §五①：全篇合计最多 1 次）
const NOT_BUT_RES = [
  /不[是在][^。！？!?\n]{1,14}?，\s*(?:是|在|而是)/g, // 不是 A，是 B ／ 重点不在 A，在 B
  /，\s*不[是在][^，。！？!?\n]{1,14}/g, // A，不是 B（否定在句尾）
];

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

function hasHookMarker(text) {
  return HOOK_MARKERS.some((m) =>
    typeof m === "string" ? text.includes(m) : m.test(text)
  );
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
  const bodyLines = bodyLinesFrom(md);
  const bodyTitle = bodyLines[0] || null;
  const norm = (s) => s.replace(/\s/g, "");

  if (subject) {
    // ---- C2 封面出现主角名（副标题里出现也算） ----
    if (!stripTags(cover).includes(subject)) {
      errors.push(
        `C2  封面没有出现主角名「${subject}」—— 读者没读过原文，第一页就要报出名字，` +
          "不能一路用「它」。放副标题也算（钩子标签不必背这个活）"
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

  // ---- C15 钩子标签不得只是项目名 ----
  const hookMatch = cover.match(/<div class="hook">([\s\S]*?)<\/div>/);
  if (hookMatch && subject) {
    const hookText = stripTags(hookMatch[1]).trim();
    if (hookText && hookText.includes(subject) && !hasHookMarker(hookText)) {
      errors.push(
        `C15 封面钩子标签「${hookText}」只是项目名、没有人群词/数字/紧迫感——` +
          "钩子标签只给人群词或紧迫感（标题与封面规范 §一/§六·一）；项目名放副标题即满足 C2"
      );
    }
  }

  // ---- C4 标题公式映射 ----
  const map = mappingFrom(md);
  if (!map) {
    errors.push(
      "C4  笔记.md 里没有「标题公式映射」块 —— 必须先选 9 型公式之一并填槽位，" +
        "再写标题（格式见 references/标题与封面规范.md §二·五）"
    );
  } else {
    const f = map["公式"];
    if (!f) errors.push("C4  映射块里缺少「公式:」行");
    else if (!FORMULAS.includes(f)) {
      errors.push(`C4  公式「${f}」不在 9 型之内：${FORMULAS.join(" / ")}`);
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
    // ---- C16 映射块 X/Y 字段任意 ≥2 字子串必须出现在标题片段里 ----
    // 防"声明 X=写稿那一小时、封面却写最累的不是写"——映射块声明的 X 和封面字面上不一致
    if (map && map["标题片段"]) {
      const titleFrag = norm(map["标题片段"]);
      for (const key of ["X", "Y"]) {
        const val = map[key];
        if (!val) continue;
        // 去掉括号注释（如"写稿那一小时（取原文第5行原话，不是编的）"→"写稿那一小时"）
        const cleaned = val.replace(/（[^）]*）/g, "").replace(/\([^)]*\)/g, "").trim();
        if (cleaned.length < 2) continue;
        // 检查任意 ≥2 字连续子串是否出现在标题片段里
        let found = false;
        for (let i = 0; i <= cleaned.length - 2 && !found; i++) {
          if (titleFrag.includes(cleaned.slice(i, i + 2))) found = true;
        }
        if (!found) {
          errors.push(
            `C16 映射块「${key}」字段「${val}」与「标题片段」"${map["标题片段"]}"无 ≥2 字公共子串——声明的 ${key} 和封面实际写的不一致。修复：让 ${key} 字段值就是标题片段里对应那一端的原文。`
          );
        }
      }
    }
    // ---- C9 页面上必须真的写着这个标题（改标题要同时改 笔记.md 和 note.html） ----
    if (map && map["标题片段"] && cover) {
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
    if (bodyTitle && countChars(bodyTitle) > 20) {
      errors.push(`C6  正文首行标题 ${countChars(bodyTitle)} 字，超过 20 字：${bodyTitle}`);
    }
    // ---- C7 禁用词 ----
    for (const w of BANNED) {
      if (coverTitle.includes(w)) errors.push(`C7  封面主标题含禁用词「${w}」`);
    }
    // ---- W1 说明书式标签启发式 ----
    if (!hasHookMarker(coverTitle)) {
      warns.push(
        `W1  封面主标题「${coverTitle}」里没有否定/对比/人称/疑问/数字任何一样，` +
          "读起来可能是说明书式标签而不是钩子"
      );
    }
    // ---- W2 第1行完整命题启发式 ----
    // 标题里"不是 X"模式且 X 是单字 → 提示"X 端太抽象，读者会问 X 什么"
    if (coverTitle) {
      const m = coverTitle.match(/不是([\u4e00-\u9fa5])(?=[，。！？!?,\s]|$)/);
      if (m) {
        warns.push(
          `W2  封面主标题「${coverTitle}」里"不是${m[1]}"的 X 端是单字"${m[1]}"——可能太抽象，读者会问"${m[1]}什么？"，考虑补具体动作（如"不是写稿"而不是"不是写"）`
        );
      }
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

  // ---- C10 正文首行标题也必须来自映射块 ----
  if (bodyTitle && map) {
    const nb = norm(bodyTitle);
    const cands = [map["标题片段"], map["目标搜索词"]].filter(Boolean);
    const alts = altTitlesFrom(md);
    const ok =
      cands.some((c) => nb.includes(norm(c))) ||
      alts.some((t) => norm(t) === nb);
    if (!ok) {
      errors.push(
        `C10 正文首行标题「${bodyTitle}」不来自标题公式映射块 —— ` +
          "首行标题必须含「标题片段」或「目标搜索词」，或与某条备选标题一致；" +
          "禁止直接使用被否掉的说明书式标签"
      );
    }
  }

  // ---- C11 「不是 X 是 Y」全篇合计最多 1 次 ----
  const notButText = norm(visible) + "\n" + norm(bodyLines.join("\n"));
  const notButHits = new Set();
  for (const re of NOT_BUT_RES) {
    for (const m of notButText.matchAll(re)) notButHits.add(m[0]);
  }
  if (notButHits.size > 1) {
    errors.push(
      `C11 「不是 X 是 Y」句式全篇出现 ${notButHits.size} 次（上限 1 次）：\n      ` +
        [...notButHits].join("\n      ") +
        "\n      只保留信息增量最大的那 1 处（通常是封面钩子），其余改写（人味写作规范 §五①）"
    );
  }

  // ---- C12 封面主标题与内页标题不得字面重复 ----
  if (coverTitle) {
    const nc = norm(coverTitle);
    const innerTitles = secs
      .filter((s) => !s.includes("p-cover"))
      .map((s) => {
        const m = s.match(/class="(?:t-title|lead-q)">([\s\S]*?)<\/div>/);
        return m ? stripTags(m[1]) : null;
      })
      .filter(Boolean);
    for (const t of innerTitles) {
      const l = lcsLen(nc, norm(t));
      if (l >= 8) {
        errors.push(
          `C12 内页标题「${t}」与封面主标题字面重复（公共子串 ${l} 字）—— 钩子不重复（SKILL.md 硬约束 20）`
        );
      } else if (l >= 6) {
        warns.push(
          `W3  内页标题「${t}」与封面主标题有 ${l} 字公共子串，确认一下是不是同义重复`
        );
      }
    }
  }

  // ---- C13 目标搜索词必填，且落在正文前 3 行 ----
  if (map) {
    const kw = map["目标搜索词"];
    if (!kw) {
      errors.push(
        "C13 映射块里缺少「目标搜索词:」行 —— 这条笔记要占哪个搜索词，定标题时就必须定死" +
          "（标题与封面规范 §二·五）"
      );
    } else if (bodyLines.length) {
      const first3 = bodyLines.slice(0, 3).join("\n");
      if (!first3.includes(kw)) {
        errors.push(
          `C13 目标搜索词「${kw}」没有落在正文首行标题或正文前 3 行 —— 搜索卡位落空`
        );
      }
    }
  }

  // ---- C14 话题标签 5–8 个 ----
  const tags = bodyLines.join(" ").match(/#[^#\s]+/g) || [];
  if (bodyLines.length && (tags.length < 5 || tags.length > 8)) {
    errors.push(
      `C14 话题标签 ${tags.length} 个（要求 5–8 个，按 2 大词 + 3 中词 + 2 长尾搭配）`
    );
  }

  // ---- W4 收藏引导 ----
  if (bodyLines.length && !bodyLines.join(" ").includes("收藏")) {
    warns.push(
      "W4  正文没有收藏引导 —— 知识号核心 KPI 是收藏率，" +
        "有「能带走的页」时加一句自然的（如「这类拆解我会持续更，先收藏免得刷不到」）"
    );
  }

  // ---- W5 正文前 3 行有没有钩子标记 ----
  if (bodyLines.length) {
    const first3 = bodyLines.slice(0, 3).join(" ");
    if (!hasHookMarker(first3)) {
      warns.push(
        "W5  正文前 3 行没有钩子标记（人称/数字/疑问/否定/反常识）——开头可能不是钩子，" +
          "见 references/通用钩子库.md"
      );
    }
  }

  // ---- W6 评分字段（可选） ----
  if (map && map["评分"]) {
    const s = map["评分"];
    if (!/[×x]/.test(s) || !/=/.test(s)) {
      warns.push(
        `W6  评分「${s}」格式不规范，应为「主题4×3 利益5×2 ... = 39/50」（标题与封面规范 §二·六）`
      );
    }
  }

  return { dirName, subject, errors, warns, shots: shots.length };
}

// ============ 视频模式：扫 studio/videos/*/口播稿.md ============

function parseScenes(md) {
  const scenes = [];
  const re = /\*\*【场景\s*(\d+)[^】]*】\*\*([\s\S]*?)(?=\*\*【场景|$)/g;
  let m;
  while ((m = re.exec(md))) {
    scenes.push({ n: parseInt(m[1], 10), text: m[2].trim() });
  }
  return scenes;
}

function firstSentence(text) {
  const seg = text.split(/[。！？\n]/).map((s) => s.trim()).filter(Boolean);
  return seg[0] || "";
}

function probeDuration(mp3) {
  try {
    const out = execSync(
      `ffprobe -v error -show_entries format=duration -of csv=p=0 "${mp3}"`,
      { encoding: "utf8", stdio: ["pipe", "pipe", "pipe"] }
    ).trim();
    const d = parseFloat(out);
    return Number.isFinite(d) ? d : null;
  } catch {
    return null;
  }
}

async function checkVideo(vidDir) {
  const dir = path.join(ROOT, "studio", "videos", vidDir);
  const mdPath = path.join(dir, "口播稿.md");
  const errors = [];
  const warns = [];

  if (!existsSync(mdPath)) return null;
  const md = await readFile(mdPath, "utf8");
  const scenes = parseScenes(md);
  if (!scenes.length) {
    warns.push("没有解析到任何「**【场景 N …】**」分镜块");
    return { vidDir, errors, warns, scenes: 0 };
  }

  const allText = scenes.map((s) => s.text).join("\n");
  const norm = (s) => s.replace(/\s/g, "");

  // ---- C7v 禁用词 ----
  for (const w of BANNED) {
    if (allText.includes(w)) errors.push(`C7v 口播稿出现禁用词「${w}」`);
  }
  for (const w of ["震惊", "重磅", "炸裂"]) {
    if (allText.includes(w)) errors.push(`C7v 口播稿出现禁用词「${w}」`);
  }

  // ---- C11v 「不是 X 是 Y」全篇合计最多 1 次 ----
  const notButText = norm(allText);
  const notButHits = new Set();
  for (const re of NOT_BUT_RES) {
    for (const m of notButText.matchAll(re)) notButHits.add(m[0]);
  }
  if (notButHits.size > 1) {
    errors.push(
      `C11v 「不是 X 是 Y」句式口播稿出现 ${notButHits.size} 次（上限 1 次）：\n      ` +
        [...notButHits].join("\n      ") +
        "\n      只保留信息增量最大的那 1 处（人味写作规范 §五①）"
    );
  }

  // ---- W7 钩子（场景 1）末尾节奏标记 ----
  const hook = scenes[0];
  const hasBeat = BEAT_MARKERS.some((b) => hook.text.includes(b));
  if (!hasBeat) {
    warns.push(
      `W7  场景 1（钩子）末尾没有节奏标记（如「直接开始」「就三件事」）——观众需要知道铺垫结束了（口播稿规范 §五.4）`
    );
  }

  // ---- W8 钩子第一句 ≤17 字 ----
  const fs1 = firstSentence(hook.text);
  const n1 = countChars(fs1);
  if (n1 > 17) {
    warns.push(
      `W8  钩子第一句 ${n1} 字（≤17 字为 3 秒预算上限）：${fs1}（口播稿规范 §五.5）`
    );
  }

  // ---- W9 时长区间（需要 narration.mp3 + ffprobe） ----
  const mp3 = path.join(dir, "narration.mp3");
  if (existsSync(mp3)) {
    const d = probeDuration(mp3);
    if (d == null) {
      warns.push("W9  存在 narration.mp3 但 ffprobe 读不到时长（ffprobe 未装或文件损坏）");
    } else if (d > 90) {
      errors.push(`C9v 实测时长 ${d.toFixed(1)}s 超过 90s 硬上限 —— 必须拆条（口播稿规范 §三）`);
    } else if (d > 75) {
      warns.push(`W9  实测时长 ${d.toFixed(1)}s 超出 60–75s 默认区间（未超 90s 上限）—— 先报告用户再决定`);
    } else if (d < 45) {
      warns.push(`W9  实测时长 ${d.toFixed(1)}s 短于 45s —— 内容可能太薄，考虑合并`);
    }
  }

  return { vidDir, errors, warns, scenes: scenes.length };
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

// 图文
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

// 视频
const vidRoot = path.join(ROOT, "studio", "videos");
if (existsSync(vidRoot)) {
  const vids = (await readdir(vidRoot, { withFileTypes: true }))
    .filter((e) => e.isDirectory())
    .map((e) => e.name);
  for (const v of vids) {
    const r = await checkVideo(v);
    if (!r) continue;
    checked++;
    const ok = r.errors.length === 0;
    if (!ok) failed++;
    console.log(`\n${ok ? "[OK]  " : "[FAIL]"} video:${r.vidDir}   场景=${r.scenes}`);
    for (const e of r.errors) console.log("   x " + e);
    for (const w of r.warns) console.log("   ? " + w);
  }
}

if (!checked) {
  console.log("（output/ 与 studio/videos/ 下都没有可检查的内容）");
} else if (failed) {
  console.log(`\n结果：${failed} / ${checked} 条不合格。内容不过关就不要出图。`);
  process.exitCode = 1;
} else {
  console.log(`\n结果：${checked} 条全部通过。`);
}
