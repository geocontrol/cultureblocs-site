"""Build the Creative Spaces Symposium 2026 event record for the cultureblocs.com repo.

Creative Newham's symposium (Tue 3 Nov 2026, English National Ballet, London
City Island) as one community.lexicon.calendar.event record in @cultureblocs.com,
so the Creative Newham journey (/start/creative-newham/) can write an "I was
there" bead that points at it, exactly as "I went" does for other directories.

An unlisted directory, like the meetups: meta.home is the journey, so it is not
on /events/, and /events/creative-newham-symposium/ redirects there.
Short link: cultureblocs.com/w/cn/<slug>  →  the I went composer.

`programme` beside the record is site-only (not published): the journey shows
the sessions as chips people can tap to mention in their note.

Ideally Creative Newham would publish this record from its own account; until
then it is an example in ours. Rerunning keeps the rkey, so the URI never changes.

Source: https://www.creativenewham.com/creative-newham-symposium-2026
(read 3 Nov 2026; the page says the programme is subject to change).
"""
import json, re
from datetime import datetime
from pathlib import Path

OUT = Path(__file__).resolve().parents[2] / "events" / "creative-newham-symposium" / "events.json"

COLL = "community.lexicon.calendar.event"
REPO = "cultureblocs.com"
SOURCE = "https://www.creativenewham.com/creative-newham-symposium-2026"
JOURNEY = "https://www.cultureblocs.com/start/creative-newham/"

B32 = "234567abcdefghijklmnopqrstuvwxyz"
def tid(us, clock=0):
    n = (us << 10) | clock
    s = ""
    for _ in range(13):
        s = B32[n & 31] + s
        n >>= 5
    return s

ENB = {"$type": "community.lexicon.location.address", "country": "GB", "locality": "London",
       "name": "English National Ballet, London City Island",
       "street": "Mulryan Centre for Dance, 41 Hopewell Square", "postalCode": "E14 0SY"}

# The day's sessions, in the page's own order. Rooms where the page names them.
PROGRAMME = [
    ("10:00", "Welcome and introduction", None),
    ("10:25", "Opening address", None),
    ("10:50", "Provocation", None),
    ("11:10", "Placemaking: Those Shaping Places", None),
    ("12:10", "Marketplace of Ideas", "Holloway Production Studio"),
    ("12:10", "Culture, Nature & the Public Realm", "Bickle Room"),
    ("14:00", "Spotlight: Who Is Occupying These Spaces?", None),
    ("14:10", "Unexpected Places: Rethinking the Public Realm", "Bickle Room"),
    ("14:10", "Authentic Co-Creation", "Holloway Production Studio"),
    ("14:50", "Creative Intervention", None),
    ("15:00", "Civic Involvement & Networks", "Bickle Room"),
    ("15:00", "Underground: Where Culture Begins", "Holloway Production Studio"),
    ("15:50", "Creative Hosted Huddles", None),
    ("16:15", "Artist Response, Reflections and Closing", None),
    ("all day", "Drop-in advice and 1:1 sessions", "Bickle Room"),
    ("all day", "Creative Digestion Space", "Wigoder Gallery"),
]

E = [dict(
    slug="2026",
    name="Creative Spaces Symposium 2026",
    desc=("Creative Newham's day on creative spaces in Newham: who shapes places and who gets a say, "
          "culture and the public realm, co-creation, civic networks and grassroots culture. Panels and "
          "provocations, a marketplace of ideas, drop-in advice and 1:1 sessions with funders and support "
          "organisations, and hosted huddles, building towards a Creative Spaces Charter for Newham. For "
          "artists, freelancers, producers, community groups, local government, developers, architects, "
          "researchers, funders and policymakers."),
    start="2026-11-03T09:30:00+00:00", end="2026-11-03T16:30:00+00:00",
    created="2026-11-03T16:30:00.000Z",
)]

DT = re.compile(r"^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d+)?(Z|[+-]\d{2}:\d{2})$")

prev = json.loads(OUT.read_text(encoding="utf-8")) if OUT.exists() else {}
old = {e["slug"]: e for e in prev.get("records", [])}
did = prev.get("meta", {}).get("did")
if not did:
    frieze = OUT.parents[1] / "frieze-week-london" / "events.json"
    if frieze.exists():
        did = json.loads(frieze.read_text(encoding="utf-8")).get("meta", {}).get("did")

out = []
for e in E:
    rec = {"$type": COLL, "name": e["name"], "description": e["desc"], "createdAt": e["created"],
           "startsAt": e["start"], "endsAt": e["end"],
           "mode": f"{COLL}#inperson", "status": f"{COLL}#scheduled",
           "locations": [ENB],
           "uris": [{"uri": SOURCE, "name": "Creative Newham"},
                    {"uri": JOURNEY, "name": "Start with CultureBlocs"}]}
    for k in ("createdAt", "startsAt", "endsAt"):
        assert DT.match(rec[k]), (e["slug"], k)
    assert datetime.fromisoformat(rec["endsAt"]) > datetime.fromisoformat(rec["startsAt"])
    p = old.get(e["slug"])
    if p:
        rk = p["rkey"]
    else:
        created = datetime.fromisoformat(e["created"].replace("Z", "+00:00"))
        rk = tid(int(created.timestamp() * 1_000_000))
    entry = {"slug": e["slug"], "category": "talks", "rkey": rk,
             "atUri": f"at://{did or REPO}/{COLL}/{rk}", "sources": [SOURCE],
             "programme": [{"time": t, "name": n, **({"room": r} if r else {})} for t, n, r in PROGRAMME],
             "record": rec}
    if p and p.get("cid") and p.get("record") == rec:
        entry["cid"] = p["cid"]
    out.append(entry)

doc = {
  "meta": {
    "title": "Creative Spaces Symposium 2026 — CultureBlocs event dataset",
    "name": "Creative Spaces Symposium 2026",
    "directory": "creative-newham-symposium",
    "home": "/start/creative-newham/",
    "tag": "creative-spaces-symposium-2026",
    "short": "cn",   # cultureblocs.com/w/cn/<slug> (redirect in vercel.json)
    "tz": "Europe/London",
    "cardLine": "Creative Newham · 3 Nov 2026 · English National Ballet",
    "repo": REPO,
    "collection": COLL,
    "lexicon": "https://github.com/lexicon-community/lexicon/blob/main/community/lexicon/calendar/event.json",
    "howToUse": "Publish each entry's `record` with com.atproto.repo.putRecord (repo=cultureblocs.com, collection, rkey). Everything outside `record` is sidecar metadata for the site and is not published.",
    "source": SOURCE,
    "count": len(out),
    **({"did": did} if did else {}),
  },
  "records": out,
}
OUT.parent.mkdir(parents=True, exist_ok=True)
OUT.write_text(json.dumps(doc, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
print(len(out), "records ->", OUT)
for o in out:
    print(f"  {o['slug']}  {o['atUri']}")
