# PROJECT.md — 小红书 AI 内容生产项目（图文笔记 / 知识讲解视频）

> **任何 agent 接手这个项目，先读这个文件，再读 `SKILL.md`。**

## 这个项目是什么

把**一篇 AI 相关的长文**，做成**可直接发布的小红书内容**，有两种产出模式：

| 模式 | 产出 | 规格 |
|---|---|---|
| **图文笔记** | 封面 + 内页图 + 标题 + 正文 | 1080 × 1440（3:4） |
| **AI 知识讲解视频** | 逐字口播稿 → TTS 配音 → 逐词字幕 → MP4 | 1080 × 1920（9:16） |

- **账号名**：`Kai讲AI`
- **账号定位**：AI 知识博主，**把 AI 讲明白**
- **目标用户**：**工作或生活里已经在用 AI 的人**。按**用得深浅**分层，**不按职业分层**：
  ① 只会当搜索框用 ② 用过但零散、不成体系 ③ 想深入但被术语挡住。
  ❌ **不是从没接触过 AI 的人——他们不会来**；也**不按岗位定义受众**（岗位只能进写作时的例子）。人物小传见 `references/口播稿规范.md` §二
- **创作角度**：**挑 → 拆 → 讲明白**。知识分享号本来就是二次组织，**不存在「必须原创」**；
  价值在「我替你看过了」，不在「我第一个发现」。但边界规则 1、2（不编造、不改原意）依然管全程
- **账号人设**：程序员（真实身份）。**个人处境完全不提**（在职/求职状态、经济状况、家庭情况）——不作为人设，不进任何面向读者的位置
- **账号口吻**：和读者一起学会（不装专家、不编资历）
- **简介 / 主页 / 定名规则**：定稿见 `references/账号定位规范.md`（含主页三件套、人设边界、「进度条」等价物）
- **一句话流程（图文）**：用户给一篇文章 → 产出文案 → 用户确认 → 产出图片 → 用户发布
- **一句话流程（视频）**：用户给一篇文章 → 拆条方案 + 逐字口播稿 → **用户确认** → 出音出字幕 → 渲染 MP4 → 用户发布

**两个模式各做各的**：不要求页序一致、不要求条数一致、不共用分镜。
共用的只有源材料存档（`sources/`）、设计令牌（`templates/`）和标题公式。

## 一句话需求

> 「每次我给你一篇文章（链接 / 下载的文章+图片 / 直接粘贴的文字），
> 你把它做成小红书图文笔记，或者一条 AI 知识讲解视频。」
>
> 视频模式的关键：**口播稿是核心交付物，用户确认之后才继续下一步。**

## 内容源（白名单）

只从下面这些来源取内容，**不要主动去读用户没给你的目录或文件**：

| 来源 | 说明 |
|---|---|
| WorkBuddy 实战蓝皮书 `workbuddy.homes/bluebook/` | 当前主要来源，28 章 |
| 豆包工作蓝皮书 `doubaowork.homes` | 49 篇（前端应用，目录需用户提供或另做抓取） |
| 用户从 X 等平台下载的 AI 文章 | 用户会放进 `sources/` |
| 用户直接粘贴的原文 | 用户会贴到对话里 |

**参考材料**（方法论来源，不是内容源）：
- `小红书起号第一步，直接抄这个SOP` — 定位与内容结构方法
- `零基础入门 AI，看完这篇就够了` — 知识体系讲法示例
- `bigpeng-hot-gzh` 标题公式库 — 标题钩子写法

## 边界规则（硬约束）

1. **不编造**。所有事实、产品名、功能、步骤、数字都来自原文。原文没有的不写。
2. **不改动原意**。可以翻译、可以重排顺序、可以补一句"这对你意味着什么"，但不能歪曲。
3. **不主动推荐海外 AI 产品的下载/订阅/充值**。封面和内页避免出现海外产品 logo。
4. **一次只做一条笔记**。原文过长时，先问用户要不要拆成多条。
5. **先文案后出图**。用户确认文案之后，才渲染图片。
6. **视频模式下，口播稿未经用户确认不得进入 TTS。** 口播稿定稿 = 时长、分镜、字幕文字同时定稿。
7. **视频不做「上集/下集」。** 每条必须能独立看懂；系列感靠选题角度，不靠「第X集」。
8. **视频无 BGM、无关注引导。**

## 目录结构

```
D:\AI\repository\ai-study\
├── PROJECT.md                  ← 本文件，项目总纲
├── SKILL.md                    ← 可执行流程（一进一出怎么做）
├── CHANGELOG.md                ← 变更记录
│
├── sources/                    ← 源材料存档（按来源建子目录）
├── references/                 ← 方法论参考
│   ├── 账号定位规范.md          ← 账号名 / 简介 / 主页三件套 / 人设边界（面向读者的文字总纲）
│   ├── 标题与封面规范.md        ← bigpeng 标题公式（小红书改造版）+ 封面结构 + 缺元素怎么补 + 语料
│   ├── 人味写作规范.md          ← 视角铁律（二创≠解读）+ 去 AI 味 + 禁词禁用表
│   ├── 口播稿规范.md            ← 视频模式核心：语速基准、五段式、钩子、术语念法、拆条规则
│   ├── 动效规范.md              ← 视频动效：令牌、五个原语、声画同步、版面与工程契约
│   └── 设计系统规范.md          ← 设计令牌、实测对比度、版式铁律、待改进项
│
├── templates/                  ← 出图版式（改配色/字号只动这里）
│   ├── tokens.css              ← 设计令牌：颜色、字号、8px 间距栅格、阴影、**动效令牌**
│   ├── base.css                ← 画布 1080×1440、卡片容器、排版原子、**图标 / 标注 / 视觉母题**
│   ├── components.css          ← 8 种页型 + 密度变体 + **页型底纹**
│   ├── icons/                  ← **Lucide 图标源（24 个，ISC）——图文与视频共用这一份**
│   │   └── LICENSES.md         ← 授权声明（ISC + Feather/MIT），必须随图标入库
│   ├── styleguide.html         ← 组件总览（回归基线，改了设计系统先看它）
│   └── fit-test.html           ← 溢出压力测试（验证自动适配是否真的触发）
│
├── scripts/
│   ├── check.mjs               ← ★ 一条命令跑完全套验收（推荐入口）
│   ├── render.mjs              ← 出图：HTML → 1080×1440 PNG，含自动适配与溢出检测
│   ├── lint-tokens.mjs         ← 令牌守卫：裸色值 / 内联样式 / 魔法数字间距
│   ├── contrast.mjs            ← 配色审计：按 WCAG 2.1 验收对比度
│   ├── probe.mjs               ← 诊断：卡片尺寸、溢出、任意元素的计算样式
│   ├── net-probe.mjs           ← 诊断：抓取加载失败的资源（样式为何整体失效）
│   ├── net-check.mjs           ← 自检：出网能力（推送失败时先跑它）
│   ├── setup-studio.mjs        ← 重建 studio/design 与 studio/fonts 两个目录联接
│   ├── fetch-icons.mjs         ← 按清单拉取 Lucide 图标到 templates/icons/
│   ├── build-sprite.mjs        ← 把图标生成内联 sprite，注入任意 HTML 的标记区
│   ├── build-subs.mjs          ← 视频：从 captions.json 生成字幕层与时间轴数组
│   ├── tts.mjs                 ← 视频：口播稿.md → script.json + narration.mp3
│   └── align.py                ← 视频：faster-whisper 转写 + 对齐 + 长句自动拆条 → captions.json
│
├── fonts/                      ← 本地字体（得意黑 / Noto Sans SC / Geist Mono）
│
├── studio/                     ← 视频工程（HyperFrames，全账号一个）
│   ├── index.html               ← root composition：场景轨道 + 全局时间轴
│   ├── compositions/            ← 每个场景一个 sub-composition 文件
│   ├── vendor/gsap.min.js       ← GSAP 本地化，渲染时不依赖 CDN
│   ├── design → ../templates    ← 目录联接（★ 忽略；重建 node scripts/setup-studio.mjs）
│   ├── fonts  → ../fonts        ← 目录联接（★ 忽略）
│   └── videos/
│       └── <来源>-<编号>-<短标题>-<nn>\
│            ├── 口播稿.md        ← 视频的主闸门产物（★ 入库）
│            ├── script.json      ← 忽略（tts.mjs 解析出的场景文本）
│            ├── narration.mp3    ← 忽略
│            ├── transcript.json  ← 忽略（whisper 原始词级输出）
│            └── captions.json    ← 忽略（场景起止 + 逐句字幕，时间轴的真值）
│
└── output/                     ← 成品，一条笔记一个文件夹
    └── <来源>-<编号>-<短标题>\
         ├── 笔记.md            ← 标题、正文、分页稿（可直接复制发布）
         ├── note.html          ← 出图源文件
         ├── images\            ← 成品 PNG，01.png … 09.png（忽略）
         └── video\             ← 成品 MP4 + 视频封面（忽略）
```

## 视觉基准

| 项 | 值 |
|---|---|
| 尺寸 | 1080 × 1440（3:4） |
| 风格 | 暖橙 + 米白 + 卡片感（参考 mmh1.top 的设计 token） |
| 主色 | `#f97316` |
| 背景 | `#fffbf5` |
| 标题字体 | 得意黑 SmileySans（本地 `fonts/SmileySans-Oblique.woff2`） |
| 正文字体 | Noto Sans SC（本地 303 个子集） |
| 等宽字体 | Geist Mono |
| 换配色 | 改 `templates/tokens.css`，或给 `<html>` 加 `data-theme="ink"` |

**视频规格**（与图文**共用同一套令牌与页型**）：1080 × 1920（9:16）· 30fps · 无 BGM · 字幕常驻底部。
排版系统不复制第二份，HyperFrames composition 直接引 `templates/` 的 CSS。

### 版式铁律

1. **不加页眉页脚**：不出现系列名、页码、来源标注（`依据：xxx`）等装饰。
2. **全篇统一浅色底**：痛点页也用暖白底，最多用一条深色结论条保留冲击力。
3. **不出版面空洞**：内容从上到下均匀铺开；偏空的页用 `margin-top:auto` 把末块沉底。
4. **封面必须有视觉证据**：对比卡 / 图解 / 数字，不能只有文字。
5. **标题必须过公式**：具体数字或明确冲突，禁用震惊/重磅/必看。
6. **颜色只用令牌**，改完跑 `node scripts/contrast.mjs`（当前 16 组检查 0 失败）。

配色核心决策：**亮橙 `#f97316` 底配深字 `#12100e`（6.77:1）**，而不是亮橙配白字（2.80:1，已否决）。

## 环境依赖（已验证可用）

| 依赖 | 状态 |
|---|---|
| Node.js | v24.16.0 ✅ |
| Google Chrome | `C:\Program Files\Google\Chrome\Application\chrome.exe` ✅ |
| Playwright | **不需要**（脚本直连 Chrome DevTools Protocol） |
| 字体 | 已本地化，不需要联网 ✅ |
| HyperFrames | 0.8.156，`npx hyperframes` 直接可跑；**用系统 Chrome**，不需下载浏览器 ✅ |
| FFmpeg / FFprobe | `D:\software\ffmpeg\...`（full build）✅ |
| faster-whisper | 1.2.1 + ctranslate2 4.8.1；模型 `D:\software\models\faster-whisper-large-v3`（2.88 GB）✅ |
| TTS | `tts.wangwangit.com/v1/audio/speech`，晓梦 · 1.20x · +25Hz ✅（**必须带浏览器 UA**） |
| 本机 edge-tts | ❌ 403 不可用（直连与走代理都失败），**只能走网站** |
| ⚠️ 磁盘 | **C 盘仅剩约 9.2 GB**，而 HyperFrames 帧缓存默认在 C 盘 → 渲染临时目录指到 `D:\hf-tmp`（D 盘 401 GB） |
| ⚠️ 机器 | i5-8400 / 6 核 / 可用内存约 5.9 GB → 渲染 worker 限 2 |
| 渲染速度（实测） | **每 1 秒成片约 3.3 秒渲染**（探路片 150 帧 / 5s → 16.5s） |
| GPU | NVIDIA GTX 1060 被自动识别，走 hardware GPU ✅ |
| 设计系统接入 | `studio/design`、`studio/fonts` 两个**目录联接**；丢失时跑 `node scripts/setup-studio.mjs` |

## 出图命令

```powershell
cd D:\AI\repository\ai-study

# 出图（含自动适配：内容超高会自动缩放，而不是裁掉）
node scripts/render.mjs "output\<笔记目录>\note.html" "output\<笔记目录>\images"

# 全套验收：令牌守卫 + 配色审计 + 组件总览 + 压力测试 + 成品笔记
node scripts/check.mjs
```

排查问题：

```powershell
node scripts/probe.mjs "<html>"                       # 页面尺寸与溢出
node scripts/probe.mjs "<html>" --sel=".p-end .ask"   # 查某个元素的计算样式
node scripts/net-probe.mjs "<html>"                   # 样式/字体为何没加载
node scripts/net-check.mjs                            # 出网能力自检（推送失败时先跑它）
```

## 推送到 GitHub

```powershell
git push
```

**注意：本仓库的推送依赖本机代理。** `git` 不读取 Windows 的系统代理设置，
而当前网络下 GitHub 直连不可达（`node` / `git` 都会超时，但 `npm` 可达）。
因此代理已写进**本仓库的本地配置**（不影响全局 git）：

```powershell
# 已配置（如需重设）
git config --local http.proxy  http://127.0.0.1:10808
git config --local https.proxy http://127.0.0.1:10808

# 代理端口变了就改这里；换机器或关掉代理后推送会超时
```

**换机器时的排查顺序**：
1. 跑 `node scripts/net-check.mjs`，看 GitHub 是否可达
2. 不可达 → 确认本机代理端口（系统代理见「设置 → 网络和 Internet → 代理」）
3. 按上面的命令更新本仓库代理配置

## 待办与已完成

### 已完成

| 产出 | 来源 | 状态 |
|---|---|---|
| `output/wb-ch05-什么是Skill/` | WorkBuddy 蓝皮书 第 5 章 | 图文：文案 + 9 张图已产出，待用户确认 |
| `studio/videos/wb-ch05-01-prompt-vs-skill/` | 同上 | 视频第 1 条：口播稿 → 音频 78.89s → 22 句词级字幕 → **成片已渲染** |
| `output/wb-ch05-什么是Skill/video/01-提示词和技能到底差在哪.mp4` | 同上 | **成品视频**：1080×1920 · 30fps · 78.9s · 5.58 MB |
| `studio/index.html` | — | 视频 composition：root + 6 个场景 + 全局时间轴 + 口播音轨 |

### 视频链路（第 5 章第 1 条，已跑通）

```
口播稿.md ──node scripts/tts.mjs──▶ script.json + narration.mp3 (78.89s)
          ──python scripts/align.py──▶ transcript.json + captions.json (22 句词级对齐)
          ──studio/index.html──▶ hyperframes check → render → MP4
```

| 实测项 | 值 |
|---|---|
| 语速 | **5.80 字/秒**（454 字 → 78.89s），不是 6.35 |
| 音频与字幕 | 文字来自口播稿、时间来自 whisper，逐条校验 `PROBLEMS = 0` |
| 渲染 | 2367 帧 / 1 分 53.9 秒，**每 1 秒成片约 1.4 秒渲染** |

设计系统状态（`node scripts/check.mjs` 全绿）：

| 项 | 状态 |
|---|---|
| 配色对比度 | 16 组检查 0 失败（WCAG 2.1） |
| 令牌守卫 | 通过：无裸色值、无内联样式、无魔法数字 |
| 组件总览 | 9 张全部 1080×1440 |
| 溢出兜底 | 压力测试可触发，无残留溢出 |
| 成品笔记 | 9 张全部 1080×1440，无需缩放 |

### 下一步

1. **配图链路（当前最大空洞，优先）**——文章配图 → 插图。**整条链路从未跑过**：
   已确认的原文无图、`sources/` 无 `media/`、`note.html` 无 `<img>`。
   现状：9 张图全部是纯矢量排版（CSS + 图标 + 字体），没有任何真实截图。
   待办：① 拿到带图素材 ② 出配图版式方案（画框 / 局部裁切 / 编号标注）③ 落地 + 验收脚本
2. **用户审片**：`output/wb-ch05-什么是Skill/video/01-提示词和技能到底差在哪.mp4`
3. 视觉迭代：场景 4（三点差别）和场景 5 的版面仍偏空，需要重新配平
4. 用户确认第 5 章图文的文案与视觉
5. 视频第 2、3 条（技能最值钱的用法 / 渐进式披露）
6. 设计系统的已知待改进项见 `references/设计系统规范.md` 第 11 节

### 已知未解决

| 问题 | 状态 |
|---|---|
| **文章配图 → 插图** | 能力未建，见「下一步」第 1 条 |
| 豆包工作蓝皮书抓取 | ❌ 打不开——它是 SPA，需用户提供目录或正文 |
| X 文章链接抓取 | ⚠️ 未验证，目前只有 WorkBuddy 蓝皮书验证过链接抓取 |
