"""Build Frieze Week 2026 event records for the cultureblocs.com repo.

Each entry = sidecar metadata (slug, category, sources, notes) + a schema-pure
`record` for community.lexicon.calendar.event. Publishers send only `record`.
rkeys are pre-generated TIDs so at:// URIs are known before publishing.
"""
import json, re, time, random
from pathlib import Path

OUT = Path(__file__).resolve().parents[2] / "events" / "frieze-week-london" / "events.json"

COLL = "community.lexicon.calendar.event"
INPERSON = f"{COLL}#inperson"
SCHEDULED = f"{COLL}#scheduled"
PLANNED = f"{COLL}#planned"
CREATED = "2026-10-05T20:30:00.000Z"
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

def uri(u, name):
    return {"uri": u, "name": name}

# Venues
REGENTS_FL = addr("Frieze London, The Regent's Park", "Park Square West", "NW1 4LL")
REGENTS_FM = addr("Frieze Masters, Gloucester Green, The Regent's Park", "Gloucester Green", "NW1 4HA")
REGENTS_SC = addr("English Gardens, The Regent's Park")
NO9 = addr("No.9 Cork Street", "9 Cork Street", "W1S 3LL")
ICA = addr("Institute of Contemporary Arts (ICA)", "The Mall", "SW1Y 5AH")
PAD = addr("PAD London, Berkeley Square", "Berkeley Square", "W1J 6EN")
SOMERSET = addr("Somerset House", "Strand", "WC2R 1LA")
NEWMAN = addr("The Newman, Fitzrovia", postal="W1T 3EB")
ELECTROWERKZ = addr("Electrowerkz", "7 Torrens Street", "EC1V 1NQ")
CHANCERY = addr("The Chancery Rosewood (former US Embassy)", "Grosvenor Square")
ONE_MARYLEBONE = addr("One Marylebone", "1 Marylebone Road", "NW1 4AQ")
BATTERSEA = addr("Battersea Park")
TATE = addr("Tate Modern, Turbine Hall", "Bankside", "SE1 9TG")
BARBICAN = addr("Barbican Art Gallery", "Silk Street", "EC2Y 8DS")
WHITECHAPEL = addr("Whitechapel Gallery", "77-82 Whitechapel High Street", "E1 7QX")
SERP_N = addr("Serpentine North, Kensington Gardens", postal="W2 2AR")
NATGAL = addr("National Gallery", "Trafalgar Square", "WC2N 5DN")
HAYWARD = addr("Hayward Gallery, Southbank Centre", "Belvedere Road", "SE1 8XX")
BM = addr("British Museum", "Great Russell Street", "WC1B 3DG")
SLG = addr("South London Gallery", "65-67 Peckham Road", "SE5 8UH")
GASWORKS = addr("Gasworks", "155 Vauxhall Street", "SE11 5RH")

S = {  # sources
 "frieze_visit": "https://www.frieze.com/fairs/frieze-london-frieze-masters/visitor-information",
 "frieze_prog": "https://www.frieze.com/article/frieze-london-masters-2026-programming-announcement",
 "frieze_talks": "https://www.frieze.com/article/frieze-masters-2026-talks-programme",
 "frieze_shows": "https://www.frieze.com/article/shows-see-during-frieze-london-2026",
 "londonsoc": "https://londonsociety.uk/frieze-london-2026.html",
 "fad_highlights": "https://fadmagazine.com/2026/09/15/frieze-london-2026-frieze-masters-highlights/",
 "momaa": "https://momaa.org/frieze-london-2026-tickets-dates/",
 "no9": "https://www.frieze.com/gallery/no-9-cork-street-frieze",
 "pad": "https://www.padesignart.com/en/london/information/",
 "154": "https://www.1-54.com/london/",
 "somerset": "https://www.somersethouse.org.uk/",
 "minor": "https://minorattractions.com/",
 "minor_prog": "https://minorattractions.substack.com/p/minor-attractions-programme-2026",
 "invitational": "https://fadmagazine.com/2026/09/22/london-invitational-art-fair-frieze-week-2026-2/",
 "fairplay": "https://fadmagazine.com/2026/05/14/fair-play-art-fair-london-2026/",
 "artlyst": "https://artlyst.com/london-art-fair-guide-autumn-2026/",
 "ica": "https://www.ica.art/exhibitions/frieze-x-ica-artists-film-programme-2026",
 "aaf": "https://affordableartfair.com/fairs/london-battersea-autumn/",
 "minor_ed": "https://minorattractions.com/editions/minor-attractions-2026",
}

# (slug, category, name, description, startsAt, endsAt, location, uris, status, sources, notes)
E = []
def ev(slug, cat, name, desc, start, end, loc, uris, srcs, status=SCHEDULED, notes=None):
    E.append(dict(slug=slug, cat=cat, name=name, desc=desc, start=start, end=end,
                  loc=loc, uris=uris, srcs=srcs, status=status, notes=notes))

# ---- Umbrella
ev("frieze-week-london-2026", "umbrella", "Frieze Week London 2026",
   "The week of art fairs, talks, gallery openings, museum launches and auctions around Frieze London and Frieze Masters in The Regent's Park. Umbrella record: individual events in this collection reference the same week.",
   "2026-10-13T00:00:00+01:00", "2026-10-18T23:59:00+01:00", None,
   [uri("https://www.frieze.com/fairs/frieze-london-frieze-masters", "Frieze London & Frieze Masters")],
   ["frieze_visit", "artlyst"], notes="Unofficial umbrella record; not published by Frieze.")

# ---- Core Frieze
ev("frieze-london-2026", "fair", "Frieze London 2026",
   "Contemporary art fair with 176 galleries from 43 countries and regions. Sections: Galleries, Focus, Artist-to-Artist, Editions and the new The Code Universe (curated by Carol Yinghua Lu). Wed 14 invitation only; Thu 15 members/invitation 11:00-13:00 then general admission 13:00-17:00; Fri-Sat 11:00-19:00; Sun 11:00-18:00. Ticketed.",
   "2026-10-14T11:00:00+01:00", "2026-10-18T18:00:00+01:00", REGENTS_FL,
   [uri("https://www.frieze.com/fairs/frieze-london", "Frieze London"),
    uri("https://www.frieze.com/fairs/frieze-london-frieze-masters/tickets", "Tickets")],
   ["frieze_visit", "fad_highlights"])
ev("frieze-masters-2026", "fair", "Frieze Masters 2026",
   "Historical art fair with 142 galleries from 33 countries: ancient art, old masters, decorative arts, works on paper and 20th-century art. New curatorial thread 'Queering Modernism' by Anke Kempkes; Spotlight section curated by Devika Singh and Sofia Gotti. Wed 14 invitation only; Thu 15 members/invitation 11:00-13:00 then general admission 13:00-19:00; Fri-Sat 11:00-19:00; Sun 11:00-18:00. Ticketed.",
   "2026-10-14T11:00:00+01:00", "2026-10-18T18:00:00+01:00", REGENTS_FM,
   [uri("https://www.frieze.com/fairs/frieze-masters", "Frieze Masters"),
    uri("https://www.frieze.com/fairs/frieze-london-frieze-masters/tickets", "Tickets")],
   ["frieze_visit", "fad_highlights"])
ev("frieze-sculpture-2026", "exhibition", "Frieze Sculpture 2026",
   "Free outdoor exhibition of large-scale sculpture by 11 international artists in the English Gardens of The Regent's Park, curated by Fatoş Üstek.",
   "2026-09-16T00:00:00+01:00", "2026-11-01T23:59:00+00:00", REGENTS_SC,
   [uri("https://www.frieze.com/fairs/frieze-london-frieze-masters", "Frieze")],
   ["frieze_visit", "londonsoc"], notes="Dates only; daily park opening hours not stated in sources. End is after the BST→GMT change (25 Oct), hence +00:00.")
ev("no9-cork-street-ppow-robin-f-williams", "exhibition", "P·P·O·W: Robin F. Williams, 'Act Natural' at No.9 Cork Street",
   "Solo presentation by Robin F. Williams with P·P·O·W at Frieze's Mayfair gallery space. Free. Tue-Sat 10:00-18:00.",
   "2026-10-09T10:00:00+01:00", "2026-10-24T18:00:00+01:00", NO9,
   [uri("https://www.frieze.com/gallery/no-9-cork-street-frieze", "No.9 Cork Street")], ["no9"])
ev("no9-cork-street-third-line-jordan-nassar", "exhibition", "The Third Line: Jordan Nassar, 'No History of Shapes' at No.9 Cork Street",
   "Solo presentation by Jordan Nassar with The Third Line at Frieze's Mayfair gallery space. Free. Tue-Sat 10:00-18:00.",
   "2026-10-09T10:00:00+01:00", "2026-10-24T18:00:00+01:00", NO9,
   [uri("https://www.frieze.com/gallery/no-9-cork-street-frieze", "No.9 Cork Street")], ["no9"])

# ---- Fair programme
ev("frieze-masters-talks-2026", "talks", "Frieze Masters Talks 2026: 'Breaking the Mould'",
   "Talks series presented with dunhill and curated by Arturo Galansino (Fondazione Palazzo Strozzi), on ceramics, expanding the art-historical canon and the future of museum displays. Speakers include Sheila Barker, Es Devlin, Lina Ghotmeh, Tim Marlow, Iris Moon, Peter Parker, Grayson Perry, Paul Pfeiffer, Luke Syson, Danh Vō and Kulapat Yantrasast. Recorded as a podcast.",
   "2026-10-14T00:00:00+01:00", "2026-10-16T23:59:00+01:00", REGENTS_FM,
   [uri(S["frieze_talks"], "Frieze Masters Talks 2026")], ["frieze_prog", "frieze_talks", "londonsoc"],
   notes="Series umbrella; daily start/end times not in sources.")
ev("frieze-masters-talk-es-devlin-tim-marlow", "talk", "Frieze Masters Talks: Es Devlin in conversation with Tim Marlow",
   "Part of 'Breaking the Mould'. Falls on the invitation-only preview day.",
   "2026-10-14T17:00:00+01:00", None, REGENTS_FM,
   [uri(S["frieze_talks"], "Frieze Masters Talks 2026")], ["londonsoc"], notes="End time not published.")
ev("frieze-masters-talk-grayson-perry-iris-moon", "talk", "Frieze Masters Talks: 'Ceramics Past and Present' with Grayson Perry and Iris Moon",
   "Grayson Perry and Iris Moon in conversation, moderated by Xavier Bray. Part of 'Breaking the Mould'.",
   "2026-10-15T12:00:00+01:00", None, REGENTS_FM,
   [uri(S["frieze_talks"], "Frieze Masters Talks 2026")], ["frieze_talks", "londonsoc"], notes="End time not published.")
ev("frieze-london-gray-wielebinski-production", "commission", "Gray Wielebinski, 'Production' (2026)",
   "Site-specific commission at Frieze London, produced by Dean's Bottom: scent-diffusing sculptural urinal cakes and toilet-rim blocks installed across the fair's lavatories.",
   "2026-10-14T11:00:00+01:00", "2026-10-18T18:00:00+01:00", REGENTS_FL,
   [uri(S["frieze_prog"], "Frieze 2026 programme")], ["frieze_prog"])
ev("frieze-ica-artists-film-programme-2026", "screening", "Frieze x ICA Artists' Film Programme 2026",
   "Continuous-loop programme of artists' film and moving image by early-career and under-exposed artists (works from the last five years), at the ICA and online at ica.art.",
   "2026-10-12T00:00:00+01:00", "2026-10-18T23:59:00+01:00", ICA,
   [uri("https://www.ica.art/exhibitions/frieze-x-ica-artists-film-programme-2026", "ICA: Frieze x ICA Artists' Film Programme 2026"),
    uri(S["frieze_prog"], "Frieze 2026 programme")], ["ica", "frieze_prog"],
   notes="Dates confirmed by ICA (12-18 Oct); daily hours not published.")

# ---- London Gallery Moments
ev("frieze-gallery-moments-bloomsbury-afternoon", "gallery-day", "London Gallery Moments: Bloomsbury Afternoon",
   "Frieze neighbourhood gallery event across Bloomsbury galleries.",
   "2026-10-09T16:00:00+01:00", "2026-10-09T20:00:00+01:00", addr("Bloomsbury galleries"),
   [uri(S["frieze_prog"], "Frieze 2026 programme")], ["frieze_prog"])
ev("frieze-gallery-moments-east-end-day", "gallery-day", "London Gallery Moments: East End Day",
   "Frieze neighbourhood gallery event across East End galleries.",
   "2026-10-11T11:00:00+01:00", "2026-10-11T18:00:00+01:00", addr("East End galleries"),
   [uri(S["frieze_prog"], "Frieze 2026 programme")], ["frieze_prog"])
ev("frieze-gallery-moments-west-end-day", "gallery-day", "London Gallery Moments: West End Day",
   "Frieze neighbourhood gallery event across Mayfair and West End galleries.",
   "2026-10-17T11:00:00+01:00", "2026-10-17T18:00:00+01:00", addr("West End galleries"),
   [uri(S["frieze_prog"], "Frieze 2026 programme")], ["frieze_prog"])

# ---- Satellite fairs
ev("pad-london-2026", "fair", "PAD London 2026",
   "Fair dedicated to historical and contemporary design and art. Collectors Preview Tue 13 11:00-20:00; VIP Opening Wed 14 11:00-20:00; public Thu-Sat 11:00-19:00, Sun 11:00-18:00. Ticketed.",
   "2026-10-13T11:00:00+01:00", "2026-10-18T18:00:00+01:00", PAD,
   [uri("https://www.padesignart.com/en/london/information/", "PAD London")], ["pad"])
ev("1-54-london-2026", "fair", "1-54 Contemporary African Art Fair London 2026",
   "14th London edition of the fair for contemporary art from Africa and its diaspora. VIP and press preview Thu 15 11:00-19:00; public Fri-Sat 11:00-19:00, Sun 11:00-18:00.",
   "2026-10-15T11:00:00+01:00", "2026-10-18T18:00:00+01:00", SOMERSET,
   [uri("https://www.1-54.com/london/", "1-54 London")], ["154", "somerset"])
ev("minor-attractions-2026", "fair", "Minor Attractions 2026",
   "Fourth edition of the art fair that blends art, performance and nightlife; 75+ galleries and not-for-profit spaces across 16 rooms on the first floor of The Newman, plus a city-wide events programme.",
   "2026-10-13T00:00:00+01:00", "2026-10-17T23:59:00+01:00", NEWMAN,
   [uri("https://minorattractions.com/editions/minor-attractions-2026", "Minor Attractions 2026"), uri(S["minor_prog"], "2026 programme")],
   ["minor_ed", "minor_prog", "artlyst"], notes="Venue confirmed as The Newman on the official edition page; daily opening hours not published.")
ev("minor-attractions-2026-the-hang", "party", "THE HANG: Minor Attractions Opening Party",
   "Opening party for Minor Attractions 2026.",
   "2026-10-13T20:30:00+01:00", "2026-10-14T03:00:00+01:00", ELECTROWERKZ,
   [uri(S["minor_prog"], "Minor Attractions programme")], ["minor_prog"])
ev("london-invitational-2026", "fair", "London Invitational 2026",
   "European debut of the boutique fair founded in Dallas by James Cope: 12 galleries from London and the US on one floor of The Chancery Rosewood. Public Fri-Sat 11:00-18:00, Sun 12:00-16:00.",
   "2026-10-15T00:00:00+01:00", "2026-10-18T16:00:00+01:00", CHANCERY,
   [uri(S["invitational"], "FAD Magazine: London Invitational")], ["invitational"],
   notes="Thu 15 appears to be invitation-only; hours for that day not published.")
ev("fair-play-2026", "fair", "Fair Play Art Fair 2026",
   "Inaugural artist-led fair: around 65-70 independent artists chosen by a selection committee and given free stands on a commission model, with installations, sound art, dining and live performance.",
   "2026-10-15T00:00:00+01:00", "2026-10-18T23:59:00+01:00", ONE_MARYLEBONE,
   [uri(S["fairplay"], "FAD Magazine: Fair Play")], ["fairplay", "artlyst"], notes="Daily opening hours not in sources.")
ev("affordable-art-fair-battersea-autumn-2026", "fair", "Affordable Art Fair Battersea (Autumn 2026)",
   "Autumn edition of the Affordable Art Fair in Battersea Park. Wed 14 Private View 17:00-21:00; Thu 15 and Fri 16 general admission 11:00-17:00, then Art After Dark late 17:00-21:00 (18+); Sat 17 and Sun 18 general admission 10:00-18:00, with Family Morning 10:00-12:00. Last entry 20:30 on weekdays, 17:30 at weekends. Ticketed.",
   "2026-10-14T17:00:00+01:00", "2026-10-18T18:00:00+01:00", BATTERSEA,
   [uri("https://affordableartfair.com/fairs/london-battersea-autumn/", "Affordable Art Fair Battersea")], ["aaf", "artlyst"])
ev("somerset-house-3-evenings-2026", "performance", "3 Evenings: Somerset House Studios at 10",
   "Three nights of experiments in performance and technology marking ten years of Somerset House Studios, a reimagining of the 1966 '9 Evenings: Theatre and Engineering'.",
   "2026-10-16T00:00:00+01:00", "2026-10-18T23:59:00+01:00", SOMERSET,
   [uri("https://www.somersethouse.org.uk/", "Somerset House")], ["somerset"], notes="Evening start times not in sources.")

# ---- Institutional exhibitions
def show(slug, name, desc, s, e, loc, src_url, src_name, notes=None):
    ev(slug, "exhibition", name, desc, s, e, loc, [uri(src_url, src_name)], ["frieze_shows"], notes=notes)

show("tate-modern-hyundai-commission-tarek-atoui", "Hyundai Commission: Tarek Atoui, Tate Modern Turbine Hall",
     "Turbine Hall commission by the French-Lebanese artist and composer, whose practice builds new sculptural instruments and uses sound in performance and installation.",
     "2026-10-13T10:00:00+01:00", "2027-04-11T18:00:00+01:00", TATE, "https://www.tate.org.uk/", "Tate Modern")
show("barbican-robert-ryman-the-real-thing", "Robert Ryman: The Real Thing",
     "Sixty works from six decades; the first major UK exhibition of Ryman's paintings in over 30 years.",
     "2026-10-08T00:00:00+01:00", "2027-02-28T23:59:00+00:00", BARBICAN, "https://www.barbican.org.uk/", "Barbican")
show("whitechapel-cecilia-vicuna", "Cecilia Vicuña",
     "Six-decade survey of the Chilean poet and artist, including 'Quipu Menstrual'.",
     "2026-10-07T00:00:00+01:00", "2027-02-14T23:59:00+00:00", WHITECHAPEL, "https://www.whitechapelgallery.org/", "Whitechapel Gallery")
show("serpentine-north-amar-kanwar", "Amar Kanwar",
     "Includes the premiere of the seven-screen installation 'The Charcoal Man' (2026), alongside 'Such a Morning' and 'The Peacock's Graveyard'.",
     "2026-09-23T00:00:00+01:00", "2027-01-31T23:59:00+00:00", SERP_N, "https://www.serpentinegalleries.org/", "Serpentine")
show("national-gallery-renoir-and-love", "Renoir and Love",
     "Major Renoir survey with the Musée d'Orsay and MFA Boston; the first UK survey since 2007.",
     "2026-10-03T00:00:00+01:00", "2027-01-31T23:59:00+00:00", NATGAL, "https://www.nationalgallery.org.uk/", "National Gallery")
show("hayward-anish-kapoor", "Anish Kapoor",
     "Whole-building survey curated by Ralph Rugoff, his last as Hayward director. Final days during Frieze Week.",
     "2026-06-16T00:00:00+01:00", "2026-10-18T23:59:00+01:00", HAYWARD, "https://www.southbankcentre.co.uk/", "Southbank Centre")
show("british-museum-bayeux-tapestry", "The Bayeux Tapestry",
     "The tapestry's first showing in the UK in nearly 1,000 years.",
     "2026-09-10T00:00:00+01:00", "2027-07-11T23:59:00+01:00", BM, "https://www.britishmuseum.org/", "British Museum")
show("slg-monika-sosnowska", "Monika Sosnowska",
     "Major show of the Polish sculptor across the Main Gallery and Fire Station, part of SLG's 135th anniversary year.",
     "2026-09-10T00:00:00+01:00", "2026-11-22T23:59:00+00:00", SLG, "https://www.southlondongallery.org/", "South London Gallery")
show("gasworks-paloma-contreras-lomas", "Paloma Contreras Lomas",
     "Culmination of the Mexican artist's 2026 Gasworks residency: an 'installation-underworld'.",
     "2026-10-01T00:00:00+01:00", "2026-12-13T23:59:00+00:00", GASWORKS, "https://www.gasworks.org.uk/", "Gasworks")

# ---- Build
DT = re.compile(r"^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d+)?(Z|[+-]\d{2}:\d{2})$")
base_us = int(time.mktime(time.strptime("2026-10-05 20:30:00", "%Y-%m-%d %H:%M:%S"))) * 1_000_000
random.seed(2026)
clock = random.randrange(1024)

out = []
for i, e in enumerate(E):
    rec = {"$type": COLL, "name": e["name"], "description": e["desc"], "createdAt": CREATED,
           "startsAt": e["start"], "mode": INPERSON, "status": e["status"]}
    if e["end"]: rec["endsAt"] = e["end"]
    if e["loc"]: rec["locations"] = [e["loc"]]
    rec["uris"] = e["uris"]
    for k in ("createdAt", "startsAt", "endsAt"):
        if k in rec: assert DT.match(rec[k]), (e["slug"], k, rec[k])
    rk = tid(base_us + i * 1000, clock)
    entry = {"slug": e["slug"], "category": e["cat"], "rkey": rk,
             "atUri": f"at://{REPO}/{COLL}/{rk}",
             "sources": [S[s] for s in e["srcs"]], "record": rec}
    if e["notes"]: entry["notes"] = e["notes"]
    out.append(entry)

assert len({o["slug"] for o in out}) == len(out)
assert len({o["rkey"] for o in out}) == len(out)

doc = {
  "meta": {
    "title": "Frieze Week London 2026 — CultureBlocs event dataset",
    "repo": REPO,
    "collection": COLL,
    "lexicon": "https://github.com/lexicon-community/lexicon/blob/main/community/lexicon/calendar/event.json",
    "generated": "2026-10-06",
    "status": "draft — review flagged notes before publishing",
    "howToUse": "Publish each entry's `record` with com.atproto.repo.putRecord (repo=cultureblocs.com, collection, rkey). Everything outside `record` is sidecar metadata for the site and is not published. `atUri` uses the handle; swap in the DID once known.",
    "timezone": "Times are Europe/London; BST (+01:00) until 25 Oct 2026, GMT (+00:00) after. All-day/date-only events use 00:00–23:59 because the lexicon has no all-day flag.",
    "omitted": "Christie's/Sotheby's/Phillips Frieze Week evening sales — 2026 dates not confirmed at time of build.",
    "unofficial": "Independent listing by CultureBlocs; not affiliated with or endorsed by Frieze or any listed organiser.",
    "count": len(out),
  },
  "records": out,
}
with open(OUT, "w", encoding="utf-8") as f:
    json.dump(doc, f, ensure_ascii=False, indent=2)
print(len(out), "records ->", OUT)
from collections import Counter
print(Counter(o["category"] for o in out))
print(sum(1 for o in out if "notes" in o), "with notes")
