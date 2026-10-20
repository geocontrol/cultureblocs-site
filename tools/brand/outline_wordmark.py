"""Build the threaded CultureBlocs wordmark as outlined SVG paths.

Usage: python3 -I outline_wordmark.py <font.woff2> <out_dir>
Letters come from the font as paths, so the SVG renders the same everywhere.
"""
import sys
from pathlib import Path
from fontTools.ttLib import TTFont
from fontTools.pens.svgPathPen import SVGPathPen
from fontTools.pens.transformPen import TransformPen

INK, ACCENT, THREAD = "#1B1D22", "#2B4BC7", "#C9C7C0"

font = TTFont(sys.argv[1])
out = Path(sys.argv[2])
gs = font.getGlyphSet()
cmap = font.getBestCmap()
upm = font["head"].unitsPerEm
cap = getattr(font["OS/2"], "sCapHeight", 0) or int(upm * 0.7)

SIZE = 40.0            # px per em
TRACK = 0.22 * SIZE    # letter-spacing
scale = SIZE / upm
cap_px = cap * scale
PAD = 12.0             # thread overhang either side
HALO = 6.0
baseline = 8 + cap_px  # 8px top margin above caps
mid = baseline - cap_px / 2

def glyph_path(ch, x):
    name = cmap[ord(ch)]
    pen = SVGPathPen(gs)
    tpen = TransformPen(pen, (scale, 0, 0, -scale, x, baseline))
    gs[name].draw(tpen)
    return pen.getCommands(), gs[name].width * scale

def build(halo_colour):
    x = PAD
    letters = []   # (path, colour)
    bead = None
    for i, ch in enumerate("CULTUREBLOCS"):
        colour = INK if i < 7 else ACCENT
        if ch == "O" and i == 9:
            _, adv = glyph_path("O", 0)
            r = cap_px / 2 + 1.5           # a touch over cap height, like a round O
            bead = (x + adv / 2, r)
            x += adv + TRACK
            continue
        d, adv = glyph_path(ch, x)
        letters.append((d, colour))
        x += adv + TRACK
    width = x - TRACK + PAD
    height = baseline + 8
    parts = [
        f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 {width:.1f} {height:.1f}" '
        f'width="{width:.0f}" height="{height:.0f}" role="img" aria-label="CultureBlocs">',
        "<title>CultureBlocs</title>",
        f'<line x1="0" y1="{mid:.2f}" x2="{width:.1f}" y2="{mid:.2f}" stroke="{THREAD}" stroke-width="2.5"/>',
    ]
    # Halo pass first (stroke only), then fills on top: works in every renderer,
    # no reliance on paint-order.
    parts.append(f'<g fill="{halo_colour}" stroke="{halo_colour}" stroke-width="{HALO}" stroke-linejoin="round">')
    for d, _ in letters:
        parts.append(f'<path d="{d}"/>')
    parts.append("</g>")
    for d, colour in letters:
        parts.append(f'<path d="{d}" fill="{colour}"/>')
    cx, r = bead
    parts.append(f'<circle cx="{cx:.2f}" cy="{mid:.2f}" r="{r:.2f}" fill="{ACCENT}"/>')
    parts.append("</svg>\n")
    return "\n".join(parts), width, height

for name, halo in [("cultureblocs-wordmark.svg", "#FAFAF9"), ("cultureblocs-wordmark-on-white.svg", "#FFFFFF")]:
    svg, w, h = build(halo)
    (out / name).write_text(svg)
    print(name, f"{w:.1f}x{h:.1f}", "cap", round(cap_px, 2))
