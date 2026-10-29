#!/usr/bin/env python3
"""Generate the extension icons.

Run once (or after changing the design):
    python3 tools/make-icons.py

Icons are committed to `src/icons/` so the build stays dependency-free
(no Pillow requirement at build time, only when regenerating).
"""

from pathlib import Path

from PIL import Image, ImageDraw

OUT_DIR = Path(__file__).resolve().parent.parent / "src" / "icons"
SIZES = (16, 32, 48, 128)

BG = (40, 42, 54, 255)        # Dracula background
BORDER = (68, 71, 90, 255)    # Dracula current line
TEXT = (248, 248, 242, 255)   # Dracula foreground
ACCENT = (189, 147, 249, 255) # Dracula purple
CARET = (80, 250, 123, 255)   # Dracula green

SUPERSAMPLE = 8


def render(size: int) -> Image.Image:
    s = size * SUPERSAMPLE
    img = Image.new("RGBA", (s, s), (0, 0, 0, 0))
    d = ImageDraw.Draw(img)

    pad = round(s * 0.055)
    radius = round(s * 0.23)
    stroke = max(1, round(s * 0.02))
    d.rounded_rectangle(
        [pad, pad, s - pad - 1, s - pad - 1],
        radius=radius,
        fill=BG,
        outline=BORDER,
        width=stroke,
    )

    # Three "lines of code", the last one short, with a green caret after it.
    line_h = round(s * 0.075)
    x0 = round(s * 0.20)
    rows = (
        (round(s * 0.30), round(s * 0.58), ACCENT),
        (round(s * 0.47), round(s * 0.66), TEXT),
        (round(s * 0.64), round(s * 0.40), ACCENT),
    )
    for y, x1, color in rows:
        d.rounded_rectangle(
            [x0, y, x1, y + line_h],
            radius=line_h // 2,
            fill=color,
        )

    caret_x = rows[-1][1] + round(s * 0.07)
    d.rounded_rectangle(
        [caret_x, rows[-1][0] - round(s * 0.02),
         caret_x + round(s * 0.05), rows[-1][0] + line_h + round(s * 0.02)],
        radius=round(s * 0.015),
        fill=CARET,
    )

    return img.resize((size, size), Image.LANCZOS)


def main() -> None:
    OUT_DIR.mkdir(parents=True, exist_ok=True)
    for size in SIZES:
        path = OUT_DIR / f"icon-{size}.png"
        render(size).save(path, "PNG", optimize=True)
        print(f"wrote {path} ({path.stat().st_size} bytes)")


if __name__ == "__main__":
    main()
