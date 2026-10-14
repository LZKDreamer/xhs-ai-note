#!/usr/bin/env python
# -*- coding: utf-8 -*-
"""
align.py —— 用 faster-whisper 出**时间轴**，用口播稿出**文字**，然后强制对齐。

为什么必须这样做（实测）：
  whisper-large-v3 对 TTS 音频的相似度约 98.4%，但会把「措辞」听成「措词」，
  低置信度词集中在虚词上（「得」0.56、「它」0.52）。
  → **文字真值用口播稿，时间轴用 whisper**。绝不能直接拿 whisper 的文本当字幕。

用法：
  python scripts/align.py "<输出目录>"
  该目录需已有 tts.mjs 产出的 script.json 与 narration.mp3

产出（写到同一目录）：
  transcript.json —— whisper 原始词级输出（含 probability，便于排查）
  captions.json   —— 对齐后的成品：场景起止 + 逐句字幕（文字来自口播稿，时间来自 whisper）

模型：D:\\software\\models\\faster-whisper-large-v3（CTranslate2 格式，2.88 GB，直接加载）
"""
import json
import os
import re
import sys
import time
import difflib

MODEL_PATH = r"D:\software\models\faster-whisper-large-v3"
WORD_RE = re.compile(r"[\w\u4e00-\u9fff]")


def load_scenes(out_dir):
    with open(os.path.join(out_dir, "script.json"), encoding="utf-8") as f:
        return json.load(f)["scenes"]


def transcribe(mp3):
    from faster_whisper import WhisperModel

    t0 = time.time()
    try:
        model = WhisperModel(MODEL_PATH, device="cpu", compute_type="int8")
    except Exception as e:  # noqa: BLE001
        print("  int8 不可用(%s)，回退 float32" % str(e)[:60])
        model = WhisperModel(MODEL_PATH, device="cpu", compute_type="float32")
    load_s = time.time() - t0

    t1 = time.time()
    segments, info = model.transcribe(mp3, language="zh", word_timestamps=True, vad_filter=True)
    words = []
    for seg in segments:
        for w in seg.words or []:
            words.append(
                {"text": w.word, "start": round(w.start, 3), "end": round(w.end, 3),
                 "p": round(w.probability, 2)}
            )
    return words, load_s, time.time() - t1, info


def flatten(words):
    """把词级时间戳摊平成字符级：每个字继承它所在词的时间。"""
    chars, times = [], []
    for w in words:
        cs = [c for c in w["text"] if WORD_RE.match(c)]
        for i, c in enumerate(cs):
            chars.append(c)
            # 同一个词里的多个字，按比例切分时间，比整词共用更平滑
            if len(cs) == 1:
                times.append((w["start"], w["end"]))
            else:
                span = (w["end"] - w["start"]) / len(cs)
                times.append((w["start"] + i * span, w["start"] + (i + 1) * span))
    return chars, times


def align(script_text, asr_chars, asr_times):
    """把口播稿的每个「实字」映射到时间。返回与 script_text 等长的 (char, start, end) 列表。"""
    sig = [(i, c) for i, c in enumerate(script_text) if WORD_RE.match(c)]
    a = "".join(c for _, c in sig)
    b = "".join(asr_chars)

    out = [None] * len(sig)
    sm = difflib.SequenceMatcher(None, a, b, autojunk=False)
    for tag, i1, i2, j1, j2 in sm.get_opcodes():
        if tag == "equal":
            for k in range(i2 - i1):
                out[i1 + k] = asr_times[j1 + k]
        elif tag == "replace" and (j2 - j1) > 0:
            n, m = i2 - i1, j2 - j1
            for k in range(n):
                out[i1 + k] = asr_times[j1 + min(m - 1, int(k * m / n))]
        # delete / insert 留空，下面用插值补

    # 用最近的两个已知点做线性插值，把空洞填掉
    known = [i for i, v in enumerate(out) if v is not None]
    if not known:
        raise SystemExit("✗ 对齐失败：whisper 结果与口播稿完全没有可匹配的字符。")
    for i in range(len(out)):
        if out[i] is not None:
            continue
        prev = max([k for k in known if k < i], default=None)
        nxt = min([k for k in known if k > i], default=None)
        if prev is None:
            out[i] = out[nxt]
        elif nxt is None:
            out[i] = out[prev]
        else:
            f = (i - prev) / (nxt - prev)
            out[i] = (out[prev][0] + (out[nxt][0] - out[prev][0]) * f,
                      out[prev][1] + (out[nxt][1] - out[prev][1]) * f)

    return [(script_text[i], out[k][0], out[k][1]) for k, (i, _) in enumerate(sig)]


def sentences(text):
    """按中文句末标点切句，标点跟着前一句。"""
    parts = re.findall(r"[^。！？…]+[。！？…]*", text)
    return [p.strip() for p in parts if p.strip()]


# 一条字幕最多多少字。46px 字号、904px 可用宽 → 每行约 19.6 字，
# 所以 22 字以内最多占 2 行，绝不会出现第 3 行压到播放器 UI 上。
MAX_CAP_CHARS = 22


def split_caption(text, limit=MAX_CAP_CHARS):
    """超长句在「，、：；」处切开。切点尽量靠近中间，且保证两段都不超限。"""
    if len(text) <= limit:
        return [text]
    marks = [i for i, c in enumerate(text) if c in "，、：；"]
    if not marks:
        return [text]
    # text[:i+1] 长度 = i+1 ≤ limit；text[i+1:] 长度 = len-i-1 ≤ limit
    lo, hi = max(0, len(text) - limit - 1), limit - 1
    cand = [i for i in marks if lo <= i <= hi] or marks
    best = min(cand, key=lambda i: abs(i - len(text) / 2))
    return [text[: best + 1], text[best + 1 :]]


def main(out_dir):
    scenes = load_scenes(out_dir)
    mp3 = os.path.join(out_dir, "narration.mp3")
    if not os.path.exists(mp3):
        raise SystemExit("✗ 找不到 %s，先跑 node scripts/tts.mjs" % mp3)

    print("  模型 %s" % MODEL_PATH)
    words, load_s, asr_s, info = transcribe(mp3)
    print("  加载 %.1fs · 转写 %.1fs · 语言 %s(p=%.2f) · %d 词"
          % (load_s, asr_s, info.language, info.language_probability, len(words)))

    with open(os.path.join(out_dir, "transcript.json"), "w", encoding="utf-8") as f:
        json.dump({"model": MODEL_PATH, "language": info.language, "words": words},
                  f, ensure_ascii=False, indent=1)

    asr_chars, asr_times = flatten(words)
    asr_text = "".join(asr_chars)

    result_scenes, result_caps = [], []
    cursor_char = 0
    for sc in scenes:
        text = sc["text"]
        timed = align(text, asr_chars, asr_times) if text.strip() else []
        if not timed:
            cursor_char += len(text)
            continue
        rough = "".join(c for c, _, _ in timed)
        sim = difflib.SequenceMatcher(None, rough, asr_text[: len(asr_text)]).ratio()
        sc_start = timed[0][1]
        sc_end = timed[-1][2]

        # 场景内逐句字幕：文字来自口播稿，时间来自对齐结果；超长句自动拆条
        caps, k = [], 0
        for s in sentences(text):
            for part in split_caption(s):
                n = len([c for c in part if WORD_RE.match(c)])
                chunk = timed[k : k + n]
                k += n
                if not chunk:
                    continue
                caps.append({"text": part, "start": round(chunk[0][1], 3), "end": round(chunk[-1][2], 3)})
        result_caps.extend(caps)
        result_scenes.append({
            "n": sc["n"], "head": sc["head"],
            "start": round(sc_start, 3), "end": round(sc_end, 3),
            "duration": round(sc_end - sc_start, 3),
            "chars": len(text.replace(" ", "")),
            "captions": caps,
        })
        cursor_char += len(text)

    total = max(s["end"] for s in result_scenes) if result_scenes else 0.0
    payload = {
        "source_md": None, "total_duration": round(total, 3),
        "char_count": sum(s["chars"] for s in result_scenes),
        "chars_per_second": round(sum(s["chars"] for s in result_scenes) / total, 2) if total else 0,
        "scenes": result_scenes, "captions": result_caps,
    }
    with open(os.path.join(out_dir, "captions.json"), "w", encoding="utf-8") as f:
        json.dump(payload, f, ensure_ascii=False, indent=2)

    # 控制台只打 ASCII 摘要，避免 PowerShell 控制台把中文显示成乱码；明细看 captions.json
    print("")
    print("  TOTAL  %.2fs  (%d chars, %.2f chars/s)"
          % (total, payload["char_count"], payload["chars_per_second"]))
    for s in result_scenes:
        print("    scene %d  %6.2f -> %6.2f  (%5.2fs)  caps=%d"
              % (s["n"], s["start"], s["end"], s["duration"], len(s["captions"])))
    print("")
    print("  wrote transcript.json / captions.json")
    return 0


if __name__ == "__main__":
    if len(sys.argv) < 2:
        raise SystemExit("用法：python scripts/align.py \"<输出目录>\"")
    sys.exit(main(sys.argv[1]))
