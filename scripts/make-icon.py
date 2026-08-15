"""
Generates assets/routine.ico from the app's logo mark.

Drawn at 4x and downsampled, because PIL has no anti-aliasing of its own —
supersampling is what keeps the ring and the rounded corners smooth at 16px.
"""
from PIL import Image, ImageDraw
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
OUT = ROOT / "assets" / "routine.ico"
OUT.parent.mkdir(parents=True, exist_ok=True)

# The dark-mode logo: near-white plate, dark mark. Reads on light and dark
# desktops alike, which a dark-on-dark plate would not.
PLATE = (233, 237, 245, 255)   # --accent (dark theme)
MARK = (14, 17, 25, 255)       # --ink-on-accent

SS = 4          # supersample factor
BASE = 256
S = BASE * SS

img = Image.new("RGBA", (S, S), (0, 0, 0, 0))
d = ImageDraw.Draw(img)

# plate — 7.5/26 corner radius, matching the SVG
radius = round(S * 7.5 / 26)
d.rounded_rectangle([0, 0, S - 1, S - 1], radius=radius, fill=PLATE)

# ring — a cycle with one position marked on it.
# The break sits at the upper right, NOT at 12 o'clock: a vertical gap with a
# dot above it is the universal power symbol, which this is not.
import math

cx, cy = S / 2, S / 2
r = S * 5.6 / 26
w = round(S * 1.9 / 26)
box = [cx - r, cy - r, cx + r, cy + r]

MARKER_ANGLE = 305          # PIL degrees: 0 = 3 o'clock, clockwise
GAP = 62
d.arc(box, start=MARKER_ANGLE + GAP / 2, end=MARKER_ANGLE - GAP / 2, fill=MARK, width=w)

# the marker, centred on the ring's own path
dot_r = S * 2.15 / 26
mx = cx + r * math.cos(math.radians(MARKER_ANGLE))
my = cy + r * math.sin(math.radians(MARKER_ANGLE))
d.ellipse([mx - dot_r, my - dot_r, mx + dot_r, my + dot_r], fill=MARK)

sizes = [256, 128, 64, 48, 32, 24, 16]
frames = [img.resize((n, n), Image.LANCZOS) for n in sizes]
frames[0].save(OUT, format="ICO", sizes=[(n, n) for n in sizes])

print(f"wrote {OUT}  ({OUT.stat().st_size:,} bytes, {len(sizes)} sizes)")

# A PNG preview so the result can actually be looked at.
preview = ROOT / "assets" / "routine-icon-preview.png"
strip = Image.new("RGBA", (sum(sizes[:5]) + 40, 256), (24, 27, 38, 255))
x = 0
for n in sizes[:5]:
    strip.paste(img.resize((n, n), Image.LANCZOS), (x, (256 - n) // 2))
    x += n + 10
strip.save(preview)
print(f"wrote {preview}")
