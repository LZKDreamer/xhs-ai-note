#!/usr/bin/env python3
"""build-shots.py — 把原文截图按 shots.json 裁切，并生成图上标注

用法:
    python scripts/build-shots.py "output/<笔记目录>"

做三件事:
    1. 按 shots.json 的 crop 矩形裁图 -> <笔记目录>/assets/<id>.png
    2. 生成接触印相 <笔记目录>/assets/_contact.png，用于人工复核裁切位置
    3. 把标注 HTML 注入 note.html 的 <!-- SHOTS:START --> / <!-- SHOTS:END --> 标记区
       （note.html 还不存在、或没有标记区时只做 1 和 2）

为什么要有这个脚本:
    裁切藏在 CSS 的 object-fit 里就无法复核 —— 你没法确认裁掉了什么。
    所以裁切落盘，且 shots.json 是裁切与标注的唯一真源: 改了裁切，标注坐标跟着一起改。

坐标一律用百分比，图片缩放后不会错位。
"""
import json
import sys
from pathlib import Path

from PIL import Image, ImageDraw, ImageFont

CONTACT_W = 900          # 接触印相里每块缩到的宽度
LABEL_H = 54             # 每块上方的标签条高度（坐标一行 + 裁切理由一行）
GAP = 14                 # 块间距
PAD = 18                 # 印相外边距


def load_font(size=16, cjk=False):
    """等宽字体给坐标用；CJK 字体给裁切理由用（consola 画中文会变成方块）。"""
    if cjk:
        candidates = (r"C:\Windows\Fonts\msyh.ttc", r"C:\Windows\Fonts\simhei.ttf")
    else:
        candidates = (r"C:\Windows\Fonts\consola.ttf", r"C:\Windows\Fonts\arial.ttf")
    for p in candidates + ("/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf",):
        if Path(p).exists():
            try:
                return ImageFont.truetype(p, size)
            except OSError:
                pass
    return ImageFont.load_default()


def ellipsize(text, font, max_w, draw):
    if draw.textlength(text, font=font) <= max_w:
        return text
    out = ""
    for ch in text:
        if draw.textlength(out + ch + "…", font=font) > max_w:
            break
        out += ch
    return out + "…"


def clamp_crop(box, w, h):
    l, t, r, b = box
    l = max(0, min(int(l), w - 1))
    t = max(0, min(int(t), h - 1))
    r = max(l + 1, min(int(r), w))
    b = max(t + 1, min(int(b), h))
    return l, t, r, b


def build_contact(tiles, out_path):
    """把裁切结果竖着拼成一张图。每块上方两行：
       第一行坐标（等宽字体），第二行该图的裁切理由（中文）—— 复核裁切时理由就在旁边。"""
    meta_font = load_font(17)
    why_font = load_font(16, cjk=True)
    scaled = []
    for sid, im, box, reason in tiles:
        ratio = CONTACT_W / im.width
        scaled.append(
            (sid, im.resize((CONTACT_W, max(1, round(im.height * ratio)))), box, reason)
        )

    total_h = PAD * 2 + sum(LABEL_H + im.height + GAP for _, im, _, _ in scaled) - GAP
    sheet = Image.new("RGB", (CONTACT_W + PAD * 2, total_h), (24, 22, 20))
    draw = ImageDraw.Draw(sheet)

    y = PAD
    for sid, im, box, reason in scaled:
        draw.rectangle([PAD, y, PAD + CONTACT_W, y + LABEL_H - 8], fill=(38, 34, 30))
        draw.text(
            (PAD + 10, y + 3),
            f"{sid}   crop {box[2]-box[0]}x{box[3]-box[1]}   from ({box[0]},{box[1]})-({box[2]},{box[3]})",
            fill=(250, 200, 140),
            font=meta_font,
        )
        if reason:
            draw.text(
                (PAD + 10, y + 27),
                ellipsize(reason, why_font, CONTACT_W - 20, draw),
                fill=(170, 160, 150),
                font=why_font,
            )
        y += LABEL_H
        sheet.paste(im, (PAD, y))
        draw.rectangle([PAD, y, PAD + CONTACT_W - 1, y + im.height - 1], outline=(249, 115, 22), width=2)
        y += im.height + GAP

    sheet.save(out_path)
    return sheet.size


def css_pct(v):
    s = f"{v:.2f}".rstrip("0").rstrip(".")
    return f"{s}%"


def build_html(shots):
    """生成标注层的坐标 CSS + 每个截图页的整段 HTML。"""
    css, sections = [], []

    for s in shots:
        sid = s["id"]
        marks = s.get("marks", [])

        if s.get("frame_w"):
            css.append(f".{sid} .frame {{ width: {int(s['frame_w'])}px; }}")

        for m in marks:
            if "box" in m:
                x1, y1, x2, y2 = m["box"]
                css.append(
                    f".{sid} .a{m['n']} {{ left: {css_pct(x1)}; top: {css_pct(y1)}; "
                    f"width: {css_pct(x2 - x1)}; height: {css_pct(y2 - y1)}; }}"
                )
            else:
                css.append(
                    f".{sid} .a{m['n']} {{ left: {css_pct(m['x'])}; top: {css_pct(m['y'])}; }}"
                )

        overlay = []
        for m in marks:
            if "box" in m:
                overlay.append(
                    f'<span class="annot-box a{m["n"]}"><span class="bub">{m["n"]}</span></span>'
                )
            else:
                overlay.append(f'<span class="annot a{m["n"]}">{m["n"]}</span>')

        mark_rows = []
        for m in marks:
            mark_rows.append(
                "      <div class=\"mark\">\n"
                f"        <div class=\"pin\">{m['n']}</div>\n"
                f"        <div class=\"txt\">{m['text']}</div>\n"
                "      </div>"
            )


        img = f'<img src="./assets/{sid}.png" alt="{s["alt"]}" />'
        marks_block = '<div class="marks">' + "".join(mark_rows) + "</div>"
        body = '<div class="frame mt-24">' + img + "".join(overlay) + "</div>" + marks_block

        sections.append(
            f'<section class="card p-shot {sid}" id="p{s["page"]}">\n'
            '  <div class="flexcol">\n'
            f'    <div class="eyebrow">{s["eyebrow"]}</div>\n'
            f'    <div class="t-title">{s["title"]}</div>\n'
            f'    {body}\n'
            '  </div>\n'
            '</section>'
        )

    css_block = "<style>\n" + "\n".join(css) + "\n</style>\n"
    return css_block + "\n".join(sections)


def inject(note_html: Path, payload: str):
    START, END = "<!-- SHOTS:START -->", "<!-- SHOTS:END -->"
    raw = note_html.read_text(encoding="utf-8")
    if START not in raw or END not in raw:
        return False
    head, rest = raw.split(START, 1)
    _, tail = rest.split(END, 1)
    note_html.write_text(
        f"{head}{START}\n{payload}\n{END}{tail}", encoding="utf-8", newline="\n"
    )
    return True


def main():
    if len(sys.argv) < 2:
        print("usage: python scripts/build-shots.py \"output/<note-dir>\"")
        raise SystemExit(2)

    note_dir = Path(sys.argv[1])
    spec = json.loads((note_dir / "shots.json").read_text(encoding="utf-8"))
    src_dir = Path(spec["_source_dir"])
    assets = note_dir / "assets"
    assets.mkdir(parents=True, exist_ok=True)

    tiles = []
    for s in spec["shots"]:
        src = src_dir / s["src"]
        if not src.exists():
            print(f"  !! missing source: {src}")
            raise SystemExit(1)
        im = Image.open(src).convert("RGB")
        box = clamp_crop(s["crop"], im.width, im.height)
        crop = im.crop(box)
        out = assets / f"{s['id']}.png"
        crop.save(out, optimize=True)
        tiles.append((s["id"], crop, box, s.get("reason", "")))
        print(
            f"  {s['id']:<9} src {im.width}x{im.height} -> crop {box[2]-box[0]}x{box[3]-box[1]}"
            f"  ratio {(box[2]-box[0])/(box[3]-box[1]):.2f}  {out.stat().st_size//1024} KB"
        )
        if s.get("reason"):
            print(f"            why: {s['reason']}")

    size = build_contact(tiles, assets / "_contact.png")
    print(f"  contact sheet: {size[0]}x{size[1]} -> {assets / '_contact.png'}")

    note_html = note_dir / "note.html"
    if note_html.exists():
        ok = inject(note_html, build_html(spec["shots"]))
        print(f"  inject into note.html: {'ok' if ok else 'SKIPPED (no markers)'}")
    else:
        print("  inject into note.html: SKIPPED (note.html not created yet)")


if __name__ == "__main__":
    main()
