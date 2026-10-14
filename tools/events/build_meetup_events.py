"""Build CultureBlocs meetup event records for the cultureblocs.com repo.

The meetups are our own events, so each one is a community.lexicon.calendar.event
record in @cultureblocs.com like any other directory's — which is what lets
people press "I went" and write a bead that points at the evening.

An unlisted directory (like the Serpentine's): meta.home is /meetup.html, so it
is not on /events/; /events/cultureblocs-meetups/ redirects to the meetup page.
QR / short link: cultureblocs.com/w/meetup/<slug>  →  the I went composer.

Add the next meetup by adding an ev(...) line below and rerunning. Existing
rkeys are kept, so published URIs never change.

Source: the Luma pages (start_at / end_at in each page's data).
"""
import json, re
from datetime import datetime, timezone
from pathlib import Path

OUT = Path(__file__).resolve().parents[2] / "events" / "cultureblocs-meetups" / "events.json"

COLL = "community.lexicon.calendar.event"
INPERSON = f"{COLL}#inperson"
SCHEDULED = f"{COLL}#scheduled"
REPO = "cultureblocs.com"
CAL = "https://luma.com/calendar/cal-siHm3wAIGRkwlCh"

B32 = "234567abcdefghijklmnopqrstuvwxyz"
def tid(us, clock=0):
    n = (us << 10) | clock
    s = ""
    for _ in range(13):
        s = B32[n & 31] + s
        n >>= 5
    return s

SIXES = {"$type": "community.lexicon.location.address", "country": "GB", "locality": "London",
         "name": "Sixes Party Cricket, London Bridge", "street": "50 Bermondsey Street",
         "postalCode": "SE1 3UD"}

E = []
def ev(slug, name, desc, start, end, loc, luma, created):
    E.append(dict(slug=slug, name=name, desc=desc, start=start, end=end, loc=loc,
                  luma=luma, created=created))

ev("autumn-2026", "CultureBlocs: Creative × Tech Autumn Meetup",
   "A friendly London evening for people at every stage — tech-curious, practitioners, technologists and founders — to share projects and problems and talk about what technology and data can do for the creative and cultural sector. Arrivals and drinks from 18:30, a welcome to CultureBlocs, informal shares, open conversation and newcomer-friendly networking in small groups. Hosted by Mark Simpkins and Oliver Outen.",
   "2026-10-14T18:30:00+01:00", "2026-10-14T21:00:00+01:00", SIXES,
   "https://luma.com/787591ep", "2026-10-14T10:00:00.000Z")

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
           "startsAt": e["start"], "endsAt": e["end"], "mode": INPERSON, "status": SCHEDULED,
           "locations": [e["loc"]],
           "uris": [{"uri": e["luma"], "name": "Register on Luma"},
                    {"uri": "https://www.cultureblocs.com/meetup.html", "name": "CultureBlocs meetup"}]}
    for k in ("createdAt", "startsAt", "endsAt"):
        assert DT.match(rec[k]), (e["slug"], k)
    assert datetime.fromisoformat(rec["endsAt"]) > datetime.fromisoformat(rec["startsAt"])
    p = old.get(e["slug"])
    if p:
        rk = p["rkey"]
    else:
        created = datetime.fromisoformat(e["created"].replace("Z", "+00:00"))
        rk = tid(int(created.timestamp() * 1_000_000))
    entry = {"slug": e["slug"], "category": "meetup", "rkey": rk,
             "atUri": f"at://{did or REPO}/{COLL}/{rk}", "sources": [e["luma"]], "record": rec}
    if p and p.get("cid") and p.get("record") == rec:
        entry["cid"] = p["cid"]
    out.append(entry)

assert len({o["rkey"] for o in out}) == len(out)

doc = {
  "meta": {
    "title": "CultureBlocs meetups — CultureBlocs event dataset",
    "name": "CultureBlocs meetups",
    "directory": "cultureblocs-meetups",
    "home": "/meetup.html",
    "tag": "cultureblocs-meetup",
    "short": "meetup",   # cultureblocs.com/w/meetup/<slug> (redirect in vercel.json)
    "tz": "Europe/London",
    "cardLine": "Creative × Tech evenings in London",
    "repo": REPO,
    "collection": COLL,
    "lexicon": "https://github.com/lexicon-community/lexicon/blob/main/community/lexicon/calendar/event.json",
    "howToUse": "Publish each entry's `record` with com.atproto.repo.putRecord (repo=cultureblocs.com, collection, rkey). Everything outside `record` is sidecar metadata for the site and is not published.",
    "calendar": CAL,
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
