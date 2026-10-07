"""Build the BFI London Film Festival 2026 listing for cultureblocs.com.

One community.lexicon.calendar.event record per entry on the festival's
Films A–Z — a feature, a short inside a shorts programme, a game or an
immersive work — not one per screening. Each record runs from the film's
first screening to the end of its last, names every venue it plays, and
lists the screenings in its description, so the published record stands on
its own. The listing also keeps the screenings as site-only `screenings`
and the credits as `film`, which the festival page draws A–Z or by day.

The source is lff_2026_source.txt beside this script: facts read from the
BFI's own pages on 7 October 2026. No synopses or BFI copy are reproduced;
each record links to the film's BFI page.

London is on BST (+01:00) for the whole festival, 7–18 October 2026.
"""
import json, re, time, random
from datetime import datetime, timedelta, timezone
from pathlib import Path

HERE = Path(__file__).resolve().parent
SRC = HERE / "lff_2026_source.txt"
OUT = HERE.parents[1] / "events" / "london-film-festival" / "events.json"

COLL = "community.lexicon.calendar.event"
INPERSON = f"{COLL}#inperson"
SCHEDULED = f"{COLL}#scheduled"
CREATED = "2026-10-07T12:00:00.000Z"
REPO = "cultureblocs.com"
BST = timezone(timedelta(hours=1))
BFI = "https://whatson.bfi.org.uk/lff/Online/default.asp?BOparam::WScontent::loadArticle::permalink={}-lff26"

B32 = "234567abcdefghijklmnopqrstuvwxyz"
def tid(us, clock):
    n = (us << 10) | clock
    s = ""
    for _ in range(13):
        s = B32[n & 31] + s
        n >>= 5
    return s

# Venues by the name the BFI gives them; the building's address is ours.
BUILDINGS = {
    "BFI Southbank": ("Belvedere Road", "SE1 8XT"),
    "Southbank Centre": ("Belvedere Road", "SE1 8XX"),
    "Vue West End": ("3 Cranbourn Street, Leicester Square", "WC2H 7AL"),
    "ICA Cinema": ("The Mall", "SW1Y 5AH"),
    "Curzon Soho Cinema": ("99 Shaftesbury Avenue", "W1D 5DY"),
    "Prince Charles Cinema": ("7 Leicester Place", "WC2H 7BY"),
    "BFI IMAX": ("1 Charlie Chaplin Walk", "SE1 8XR"),
    "The Hall, St Martin-in-the-Fields": ("Trafalgar Square", "WC2N 4JJ"),
}
def addr(name):
    a = {"$type": "community.lexicon.location.address", "country": "GB",
         "locality": "London", "name": name}
    for b, (street, pc) in BUILDINGS.items():
        if name.startswith(b):
            a["street"], a["postalCode"] = street, pc
            break
    return a

def short_venue(v):
    """'BFI Southbank, Screen NFT1' -> 'BFI Southbank NFT1'."""
    special = {"Southbank Centre, Royal Festival Hall": "Royal Festival Hall", "BFI IMAX, Waterloo": "BFI IMAX"}
    return special.get(v) or v.replace(", Screen ", " ")

# The festival's strands, from the code on each screening; the three
# competitions come from each film's own page.
STRAND = {
    "GALA": "Galas", "SPECIALPRESENTATIONS": "Special Presentations",
    "LOVE": "Love", "DEBATE": "Debate", "DARE": "Dare", "LAUGH": "Laugh",
    "THRILL": "Thrill", "CULT": "Cult", "JOURNEY": "Journey", "CREATE": "Create",
    "EXPERIMENTA": "Experimenta", "FAMILY": "Family", "SHORTS": "Shorts",
    "EVENTS": "Events", "GAMES": "Expanded", "IMMERSIVE": "Expanded",
}
COMPETITION = {
    "Official Competition": "7-miles-out act-3 difficult-bride glaxo idiots imperium kettice look-back my-notes-on-mars woman-unknown",
    "First Feature Competition": "9-temples-to-heaven animol benimana common-story forest-high fruit-gathering lady last-day masc our-share-of-sand",
    "Documentary Competition": "bas-book calf-doll concrete-land concrete-turned-to-sand dependence once-upon-a-time-in-harlem-film queer-edward-ii sumo-spirit-weighs-nothing",
}
COMP_OF = {s: c for c, slugs in COMPETITION.items() for s in slugs.split()}
SECTION_FIX = {"water-body": "Special Presentations"}

# Works that run all festival rather than screening at set times.
RUNS = {
    "games-lounge": ("2026-10-07T00:00:00+01:00", "2026-10-18T23:59:00+01:00",
                     "BFI IMAX, foyer", "Free drop-in in the Games Lounge, every day of the festival."),
    "red-the-ocean-around-u": ("2026-10-07T00:00:00+01:00", "2026-10-18T23:59:00+01:00",
                     "BFI IMAX, foyer", "Free drop-in installation, every day of the festival."),
    "solwata": ("2026-10-07T11:00:00+01:00", "2026-10-18T20:00:00+01:00",
                "BFI Southbank, Atrium", "In the VR Lounge, 7–17 October 11:00–21:00, 18 October 11:00–20:00. Booked sessions."),
    "world-came-flooding-in": ("2026-10-07T11:00:00+01:00", "2026-10-18T20:00:00+01:00",
                "BFI Southbank, Atrium", "In the VR Lounge, 7–17 October 11:00–21:00, 18 October 11:00–20:00. Booked sessions."),
    "water-body": ("2026-10-07T12:30:00+01:00", "2026-10-18T21:00:00+01:00",
                   "The Hall, St Martin-in-the-Fields", "30-minute booked sessions, 3–18 October, 12:30–21:00 (festival days listed here)."),
}

def ascii_slug(s):
    import unicodedata
    s = unicodedata.normalize("NFKD", s.lower().replace("’", "").replace("'", "").replace("&", " and "))
    s = "".join(c for c in s if not unicodedata.combining(c))
    return re.sub(r"[^a-z0-9]+", "-", s).strip("-")[:80]

# ---- read the source
venues, rows = {}, []
for line in SRC.read_text(encoding="utf-8").splitlines():
    if not line.strip() or line.startswith("#"):
        continue
    if line.startswith("V: "):
        for part in line[3:].split("; "):
            i, name = part.split("=", 1)
            venues[int(i)] = name
        continue
    cols = [c.strip() for c in line.split("|")]
    assert len(cols) == 10, (len(cols), line)
    title, page, prog, code, dirs, cast, country, year, mins, shows = cols
    screenings = []
    for tok in shows.split():
        m = re.fullmatch(r"(\d\d)(\d\d)(\d\d)\.(\d+)", tok)
        assert m, (title, tok)
        d, hh, mm, v = m.groups()
        assert 7 <= int(d) <= 18, (title, tok)
        screenings.append({"start": f"2026-10-{d}T{hh}:{mm}:00+01:00", "venue": venues[int(v)]})
    rows.append(dict(title=title, page=page, prog=prog or None, code=code, dirs=dirs,
                     cast=cast, country=country, year=year, mins=int(mins) if mins else None,
                     screenings=sorted(screenings, key=lambda s: s["start"])))

# A shorts programme lasts as long as its films together.
prog_mins = {}
for r in rows:
    if r["prog"] and r["mins"]:
        prog_mins[r["prog"]] = prog_mins.get(r["prog"], 0) + r["mins"]

def fmt_show(s):
    d = datetime.fromisoformat(s["start"])
    return f"{d.strftime('%a')} {d.day} Oct {d.strftime('%H:%M')}, {short_venue(s['venue'])}"

def iso(d):
    return d.isoformat(timespec="seconds")

E = []
used = set()
for r in rows:
    section = SECTION_FIX.get(r["page"]) or COMP_OF.get(r["page"]) or STRAND.get(r["code"], "")
    slug = r["page"] if not r["prog"] else ascii_slug(r["title"])
    if slug in used:
        slug = f"{slug}-{ascii_slug(r['prog'] or 'lff')}"
    used.add(slug)
    directors = [d.strip() for d in re.split(r",\s*", r["dirs"]) if d.strip()] if r["dirs"] else []
    film = {"title": r["title"], "section": section, "bfi": BFI.format(r["page"])}
    if r["prog"]: film["programme"] = r["prog"]
    if directors: film["directors"] = directors
    if r["cast"]: film["cast"] = r["cast"]
    if r["country"]: film["country"] = r["country"]
    if r["year"]: film["year"] = r["year"]
    if r["mins"]: film["runtime"] = r["mins"]

    bits = []
    if r["code"] == "GAMES":
        bits.append(f"A game in the festival's Games Lounge ({section}).")
    elif r["prog"]:
        bits.append(f"Short film in the programme {r['prog']}" + (f" ({section})." if section else "."))
    elif section:
        bits.append(f"{section}.")
    if directors:
        lead = "By" if r["code"] in ("GAMES", "IMMERSIVE") else "Directed by"
        bits.append(f"{lead} {', '.join(directors)}.")
    made = ", ".join(x for x in [" ".join(x for x in [r["country"], r["year"]] if x), f"{r['mins']} min" if r["mins"] else ""] if x)
    if made: bits.append(made + ".")
    if r["cast"]: bits.append(f"With {r['cast']}.")

    run = RUNS.get(r["page"])
    if run:
        start, end, venue, note = run
        bits.append(note)
        locs = [addr(venue)]
        screenings = []
    else:
        assert r["screenings"], r["title"]
        shows = r["screenings"]
        bits.append(("The programme screens " if r["prog"] else "Screens ") + "; ".join(fmt_show(s) for s in shows) + ".")
        start = shows[0]["start"]
        length = prog_mins.get(r["prog"]) if r["prog"] else r["mins"]
        last = datetime.fromisoformat(shows[-1]["start"]) + timedelta(minutes=(length or 100) + (10 if r["prog"] else 0))
        end = iso(last)
        seen = []
        for s in shows:
            if s["venue"] not in seen: seen.append(s["venue"])
        locs = [addr(v) for v in seen]
        screenings = shows
    bits.append("BFI London Film Festival 2026.")
    E.append(dict(slug=slug, name=r["title"], desc=" ".join(bits), start=start, end=end,
                  locs=locs, bfi=film["bfi"], film=film, screenings=screenings))

# ---- build
DT = re.compile(r"^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d+)?(Z|[+-]\d{2}:\d{2})$")
base_us = int(time.mktime(time.strptime("2026-10-07 13:00:00", "%Y-%m-%d %H:%M:%S"))) * 1_000_000
random.seed(2026_10_07)
clock = random.randrange(1024)

def entry(i, slug, category, rec, extra=None):
    for k in ("createdAt", "startsAt", "endsAt"):
        if k in rec: assert DT.match(rec[k]), (slug, k, rec[k])
    for k in ("startsAt", "endsAt"):
        if k in rec: assert rec[k].endswith("+01:00"), ("London is BST all festival", slug, rec[k])
    assert rec["endsAt"] > rec["startsAt"], slug
    assert len(rec["description"]) <= 3000 and len(rec["name"]) <= 300, slug
    rk = tid(base_us + i * 1000, clock)
    e = {"slug": slug, "category": category, "rkey": rk, "atUri": f"at://{REPO}/{COLL}/{rk}",
         "sources": ["https://whatson.bfi.org.uk/lff/Online/default.asp?BOparam::WScontent::loadArticle::permalink=films-az"],
         "record": rec}
    if extra: e.update(extra)
    return e

out = [entry(0, "bfi-london-film-festival-2026", "umbrella", {
    "$type": COLL, "name": "BFI London Film Festival 2026",
    "description": "The 70th BFI London Film Festival, 7–18 October 2026, at cinemas across London. Umbrella record: each film in this collection's festival listing is its own record.",
    "createdAt": CREATED, "startsAt": "2026-10-07T00:00:00+01:00", "endsAt": "2026-10-18T23:59:00+01:00",
    "mode": INPERSON, "status": SCHEDULED,
    "uris": [{"uri": "https://www.bfi.org.uk/london-film-festival", "name": "BFI London Film Festival"}],
}, {"notes": "Unofficial umbrella record; not published by the BFI."})]

for i, e in enumerate(E, start=1):
    rec = {"$type": COLL, "name": e["name"], "description": e["desc"], "createdAt": CREATED,
           "startsAt": e["start"], "endsAt": e["end"], "mode": INPERSON, "status": SCHEDULED,
           "locations": e["locs"],
           "uris": [{"uri": e["bfi"], "name": "BFI London Film Festival"}]}
    extra = {"film": e["film"]}
    if e["screenings"]: extra["screenings"] = e["screenings"]
    out.append(entry(i, e["slug"], "film", rec, extra))

assert len({o["slug"] for o in out}) == len(out)
assert len({o["rkey"] for o in out}) == len(out)

# Keep what publishing learned (see build_frieze_events.py).
did = None
if OUT.exists():
    prev = json.loads(OUT.read_text(encoding="utf-8"))
    did = prev.get("meta", {}).get("did")
    old = {e["rkey"]: e for e in prev.get("records", [])}
    for o in out:
        p = old.get(o["rkey"])
        if p and str(p.get("atUri", "")).startswith("at://did:"):
            o["atUri"] = p["atUri"]
            if p.get("cid") and p.get("record") == o["record"]:
                o["cid"] = p["cid"]
else:
    frieze = OUT.parents[1] / "frieze-week-london" / "events.json"
    if frieze.exists():
        did = json.loads(frieze.read_text(encoding="utf-8")).get("meta", {}).get("did")
if did:
    for o in out:
        if not o["atUri"].startswith("at://did:"):
            o["atUri"] = f"at://{did}/{COLL}/{o['rkey']}"

doc = {
  "meta": {
    "title": "BFI London Film Festival 2026 — CultureBlocs event dataset",
    "name": "London Film Festival 2026",
    "directory": "london-film-festival",
    "tag": "lff-2026",
    "short": "lff",   # printed QR cards: cultureblocs.com/w/lff/<slug>
    "tz": "Europe/London",
    "layout": "films",
    "verb": {"button": "I saw", "past": "saw"},
    "cardLine": "Every film in the festival, A–Z or day by day",
    "repo": REPO,
    "collection": COLL,
    "lexicon": "https://github.com/lexicon-community/lexicon/blob/main/community/lexicon/calendar/event.json",
    "generated": "2026-10-07",
    "status": "draft — review before publishing",
    "howToUse": "Publish each entry's `record` with com.atproto.repo.putRecord (repo=cultureblocs.com, collection, rkey). Everything outside `record` — `film`, `screenings`, `sources` — is sidecar metadata for the site and is not published.",
    "shape": "One record per entry on the festival's Films A–Z, not per screening: it runs from the first screening to the end of the last and names each venue. A short's record carries its programme's screenings. Games and immersive works run all festival.",
    "timezone": "Times are Europe/London, BST (+01:00) throughout 7–18 October 2026.",
    "checked": "Titles, credits, strands and screenings read from the BFI's own festival pages on 7 October 2026 (tools/events/lff_2026_source.txt). Synopses are not reproduced; each record links to its BFI page for those and for tickets.",
    "unofficial": "Independent listing by CultureBlocs; not affiliated with or endorsed by the BFI.",
    "count": len(out),
    **({"did": did} if did else {}),
  },
  "records": out,
}
OUT.parent.mkdir(parents=True, exist_ok=True)
with open(OUT, "w", encoding="utf-8") as f:
    json.dump(doc, f, ensure_ascii=False, indent=2)
print(len(out), "records ->", OUT)
from collections import Counter
print(Counter(o["record"]["locations"][0]["name"].split(",")[0] for o in out if "locations" in o["record"]).most_common(4))
print(sum(len(o.get("screenings", [])) for o in out), "screenings across films")
