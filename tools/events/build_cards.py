#!/usr/bin/env python3
"""Printable "I went" cards with QR codes — eight to an A4 sheet.

    pip install segno                       # pure-Python QR codes
    python3 tools/events/build_cards.py     # frieze-week-london
    python3 tools/events/build_cards.py --dir <name>

Writes events/<dir>/cards/index.html: one card per event (fairs first —
they are the ones worth handing out), plus cards for the whole programme.
Each event card's QR is a short link, cultureblocs.com/w/<short>/<rkey>,
which vercel.json redirects to /went/?dir=<dir>&e=<rkey>: about 45
characters, so the code stays simple enough to scan from a small card in
a dim hall. A new directory needs a 'short' code in its events.json meta
and the two matching /w/ redirects. QR codes are generated here as inline SVG, so the
page needs no script and prints crisply at any size.
"""
import argparse, html, json, sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
from build_event_pages import GROUP, KIND_WORD, location, when_lines  # noqa: E402

ROOT = Path(__file__).resolve().parents[2]
SHORT = "https://cultureblocs.com"   # QR links: short, so the codes stay simple
E = html.escape
ORDER = ["fairs", "talks", "nights", "galleries", "exhibitions"]


def qr_svg(url):
    import segno
    q = segno.make(url, error="m")
    return q.svg_inline(scale=1, border=0, dark="#1B1D22", omitsize=True)


def card(kind, colour_class, title, lines, url, caption):
    return f"""<article class="qc {colour_class}">
  <div class="qc-text">
    <p class="qc-mark">Culture<span>Blocs</span> · {E(kind)}</p>
    <h2>{E(title)}</h2>
    {''.join(f'<p class="qc-line">{E(l)}</p>' for l in lines if l)}
    <p class="qc-cap">{caption}</p>
  </div>
  <div class="qc-qr">{qr_svg(url)}<p class="qc-url">{E(url.replace('https://', ''))}</p></div>
</article>"""


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--dir", default="frieze-week-london")
    a = ap.parse_args()
    try:
        import segno  # noqa: F401
    except ImportError:
        sys.exit("needs segno: pip install segno")
    base = ROOT / "events" / a.dir
    doc = json.loads((base / "events.json").read_text(encoding="utf-8"))
    meta = doc["meta"]
    events = [e for e in doc["records"] if e["category"] != "umbrella"]
    events.sort(key=lambda e: (ORDER.index(GROUP.get(e["category"], "exhibitions")),
                               e["record"]["startsAt"], e["record"]["name"]))

    short = meta.get("short")
    if not short:
        sys.exit("events.json meta needs a 'short' code, with matching /w/<short> redirects in vercel.json")
    week_url = f"{SHORT}/w/{short}"
    cards = [card("The programme", "k-fairs", meta["name"],
                  ["Fairs, talks, gallery days and exhibitions, day by day"],
                  week_url, "Scan for the whole week — and press <b>I went</b> on anything you were at.")]
    for e in events:
        rec = e["record"]
        when, time = when_lines(rec)
        venue, _ = location(rec)
        url = f"{SHORT}/w/{short}/{e['rkey']}"
        cards.append(card(KIND_WORD.get(e["category"], "Event"), f"k-{GROUP.get(e['category'], 'fairs')}",
                          rec["name"], [when + (f" · {time}" if time else ""), venue], url,
                          "Been? Scan, write a line, sign in with Bluesky — it’s kept in <b>your own</b> account."))
    # Fill the last sheet with programme cards rather than leaving gaps.
    while len(cards) % 8:
        cards.append(cards[0])

    sheets = "\n".join(f'<section class="sheet">{"".join(cards[i:i + 8])}</section>'
                       for i in range(0, len(cards), 8))
    out = base / "cards"
    out.mkdir(exist_ok=True)
    (out / "index.html").write_text(f"""<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Printable cards — {E(meta["name"])} — CultureBlocs</title>
<meta name="robots" content="noindex">
<link rel="stylesheet" href="/style.css">
<link rel="stylesheet" href="/events/cards.css">
</head>
<body>
<nav>
  <a class="mark" href="/">Culture<span>Blocs</span></a>
  <a class="item" href="/lexicons.html">Protocol</a>
  <a class="item" href="/apps.html">Apps</a>
  <a class="item" href="/howto.html">How to</a>
  <a class="item" href="/events/" aria-current="page">Events</a>
  <a class="item" href="/meetup.html">Meetup</a>
</nav>
<main class="cards-intro">
  <p class="ev-meta"><a href="/events/">Events</a> / <a href="/events/{E(a.dir)}/">{E(meta["name"])}</a> / Cards</p>
  <div class="hero"><h1>Cards to hand out.</h1>
  <p class="lede">{len(cards)} cards on {len(cards) // 8} A4 sheets — one for each event, fairs first,
  plus cards for the whole programme. Each QR code opens <b>I went</b> straight on
  that event.</p></div>
  <p class="ev-intro">Print from your browser at <b>A4, 100% / actual size</b>, with
  headers and footers off. Cut along the faint lines. Print just the first sheet if
  you only want the fairs.</p>
</main>
{sheets}
</body>
</html>
""", encoding="utf-8")
    print(f"{len(cards)} cards on {len(cards) // 8} sheets -> events/{a.dir}/cards/index.html")


if __name__ == "__main__":
    main()
