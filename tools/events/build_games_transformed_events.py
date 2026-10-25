"""Build Games Transformed Festival 2026 event records for the cultureblocs.com repo.

Same shape as build_peckham_events.py: each entry = sidecar metadata (slug,
category, sources, notes) + a schema-pure `record` for
community.lexicon.calendar.event. Publishers send only `record`. rkeys are
pre-generated TIDs so at:// URIs are known before publishing.

Source: the festival's Ticket Tailor page,
https://www.tickettailor.com/events/gamestransformed/2328476, read on
25 October 2026. Its programme — every panel, workshop, game session, film,
performance and playable game, by day — is saved in
tools/events/games_transformed_2026_source.txt and read from there, so the
titles are the organisers' own, character for character. Festival hours,
venues, the Friday symposium, the costume competition, the youth and families
programme and the motherlode afterparty come from the same page's text;
ticket types and prices from its checkout.

The page gives no times, rooms or speakers for individual sessions. Each
session is a date-only record (startsAt at 00:00, no endsAt), which the site
shows as "Time tbc"; the playable games run from Saturday opening to Sunday
close. When the festival publishes a timetable, edit the records and
republish — the site reads the published copy first.

Venues: Proposition Studios and Three Colts Tavern from venue listings (two
sources each agree), Pelican House's postcode from its own box office. The
festival doesn't say which session is in which venue, so every record names
all three, led by a combined "one of the three" entry for display.

Times are Europe/London, GMT (+00:00): the clocks went back on 25 October,
before the festival.
"""
import json, re, time, random
from pathlib import Path
from datetime import datetime

ROOT = Path(__file__).resolve().parents[2]
OUT = ROOT / "events" / "games-transformed" / "events.json"
SRC = Path(__file__).with_name("games_transformed_2026_source.txt")

COLL = "community.lexicon.calendar.event"
INPERSON = f"{COLL}#inperson"
SCHEDULED = f"{COLL}#scheduled"
CREATED = "2026-10-25T19:30:00.000Z"
REPO = "cultureblocs.com"

B32 = "234567abcdefghijklmnopqrstuvwxyz"
def tid(us, clock):
    n = (us << 10) | clock
    s = ""
    for _ in range(13):
        s = B32[n & 31] + s
        n >>= 5
    return s

def addr(name, street=None, postal=None, locality="London"):
    a = {"$type": "community.lexicon.location.address", "country": "GB",
         "locality": locality, "name": name}
    if street: a["street"] = street
    if postal: a["postalCode"] = postal
    return a

# Venues
ANY = addr("Proposition, Pelican House or Three Colts Tavern, Bethnal Green",
           "Cambridge Heath Road")
PROPOSITION = addr("Proposition Studios", "279 Cambridge Heath Road", "E2 0EL")
PELICAN = addr("Pelican House", None, "E1 5QJ")
COLTS = addr("Three Colts Tavern", "199 Cambridge Heath Road", "E2 0EL")
VENUES = [ANY, PROPOSITION, PELICAN, COLTS]

TT = "https://www.tickettailor.com/events/gamestransformed/2328476"
BOX = "https://www.tickettailor.com/events/gamestransformed"
RVAL = "https://reimaginingvalue.ca/borders/"
TICKETS = {"uri": TT, "name": "Programme and tickets"}

GMT = "+00:00"
def at(day, hm):
    return f"2026-{day}T{hm}:00{GMT}"
FRI, SAT, SUN = "10-30", "10-31", "11-01"

DAY_PASS = {
    SAT: "Covered by the Saturday day pass or a weekend pass.",
    SUN: "Covered by the Sunday day pass or a weekend pass.",
}
DAY_NAME = {SAT: "Saturday 31 October", SUN: "Sunday 1 November"}
TBC = ("The festival hasn't published a time, room or speakers for its "
       "sessions yet.")

# Programme formats as the page marks them -> (category, how we describe it).
FORMATS = {
    "Panel": ("panel", "A panel"),
    "Workshop": ("workshop", "A workshop"),
    "Worksho": ("workshop", "A workshop"),        # the page's own truncation
    "Game session": ("game-session", "A game session"),
    "Film": ("screening", "A film"),
    "Performance": ("performance", "A performance"),
    "Videogame": ("videogame", "A videogame"),
    "Analogue game": ("analogue-game", "An analogue game"),
}
SECTION_DAY = {
    "Saturday 31st October": SAT,
    "Sunday 1st November": SUN,
    "Games to play on both Saturday and Sunday": "both",
}

def slugify(title, taken):
    s = title.lower().replace("&", " and ").replace("'", "").replace("’", "")
    s = re.sub(r"[^a-z0-9]+", "-", s).strip("-")
    if len(s) > 60:
        s = s[:60].rsplit("-", 1)[0]
    base, n = s, 2
    while s in taken:
        s, n = f"{base}-{n}", n + 1
    taken.add(s)
    return s

def read_source():
    rows = []
    for line in SRC.read_text(encoding="utf-8").splitlines():
        if not line.strip() or line.startswith("#"):
            continue
        section, fmt, title = line.split("\t")
        fmt = re.sub(r"^\W+", "", fmt).strip()   # drop the emoji marker
        assert fmt in FORMATS, fmt
        assert section in SECTION_DAY, section
        rows.append((SECTION_DAY[section], fmt, re.sub(r"\s+", " ", title).strip()))
    return rows

E = []
taken = set()
def ev(slug, cat, name, desc, start, end, notes=None, extra=()):
    taken.add(slug)
    E.append(dict(slug=slug, cat=cat, name=name, desc=desc, start=start, end=end,
                  uris=[TICKETS, *[{"uri": u, "name": n} for u, n in extra]],
                  notes=notes))

# ---- Umbrella
ev("games-transformed-2026", "umbrella", "Games Transformed Festival 2026",
   "A festival of games and radical politics in Bethnal Green, East London, run by "
   "the volunteer-led Games Transformed. The 2026 theme, Here to Stay, Here to Play, "
   "echoes the 1970s East London anti-racist slogan Here to Stay, Here to Fight: "
   "racial and migrant justice as one struggle, and games as a way to resist. Over "
   "80 games, plus panels, workshops, performance, a youth and families programme "
   "and the motherlode afterparty, across Proposition Studios, Pelican House and "
   "Three Colts Tavern. Friday 18:30–23:00, Saturday 10:00–18:30 (afterparty from "
   "20:00), Sunday 10:00–19:30. Weekend and day passes; the Friday social and the "
   "afterparty are ticketed separately. Free or discounted solidarity tickets are "
   "available by email. Umbrella record: the events in this collection reference "
   "the same festival.",
   at(FRI, "18:30"), at(SUN, "19:30"),
   notes="Unofficial umbrella record; not published by Games Transformed. The box "
         "office header gives Fri 18:00 – Sun 19:30; the page's own When? section "
         "says Friday 18:30, which we use.",
   extra=[(BOX, "Games Transformed box office")])

# ---- Friday 30
ev("games-against-borders", "talk",
   "Games Against Borders symposium and evening social",
   "The festival opens with the ReImagining Value Action Lab's Games Against Borders "
   "symposium, then a relaxed social evening of games and a chance to meet other "
   "players and organisers. Ticketed separately as the Friday evening social: "
   "£5 + £1 booking fee.",
   at(FRI, "18:30"), at(FRI, "23:00"),
   notes="The page's When? section gives Friday 18:30–23:00; the ticket is named "
         "'Evening Social from 6pm'. Venue not stated.",
   extra=[(RVAL, "ReImagining Value Action Lab")])

# ---- Saturday 31: the night and things that run across it
ev("monstreous-costume-competition", "party",
   "MONSTREOUS Costume and Cosplay Competition",
   "The Halloween costume theme is monsters — monstrosity as political, the label "
   "pinned on those who challenge the established order. Prizes, including free "
   "games and festival tickets, for the most MONSTREOUS outfits across Saturday's "
   "day and night programme.",
   at(SAT, "10:00"), None,
   notes="Runs across Saturday's day and night programme; no judging time given.")
ev("motherlode-afterparty", "party", "motherlode afterparty",
   "The Games Transformed afterparty takes over all three venues from 8pm till late: "
   "DJs including Bledi, Dance Against Deportations and Nachtlicker, live coding, "
   "shibari performance, cross-venue quests, an immersive chill space, games and "
   "the costume competition. Not included in day or weekend passes: party ticket "
   "£12 + £1 booking fee.",
   at(SAT, "20:00"), None,
   notes="The page says 8pm (twice); the ticket is named 'from 7pm'. We use 20:00. "
         "Ends 'till late', so no endsAt.")

# ---- Youth and families
ev("what-a-state", "family", "What a State!?",
   "The youth and families programme, for ages 8 and up (8–88, younger children "
   "welcome to join in): an immersive world of absurd challenges and bureaucracy, "
   "built around a Very Completely Official British Citizenship Test. Saturday and "
   "Sunday. Under-16 day tickets £15 + £1 booking fee; a crèche run with Nanny "
   "Solidarity Network is available — tell the festival in advance.",
   at(SAT, "10:00"), at(SUN, "19:30"),
   notes="The page says the youth and families programme runs all day on both days; "
         "we give it festival hours.")

# ---- The programme, from the source file
for day, fmt, title in read_source():
    cat, kind = FORMATS[fmt]
    slug = slugify(title, taken)
    taken.discard(slug)            # ev() re-adds it
    if day == "both":
        desc = (f"{kind}, on the festival floor to play on Saturday and Sunday, "
                "31 October – 1 November. Covered by a day pass or a weekend pass.")
        ev(slug, cat, title, desc, at(SAT, "10:00"), at(SUN, "19:30"),
           notes="Playable throughout festival hours both days; the page doesn't say "
                 "which venue.")
    else:
        desc = f"{kind} at Games Transformed 2026, {DAY_NAME[day]}. {TBC} {DAY_PASS[day]}"
        ev(slug, cat, title, desc, f"2026-{day}T00:00:00{GMT}", None)

# ---- Build
DT = re.compile(r"^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d+)?(Z|[+-]\d{2}:\d{2})$")

base_us = int(time.mktime(time.strptime("2026-10-25 19:30:00", "%Y-%m-%d %H:%M:%S"))) * 1_000_000
random.seed(2026_10_30)
clock = random.randrange(1024)

out = []
for i, e in enumerate(E):
    rec = {"$type": COLL, "name": e["name"], "description": e["desc"], "createdAt": CREATED,
           "startsAt": e["start"], "mode": INPERSON, "status": SCHEDULED}
    if e["end"]: rec["endsAt"] = e["end"]
    rec["locations"] = VENUES
    rec["uris"] = e["uris"]
    for k in ("createdAt", "startsAt", "endsAt"):
        if k in rec: assert DT.match(rec[k]), (e["slug"], k, rec[k])
    for k in ("startsAt", "endsAt"):
        if k in rec: assert rec[k].endswith(GMT), ("not GMT", e["slug"], k)
    if "endsAt" in rec:
        assert datetime.fromisoformat(rec["endsAt"]) > datetime.fromisoformat(rec["startsAt"]), e["slug"]
    assert len(rec["description"]) <= 3000 and len(rec["name"]) <= 300, e["slug"]
    rk = tid(base_us + i * 1000, clock)
    entry = {"slug": e["slug"], "category": e["cat"], "rkey": rk,
             "atUri": f"at://{REPO}/{COLL}/{rk}",
             "sources": [TT],
             "record": rec}
    if e["notes"]: entry["notes"] = e["notes"]
    out.append(entry)

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
    # Same publisher as Frieze Week: borrow its DID so URIs are DID-based.
    frieze = OUT.parents[1] / "frieze-week-london" / "events.json"
    if frieze.exists():
        did = json.loads(frieze.read_text(encoding="utf-8")).get("meta", {}).get("did")
if did:
    for o in out:
        if not o["atUri"].startswith("at://did:"):
            o["atUri"] = f"at://{did}/{COLL}/{o['rkey']}"

n_prog = sum(1 for o in out if o["category"] not in ("umbrella",))
doc = {
  "meta": {
    "title": "Games Transformed Festival 2026 — CultureBlocs event dataset",
    "name": "Games Transformed 2026",
    "directory": "games-transformed",
    "tag": "games-transformed-2026",
    "short": "gt",   # printed QR cards: cultureblocs.com/w/gt/<rkey> (redirect in vercel.json)
    "tz": "Europe/London",
    "cardLine": "Panels, workshops, performance and 36 games to play, day by day",
    "repo": REPO,
    "collection": COLL,
    "lexicon": "https://github.com/lexicon-community/lexicon/blob/main/community/lexicon/calendar/event.json",
    "generated": "2026-10-25",
    "status": "draft — review flagged notes before publishing",
    "howToUse": "Publish each entry's `record` with com.atproto.repo.putRecord (repo=cultureblocs.com, collection, rkey). Everything outside `record` is sidecar metadata for the site and is not published.",
    "timezone": "Times are Europe/London, GMT (+00:00) throughout: the clocks went back on 25 October 2026, before the festival.",
    "checked": "Every programme item read from the festival's Ticket Tailor page on 25 October 2026 (tools/events/games_transformed_2026_source.txt). Venue addresses from venue listings and Pelican House's own box office.",
    "timesTbc": "The festival gives no times, rooms or speakers for individual sessions. Sessions are date-only (startsAt 00:00, no endsAt) and show as 'Time tbc'; games run from Saturday 10:00 to Sunday 19:30. Update and republish when a timetable appears.",
    "prices": "From the box office checkout on 25 October 2026, plus booking fees: weekend pass £45 standard / £55 final release; Saturday or Sunday day pass £25; under-16 day ticket £15; Friday evening social £5; motherlode party £12 (not in day or weekend passes). Solidarity tickets on request.",
    "omitted": "Nothing in the programme is left out. Descriptions are our own short summaries; the organisers' copy stays on their page.",
    "unofficial": "Independent listing by CultureBlocs; not affiliated with or endorsed by Games Transformed or any listed game, maker or venue.",
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
print(Counter(o["category"] for o in out))
print(sum(1 for o in out if "notes" in o), "with notes")
