"""Build the Serpentine Galleries programme as event records for the cultureblocs.com repo.

A gallery is a third shape, after an art week and a film festival: a few long
exhibitions and park commissions that run for months, with talks and
performances dotted through them. meta.layout "gallery" draws it as On now /
Opening soon / Talks and events / Recently (events/lib/gallery.js), and the
page lives at /gallery/london/serpentine/ rather than under /events/ — it is
unlisted, reached by link only. The data still sits in events/serpentine-galleries/
so "I went", My week, the event pages and the publish tooling work unchanged.

Each entry = sidecar metadata + a schema-pure `record`
(community.lexicon.calendar.event). Publishers send only `record`. The sidecar
carries what a bead-minting app needs to make a bead that already knows where
it is and what it's about: the venue (address + coordinates, from meta.venues),
the exhibition a talk belongs to (`about`), the people involved, and the bead
kind to suggest. That is the "connective data" — it should really come from
the gallery itself; this file is a worked example of what it would publish.

Times are Europe/London: BST (+01:00) until 02:00 on Sunday 25 October 2026,
GMT (+00:00) after — so the Pavilion's and Soto's last day (25 Oct) is +00:00.
Exhibitions run 10:00 on the first day to 18:00 on the last (gallery hours).

Checked against serpentinegalleries.org on 7 October 2026.
"""
import json, re, time, random
from datetime import datetime, timezone
from pathlib import Path

OUT = Path(__file__).resolve().parents[2] / "events" / "serpentine-galleries" / "events.json"

COLL = "community.lexicon.calendar.event"
INPERSON = f"{COLL}#inperson"
SCHEDULED = f"{COLL}#scheduled"
CREATED = "2026-10-07T22:00:00.000Z"
REPO = "cultureblocs.com"
SITE = "https://www.serpentinegalleries.org"
TICKETS = "https://serpentinegalleries.ticketing.veevartapp.com/tickets/view/list"

B32 = "234567abcdefghijklmnopqrstuvwxyz"
def tid(us, clock):
    n = (us << 10) | clock
    s = ""
    for _ in range(13):
        s = B32[n & 31] + s
        n >>= 5
    return s

# ---- Venues: one organisation, three spaces in Kensington Gardens.
# Coordinates: Serpentine South from the Historic England listing (via British
# Listed Buildings); Serpentine North from a public place guide. The Pavilion
# stands on Serpentine South's lawn, so it takes South's point at 100 m.
VENUES = {
  "south": {
    "name": "Serpentine South", "street": "Kensington Gardens", "postalCode": "W2 3XA",
    "lat": "51.504691", "lng": "-0.175012", "precision": "exact",
    "hours": "Tue–Sun 10:00–18:00 (reopens 8 October 2026 after installation)",
  },
  "north": {
    "name": "Serpentine North", "street": "West Carriage Drive, Kensington Gardens", "postalCode": "W2 2AR",
    "lat": "51.507065", "lng": "-0.171279", "precision": "exact",
    "hours": "Tue–Sun 10:00–18:00",
  },
  "pavilion": {
    "name": "Serpentine Pavilion", "street": "Kensington Gardens (lawn of Serpentine South)", "postalCode": "W2 3XA",
    "lat": "51.504691", "lng": "-0.175012", "precision": "100m",
    "hours": "Daily 10:00–18:00 until 25 October 2026",
  },
}

def where(v):
    x = VENUES[v]
    return [
      {"$type": "community.lexicon.location.address", "country": "GB", "locality": "London",
       "name": x["name"], "street": x["street"], "postalCode": x["postalCode"]},
      {"$type": "community.lexicon.location.geo", "name": x["name"],
       "latitude": x["lat"], "longitude": x["lng"]},
    ]

def uri(u, name):
    return {"uri": u, "name": name}

# Bead kinds as the composer offers them (went/lib/compose.js KINDS).
KIND = {"exhibition": "visit", "commission": "visit", "talk": "performance", "performance": "performance"}

E = []
def ev(slug, cat, name, desc, start, end, venue, page, *, people=(), about=None, book=None, price=None, notes=None):
    uris = [uri(f"{SITE}/whats-on/{page}/", "Serpentine")]
    if book: uris.append(uri(book, "Book (free)" if price == "Free" else "Book"))
    E.append(dict(slug=slug, cat=cat, name=name, desc=desc, start=start, end=end, venue=venue,
                  uris=uris, people=list(people), about=about, price=price, notes=notes,
                  src=f"{SITE}/whats-on/{page}/"))

# ---- Exhibitions
ev("amar-kanwar", "exhibition", "Amar Kanwar",
   "A major solo exhibition by the New Delhi-based artist and filmmaker, staged as a single site-specific "
   "installation of new and earlier films that turns Serpentine North into a slow, dark, meditative space. "
   "Kanwar's films, made over three decades, move between documentary, travelogue and visual essay and "
   "return to the after-lives of decolonisation and the 1947 Partition. Includes Such a Morning (2017), "
   "The Peacock's Graveyard (2023) and The Charcoal Man (2026), a new seven-screen work premiering here — "
   "about three hours of film in all, to watch whole or wander through. Very low light, with moments of "
   "full darkness. Free; booking advised. Tue–Sun 10:00–18:00.",
   "2026-09-23T10:00:00+01:00", "2027-01-31T18:00:00+00:00", "north", "amar-kanwar-exhibition",
   people=[("Amar Kanwar", "artist"), ("Chris Bayley", "curator"), ("Kit Gurnos", "assistant curator")],
   book=TICKETS, price="Free")

ev("justin-caguiat-change-ringing", "exhibition", "Justin Caguiat: Change Ringing",
   "Justin Caguiat's first major UK exhibition: a site-responsive installation across painting, sculpture, "
   "printmaking, sound and film. New thermochromic paintings shift with heat and light; bronze bells cast "
   "as flowers and seeds ring in changing sequences to a score by Lily Pickett drawn from English change "
   "ringing, with the gallery walls gathering and carrying the sound. Free; booking advised.",
   "2026-10-08T10:00:00+01:00", "2027-01-10T18:00:00+00:00", "south", "justin-caguiat-change-ringing",
   people=[("Justin Caguiat", "artist"), ("Lily Pickett", "composer"), ("Hans Ulrich Obrist", "curator"),
           ("Natalia Grabowska", "curator"), ("Alexa Chow", "assistant curator")],
   book=f"{TICKETS}/justin-caguiat-exhibition", price="Free",
   notes="Serpentine South gallery hours aren't printed on the exhibition page; assumed Tue–Sun 10:00–18:00 like Serpentine North.")

# ---- In the park
ev("serpentine-pavilion-2026-lanza-atelier", "commission", "Serpentine Pavilion 2026: a serpentine, by LANZA atelier",
   "This year's Pavilion, by Mexico City studio LANZA atelier (Isabel Abascal and Alessandro "
   "Arienzo). A curving brick crinkle-crankle wall forms its south side, nodding to English garden walls, "
   "the brick of Serpentine South and the nearby lake; brick columns like a grove of trees hold up a "
   "translucent roof. Free, daily 10:00–18:00 (closing 17:00 on 7 October). Last days.",
   "2026-06-06T10:00:00+01:00", "2026-10-25T18:00:00+00:00", "pavilion",
   "serpentine-pavilion-2026-by-isabel-abascal-and-alessandro-arienzo-lanza-atelier",
   people=[("LANZA atelier", "architect"), ("Isabel Abascal", "architect"), ("Alessandro Arienzo", "architect")],
   price="Free")

ev("jesus-rafael-soto-penetrable-bbl-jaune", "commission", "Jesús Rafael Soto: Pénétrable BBL Jaune",
   "A walk-through sculpture in Kensington Gardens beside Serpentine South: some 4,000 hanging yellow PVC "
   "tubes on a 10-metre steel frame, finished by the movement and touch of the people passing through it. "
   "Soto (1923–2005) began the Pénétrable series in 1967; this is a 2023 edition of a 1999 work. Free.",
   "2026-06-16T10:00:00+01:00", "2026-10-25T18:00:00+00:00", "south", "jesus-rafael-soto-penetrable-bbl-jaune",
   people=[("Jesús Rafael Soto", "artist"), ("Lizzie Carey-Thomas", "curator"), ("Alexa Chow", "curator")],
   price="Free",
   notes="Outdoor work; the page gives no hours of its own — the record uses gallery hours.")

# ---- Talks and live events
ev("saturday-talk-alexa-chow-caguiat", "talk", "Saturday Talks: Alexa Chow on Justin Caguiat: Change Ringing",
   "A tour of Justin Caguiat: Change Ringing led by Assistant Exhibitions Curator Alexa Chow, on the "
   "exhibition's opening weekend. Free; booking advised. BSL interpretation on request.",
   "2026-10-10T11:00:00+01:00", None, "south", "saturday-talks-alexa-chow-on-justin-caguiat-change-ringing",
   people=[("Alexa Chow", "speaker")], about="justin-caguiat-change-ringing",
   book=f"{TICKETS}/saturday-talks-alexa-chow-on-justin-caguiat-exhibition", price="Free")

ev("saturday-talk-liz-stumpf-pavilion", "talk", "Saturday Talks: Liz Stumpf on LANZA atelier's 2026 Serpentine Pavilion",
   "Assistant Exhibitions Curator Liz Stumpf leads a tour of the Pavilion — what inspired it, how LANZA "
   "atelier works, and the history of the commission. Free; booking advised. BSL interpretation on request.",
   "2026-10-10T12:00:00+01:00", None, "pavilion", "saturday-talks-liz-stumpf-on-lanza-ateliers-2026-serpentine-pavilion-2",
   people=[("Liz Stumpf", "speaker")], about="serpentine-pavilion-2026-lanza-atelier",
   book=f"{TICKETS}/saturday-talks-liz-stumpf-on-lanza-ateliers-pavilion-2", price="Free")

ev("saturday-talk-chris-bayley-kanwar", "talk", "Saturday Talks: Chris Bayley on Amar Kanwar",
   "Exhibitions Curator Chris Bayley introduces Amar Kanwar and the installation at Serpentine North. "
   "Free; booking advised. BSL interpretation on request.",
   "2026-10-31T12:30:00+00:00", None, "north", "saturday-talks-chris-bayley-on-amar-kanwar",
   people=[("Chris Bayley", "speaker")], about="amar-kanwar",
   book=f"{TICKETS}/saturday-talks-chris-bayley-on-amar-kanwar-exhibition", price="Free")

ev("saturday-talk-natalia-grabowska-caguiat", "talk", "Saturday Talks: Natalia Grabowska on Justin Caguiat: Change Ringing",
   "Curator at Large Natalia Grabowska leads a tour of Justin Caguiat: Change Ringing. Free; booking "
   "advised. BSL interpretation on request.",
   "2026-11-14T12:00:00+00:00", None, "south", "saturday-talks-natalia-grabowska-on-justin-caguiat-change-ringing",
   people=[("Natalia Grabowska", "speaker")], about="justin-caguiat-change-ringing",
   book=f"{TICKETS}/saturday-talks-natalia-grabowska-on-justin-caguiat-exhibition", price="Free")

PN = ("hideandseek: an evening of improvised voice and strings in the Pavilion — the UK debut of New York-based "
      "artist, writer and musician Shala Miller, with experimental cellist Dorothy Carlos and Samantha Feliciano, "
      "in a new Park Nights commission made to resonate through LANZA atelier's building. £10, £7 concessions.")
for d in ("02", "03"):
    ev(f"park-nights-2026-shala-miller-{d}-oct", "performance", "Park Nights 2026: Shala Miller — hideandseek",
       PN, f"2026-10-{d}T20:00:00+01:00", None, "pavilion", "park-nights-2026-shala-miller",
       people=[("Shala Miller", "artist"), ("Dorothy Carlos", "performer"), ("Samantha Feliciano", "performer")],
       about="serpentine-pavilion-2026-lanza-atelier", book=TICKETS, price="£10 / £7",
       notes="Two nights, one record each, so a bead can point at the night you were there. No end time given.")

# ---- Build
DT = re.compile(r"^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d+)?(Z|[+-]\d{2}:\d{2})$")
SWITCH = datetime(2026, 10, 25, 1, 0, tzinfo=timezone.utc)   # BST ends 02:00 BST = 01:00 UTC
def offset_ok(iso):
    d = datetime.fromisoformat(iso)
    return iso.endswith("+01:00" if d.astimezone(timezone.utc) < SWITCH else "+00:00")

base_us = int(time.mktime(time.strptime("2026-10-07 23:00:00", "%Y-%m-%d %H:%M:%S"))) * 1_000_000
random.seed(2026_10_08)
clock = random.randrange(1024)
slugs = {e["slug"] for e in E}

out = []
for i, e in enumerate(E):
    rec = {"$type": COLL, "name": e["name"], "description": e["desc"], "createdAt": CREATED,
           "startsAt": e["start"], "mode": INPERSON, "status": SCHEDULED}
    if e["end"]: rec["endsAt"] = e["end"]
    rec["locations"] = where(e["venue"])
    rec["uris"] = e["uris"]
    for k in ("startsAt", "endsAt"):
        if k in rec:
            assert DT.match(rec[k]), (e["slug"], k)
            assert offset_ok(rec[k]), ("wrong London offset", e["slug"], k, rec[k])
    if "endsAt" in rec: assert rec["endsAt"] > rec["startsAt"], e["slug"]
    assert len(rec["description"]) <= 3000 and len(rec["name"]) <= 300, e["slug"]
    assert e["about"] is None or e["about"] in slugs, e["slug"]
    rk = tid(base_us + i * 1000, clock)
    entry = {"slug": e["slug"], "category": e["cat"], "rkey": rk,
             "atUri": f"at://{REPO}/{COLL}/{rk}",
             "venue": e["venue"],
             "beadKind": KIND[e["cat"]],
             "people": [{"name": n, "role": r} for n, r in e["people"]],
             "sources": [e["src"]], "record": rec}
    if e["about"]: entry["about"] = e["about"]
    if e["price"]: entry["price"] = e["price"]
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
    frieze = OUT.parents[1] / "frieze-week-london" / "events.json"
    if frieze.exists():
        did = json.loads(frieze.read_text(encoding="utf-8")).get("meta", {}).get("did")
if did:
    for o in out:
        if not o["atUri"].startswith("at://did:"):
            o["atUri"] = f"at://{did}/{COLL}/{o['rkey']}"

venues = {k: {"name": v["name"], "address": f'{v["street"]}, London {v["postalCode"]}',
              "geo": {"lat": float(v["lat"]), "lng": float(v["lng"]), "precision": v["precision"]},
              "hours": v["hours"]} for k, v in VENUES.items()}

doc = {
  "meta": {
    "title": "Serpentine Galleries, London — CultureBlocs event dataset",
    "name": "Serpentine Galleries",
    "directory": "serpentine-galleries",
    "home": "/gallery/london/serpentine/",
    "layout": "gallery",
    "tag": "serpentine-galleries",
    "short": "srp",   # printed QR cards: cultureblocs.com/w/srp/<rkey> (redirect in vercel.json)
    "tz": "Europe/London",
    "cardLine": "Exhibitions, the Pavilion, talks and Park Nights",
    "repo": REPO,
    "collection": COLL,
    "lexicon": "https://github.com/lexicon-community/lexicon/blob/main/community/lexicon/calendar/event.json",
    "generated": "2026-10-07",
    "status": "draft — review flagged notes before publishing",
    "howToUse": "Publish each entry's `record` with com.atproto.repo.putRecord (repo=cultureblocs.com, collection, rkey). Everything outside `record` is sidecar metadata for the site and for bead-minting apps, and is not published.",
    "forMinting": "A minting app can take, per entry: the event's atUri (+cid once published) as the bead's subject; venues[entry.venue].geo as the bead's place (fuzz before publishing, as the bead lexicon requires); beadKind as the suggested kind; `about` to link a talk to its exhibition; and `people` as candidate refs.",
    "timezone": "Times are Europe/London; BST (+01:00) until 02:00 on 25 Oct 2026, GMT (+00:00) after — the Pavilion's and Soto's last day, 25 October, is +00:00. Exhibitions run 10:00 on their first day to 18:00 on their last.",
    "checked": "Checked against serpentinegalleries.org on 7 October 2026. Entries with `notes` have open questions.",
    "omitted": "Ongoing projects without dates (Serpentine Podcast, Future Art Ecosystems, Legal Lab, Changing Play, the fellowships, the How We Hold book) and Danielle Brathwaite-Shirley's online game I DIDNT REALISE YOU THOUGHT LIKE THAT (THE DELUSION) — these are works to read, listen to or play, not dated events, and belong in a bead's refs rather than as calendar records. The Pavilion architects' talk (5 June) is past.",
    "unofficial": "Independent listing by CultureBlocs, made as a demonstration; not affiliated with or endorsed by Serpentine. The aim is for a venue to publish these records from its own account.",
    "venues": venues,
    "venueProfile": {
      "_about": "What Serpentine could publish once from its own account (rkey self) so that its events, and beads about them, have an organisation to point at.",
      "$type": "com.cultureblocs.venue.profile",
      "name": "Serpentine",
      "description": "Two galleries and an annual architecture Pavilion in Kensington Gardens, London. Free to visit.",
      "location": {"$type": "community.lexicon.location.address", "country": "GB", "locality": "London",
                   "name": "Serpentine", "street": "Kensington Gardens", "postalCode": "W2 3XA"},
      "accessibility": "The galleries have full disability access and facilities. Saturday Talks offer BSL interpretation on request.",
      "links": [{"uri": SITE, "title": "Serpentine"},
                {"uri": f"{SITE}/whats-on/", "title": "What's on"},
                {"uri": TICKETS, "title": "Tickets"}],
      "createdAt": CREATED,
    },
    "count": len(out),
    **({"did": did} if did else {}),
  },
  "records": out,
}
OUT.parent.mkdir(parents=True, exist_ok=True)
with open(OUT, "w", encoding="utf-8") as f:
    json.dump(doc, f, ensure_ascii=False, indent=2)
print(len(out), "records ->", OUT)
