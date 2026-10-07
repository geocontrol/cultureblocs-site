#!/usr/bin/env python3
"""Generate one static page per event, with a link-card image, so a post
or a shared link unfurls with that event's own title and picture.

    python3 tools/events/build_event_pages.py                 # frieze-week-london
    python3 tools/events/build_event_pages.py --dir <name>
    python3 tools/events/build_event_pages.py --no-images     # pages only

Writes events/<dir>/<slug>/index.html and og.png for every event, plus
events/<dir>/og.png for the directory itself. Pages are generated from the
listing — rerun after editing it. Images need Pillow (pip install pillow);
without it, pages are still written and point at the directory image.
"""
import argparse, html, json, re, shutil, sys
from datetime import date, datetime, timedelta
from pathlib import Path
from urllib.parse import quote
from zoneinfo import ZoneInfo

ROOT = Path(__file__).resolve().parents[2]
RESERVED = {"cards", "report"}   # folders in a directory that aren't event pages
SITE = "https://www.cultureblocs.com"
ZONE = ZoneInfo("Europe/London")   # the directory's zone: meta.tz, set in main()
E = html.escape

GROUP = {"fair": "fairs", "talk": "talks", "talks": "talks", "screening": "talks",
         "exhibition": "exhibitions", "commission": "exhibitions",
         "gallery-day": "galleries", "party": "nights", "performance": "nights",
         "film": "films"}
COLOUR = {"fairs": "#2B4BC7", "talks": "#C74E2B", "exhibitions": "#2E7A4F",
          "galleries": "#C7860F", "nights": "#5B2BC7", "films": "#0F6E6B"}
KIND_WORD = {"fair": "Fair", "talk": "Talk", "talks": "Talks", "screening": "Film",
             "exhibition": "Exhibition", "commission": "Commission",
             "gallery-day": "Gallery day", "party": "Night", "performance": "Performance",
             "film": "Film"}


def verb(meta):
    """What the directory calls being there (events/lib/verb.js): went / saw."""
    v = meta.get("verb") or {}
    if isinstance(v, dict) and v.get("button") and v.get("past"):
        return {"button": v["button"], "past": v["past"], "it": " it"}
    return {"button": "I went", "past": "went", "it": ""}


def kind_word(entry):
    f = entry.get("film") or {}
    if entry["category"] != "film":
        return KIND_WORD.get(entry["category"], "Event")
    if f.get("section") == "Expanded":
        return "Game" if f.get("programme") == "Games Lounge" else "Immersive"
    if f.get("programme"):
        return "Short film"
    return "Film"


def credit_line(f):
    parts = []
    if f.get("directors"):
        parts.append("Dir. " + ", ".join(f["directors"]))
    made = " ".join(x for x in (f.get("country"), f.get("year")) if x)
    if made:
        parts.append(made)
    if f.get("runtime"):
        parts.append(f"{f['runtime']}min")
    return " · ".join(parts)


def screenings_html(entry):
    shows = entry.get("screenings") or []
    if not shows:
        return ""
    items = "".join(
        f"<li><span class=\"sc-when\">{E(day(london(s['start']).date()))} {london(s['start']):%H:%M}</span> "
        f"<span class=\"sc-where\">{E(s.get('venue', ''))}</span></li>" for s in shows)
    head = "The programme screens" if (entry.get("film") or {}).get("programme") else "Screenings"
    return f'<dt>{"Shows" if head == "Screenings" else "Programme"}</dt><dd><ul class="film-shows">{items}</ul></dd>'


def film_facts(entry):
    f = entry.get("film") or {}
    rows = []
    if f.get("programme"):
        rows.append(("In", f"{f['programme']}" + (f" · {f['section']}" if f.get("section") else "")))
    elif f.get("section"):
        rows.append(("Strand", f["section"]))
    if credit_line(f):
        rows.append(("Film", credit_line(f)))
    if f.get("cast"):
        rows.append(("With", f["cast"]))
    return "".join(f"<dt>{E(k)}</dt><dd>{E(v)}</dd>" for k, v in rows)

NAV = """<nav>
  <a class="mark" href="/">Culture<span>Blocs</span></a>
  <a class="item" href="/lexicons.html">Protocol</a>
  <a class="item" href="/apps.html">Apps</a>
  <a class="item" href="/howto.html">How to</a>
  <a class="item" href="/events/" aria-current="page">Events</a>
  <a class="item" href="/meetup.html">Meetup</a>
</nav>"""
FOOTER = """<footer><div class="inner">
  cultureblocs.com is the schema authority for <code>com.cultureblocs.*</code> ·
  a <a href="https://geekyoto.com">geekyoto</a> project ·
  <a href="/privacy.html">privacy</a>
</div></footer>"""


# ---------- dates, read in the directory's zone as the site does ----------
def london(iso):
    return datetime.fromisoformat(iso.replace("Z", "+00:00")).astimezone(ZONE)


def shape(rec):
    s = london(rec["startsAt"])
    e = london(rec["endsAt"]) if rec.get("endsAt") else s
    end_day = e.date()
    if rec.get("endsAt") and end_day > s.date() and e.hour * 60 + e.minute < 6 * 60:
        end_day -= timedelta(days=1)
    end_day = max(end_day, s.date())
    return {"s": s, "e": e, "has_end": bool(rec.get("endsAt")), "end_day": end_day,
            "days": (end_day - s.date()).days + 1,
            "open_start": s.strftime("%H:%M") == "00:00",
            "open_end": not rec.get("endsAt") or e.strftime("%H:%M") == "23:59"}


def day(d):        # Thu 15 Oct
    return f"{d:%a} {d.day} {d:%b}"


def long_day(d):   # Thursday 15 October 2026
    return f"{d:%A} {d.day} {d:%B %Y}"


def when_lines(rec):
    sh = shape(rec)
    s, e = sh["s"], sh["e"]
    if sh["days"] == 1:
        if sh["open_start"]:
            return long_day(s.date()), None
        t = s.strftime("%H:%M") + (f"–{e:%H:%M}" if sh["has_end"] and not sh["open_end"] else "")
        return long_day(s.date()), t
    if sh["days"] > 7:
        return f"{s.day} {s:%B %Y} – {sh['end_day'].day} {sh['end_day']:%B %Y}", None
    return f"{day(s.date())} – {day(sh['end_day'])} {sh['end_day']:%Y}", None


# ---------- page ----------
def location(rec):
    for loc in rec.get("locations", []):
        if loc.get("name") or loc.get("street"):
            parts = [loc.get(k) for k in ("name", "street", "postalCode", "locality") if loc.get(k)]
            return loc.get("name") or loc.get("street"), ", ".join(parts)
    return None, None


def safe(u):
    return u if re.match(r"^https?://", str(u or "")) else None


def crumbs(meta, d):
    """Back to the directory. A directory with its own home (meta.home, e.g. a
    gallery at /gallery/london/serpentine/) isn't under /events/, so no Events crumb."""
    if meta.get("home"):
        return f'<a href="{E(meta["home"])}">{E(meta["name"])}</a>'
    return f'<a href="/events/">Events</a> / <a href="/events/{E(d)}/">{E(meta["name"])}</a>'


def page(entry, meta, d, has_image):
    rec = entry["record"]
    name = rec["name"]
    url = f"{SITE}/events/{d}/{entry['slug']}/"
    when, time = when_lines(rec)
    venue, address = location(rec)
    group = GROUP.get(entry["category"], "fairs")
    desc_meta = " · ".join(x for x in (when + (f", {time}" if time else ""), venue) if x)
    went = f"/went/?dir={quote(d)}&event={quote(entry['atUri'], safe='')}"
    v = verb(meta)
    film = entry["category"] == "film"
    image = f"{url}og.png" if has_image else f"{SITE}/events/{d}/og.png"
    links = " · ".join(
        f'<a href="{E(safe(u["uri"]))}" rel="noopener">{E(u.get("name") or u["uri"])}</a>'
        for u in rec.get("uris", []) if safe(u.get("uri")))
    status = rec.get("status", "").rsplit("#", 1)[-1]
    flag = {"cancelled": "Cancelled", "postponed": "Postponed", "planned": "Dates to be confirmed",
            "rescheduled": "Rescheduled"}.get(status)
    map_link = (f'<a href="https://www.openstreetmap.org/search?query={quote(address)}" rel="noopener">'
                f'{E(address)}</a>') if address else ""
    return f"""<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>{E(name)} — {E(meta["name"])} — CultureBlocs</title>
<meta name="description" content="{E(desc_meta)}. {E(rec.get('description', '')[:200])}">
<link rel="canonical" href="{url}">
<meta property="og:type" content="website">
<meta property="og:site_name" content="CultureBlocs">
<meta property="og:title" content="{E(name)}">
<meta property="og:description" content="{E(desc_meta)}">
<meta property="og:url" content="{url}">
<meta property="og:image" content="{image}">
<meta property="og:image:width" content="1200">
<meta property="og:image:height" content="630">
<meta name="twitter:card" content="summary_large_image">
<link rel="stylesheet" href="/style.css">
<link rel="stylesheet" href="/events/events.css">
</head>
<body>
{NAV}
<main>
  <p class="ev-meta">{crumbs(meta, d)}</p>
  <article class="event-page ev-{group}">
    <p class="ev-kind">{E(kind_word(entry))}{f' · <span class="status prototype">{E(flag)}</span>' if flag else ''}</p>
    <div class="hero"><h1>{E(name)}</h1></div>
    <dl class="ev-facts">
      {film_facts(entry) if film else ""}
      {screenings_html(entry) if film and entry.get("screenings") else f'<dt>When</dt><dd>{E(when)}{f"<br>{E(time)}" if time else ""}</dd>'}
      {f"<dt>Where</dt><dd>{map_link}</dd>" if address and not entry.get("screenings") else ""}
    </dl>
    <p><a class="cta" href="{E(went)}">{E(v["button"])}</a></p>
    <p class="ev-intro">{"Seen it?" if film else "Been?"} Say so in a bead of your own — a small note kept in
    your Atmosphere account (Bluesky, Blacksky…), pointing at this {"film" if film else "event"}.</p>
    {f'<section><h2 class="sec">About</h2><p class="ev-desc">{E(rec["description"])}</p></section>' if rec.get("description") else ""}
    {f'<p class="ev-links">{links}</p>' if links else ""}
    <section id="who-went" class="who" data-event="{E(entry["atUri"])}" data-went="{E(went)}" data-said="{E(v["past"] + v["it"])}">
      <h2 class="sec">Who {E(v["past"])}{E(v["it"])}</h2>
      <div id="who-items"><p class="ev-intro">Looking for beads…</p></div>
    </section>
    <section>
      <h2 class="sec">This {"film" if film else "event"} as a record</h2>
      <p class="ev-ref">Published as an open calendar record by
      <code>@{E(meta["repo"])}</code>. Reference it from anything you write:<br>
      <code>{E(entry["atUri"])}</code></p>
      <p class="ev-ref">An independent listing, not affiliated with the organisers. Times
      change — check with the venue before you travel.</p>
    </section>
  </article>
</main>
{FOOTER}
<script type="module" src="/events/who.js"></script>
</body>
</html>
"""


# ---------- link-card image ----------
FONT_PATHS = {
    "bold": ["/System/Library/Fonts/Supplemental/Futura.ttc",
             "/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf"],
    "regular": ["/System/Library/Fonts/Supplemental/Futura.ttc",
                "/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf"],
    "mono": ["/System/Library/Fonts/Menlo.ttc",
             "/usr/share/fonts/truetype/dejavu/DejaVuSansMono.ttf"],
}


def font(kind, size):
    from PIL import ImageFont
    for p in FONT_PATHS[kind]:
        if Path(p).exists():
            idx = 2 if (p.endswith("Futura.ttc") and kind == "bold") else 0
            return ImageFont.truetype(p, size, index=idx)
    return ImageFont.load_default(size)


def wrap(draw, text, f, width, max_lines):
    words, lines, cur = text.split(), [], ""
    for w in words:
        trial = f"{cur} {w}".strip()
        if draw.textlength(trial, font=f) <= width:
            cur = trial
        else:
            if cur:
                lines.append(cur)
            cur = w
    if cur:
        lines.append(cur)
    if len(lines) > max_lines:
        lines = lines[:max_lines]
        while draw.textlength(lines[-1] + "…", font=f) > width and " " in lines[-1]:
            lines[-1] = lines[-1].rsplit(" ", 1)[0]
        lines[-1] += "…"
    return lines


def card(path, title, sub, foot, colour):
    from PIL import Image, ImageDraw
    W, H, M = 1200, 630, 80
    im = Image.new("RGB", (W, H), "#FAFAF9")
    dr = ImageDraw.Draw(im)
    dr.rectangle([0, 0, 14, H], fill=colour)
    mark = font("bold", 30)
    dr.text((M, 62), "CULTURE", font=mark, fill="#1B1D22")
    dr.text((M + dr.textlength("CULTURE", font=mark), 62), "BLOCS", font=mark, fill="#2B4BC7")
    # Shrink the title until it fits in three lines (the room above the thread).
    for size in (76, 68, 60, 54, 48):
        f = font("bold", size)
        if len(wrap(dr, title, f, W - 2 * M, 99)) <= 3:
            break
    lines = wrap(dr, title, f, W - 2 * M, 3)
    y = 150
    for line in lines:
        dr.text((M, y), line, font=f, fill="#1B1D22")
        y += int(size * 1.14)
    sf = font("regular", 30)
    y += 14
    for line in wrap(dr, sub, sf, W - 2 * M, 2):
        dr.text((M, y), line, font=sf, fill="#4A4741")
        y += 40
    # the thread: a string of beads along the foot
    ty = H - 64
    palette = ["#2B4BC7", "#C7860F", "#B0326E", "#2E7A4F", "#0F6E6B", "#C74E2B", "#5B2BC7"]
    dr.line([M, ty, M + 40 + (len(palette) - 1) * 70 + 40, ty], fill="#C9C7C0", width=3)
    for i, c in enumerate(palette):
        x = M + 40 + i * 70
        dr.ellipse([x - 13, ty - 13, x + 13, ty + 13], fill=c)
    dr.text((M + 40 + len(palette) * 70 + 10, ty - 14), foot, font=font("mono", 24), fill="#8A8880")
    im.save(path, optimize=True)


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--dir", default="frieze-week-london")
    ap.add_argument("--no-images", action="store_true")
    a = ap.parse_args()
    base = ROOT / "events" / a.dir
    doc = json.loads((base / "events.json").read_text(encoding="utf-8"))
    meta = doc["meta"]
    global ZONE
    ZONE = ZoneInfo(meta.get("tz") or "Europe/London")
    images = not a.no_images
    if images:
        try:
            import PIL  # noqa: F401
        except ImportError:
            print("Pillow not installed — writing pages without new images", file=sys.stderr)
            images = False

    wanted = set()
    for e in doc["records"]:
        if e["category"] == "umbrella":
            continue
        wanted.add(e["slug"])
        out = base / e["slug"]
        out.mkdir(exist_ok=True)
        if images:
            when, time = when_lines(e["record"])
            venue, _ = location(e["record"])
            sub = " · ".join(x for x in (when + (f", {time}" if time else ""), venue) if x)
            if e["category"] == "film" and credit_line(e.get("film") or {}):
                sub = credit_line(e["film"])
            card(out / "og.png", e["record"]["name"], sub, f"{meta['name']}  ·  {verb(meta)['button']}",
                 COLOUR[GROUP.get(e["category"], "fairs")])
        has_image = (out / "og.png").exists()
        (out / "index.html").write_text(page(e, meta, a.dir, has_image), encoding="utf-8")
    if images:
        card(base / "og.png", meta["name"], meta.get("cardLine") or "Fairs, talks, gallery days and exhibitions, day by day",
             "cultureblocs.com" + (meta.get("home") or "/events").rstrip("/"), "#2B4BC7")

    # A slug that is no longer in the listing is a page that should go.
    for child in base.iterdir():
        if child.name in RESERVED:
            continue
        if child.is_dir() and child.name not in wanted and (child / "index.html").exists():
            shutil.rmtree(child)
            print("removed stale page", child.name)
    print(f"{len(wanted)} event pages written to events/{a.dir}/")


if __name__ == "__main__":
    main()
