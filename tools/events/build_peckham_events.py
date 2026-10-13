"""Build Peckham Digital 2026 event records for the cultureblocs.com repo.

Same shape as build_paris_events.py: each entry = sidecar metadata (slug,
category, sources, notes) + a schema-pure `record` for
community.lexicon.calendar.event. Publishers send only `record`. rkeys are
pre-generated TIDs so at:// URIs are known before publishing.

Source: the festival's own Ticket Tailor box office,
https://www.tickettailor.com/events/peckhamdigital — every event page read on
13 October 2026 (names, times, venues and prices from each page's schema.org
Event data; who is speaking or teaching from its text). Descriptions are our
own short summaries, not the organisers' copy; every record links back to its
ticket page.

Times are Europe/London: BST (+01:00) until 02:00 on Sunday 25 October 2026,
GMT (+00:00) after — so the festival's last day, Sunday, is +00:00.
"""
import json, re, time, random
from pathlib import Path

OUT = Path(__file__).resolve().parents[2] / "events" / "peckham-digital" / "events.json"

COLL = "community.lexicon.calendar.event"
INPERSON = f"{COLL}#inperson"
SCHEDULED = f"{COLL}#scheduled"
CREATED = "2026-10-13T12:00:00.000Z"
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
COPELAND = addr("Copeland Gallery, Copeland Park", "133 Copeland Road", "SE15 3SN")
SOCIAL = addr("SOCIAL, Copeland Park", "133 Copeland Road", "SE15 3SN")
HUB = addr("The Hub (Camberwell College of Arts, UAL)", "42 Bonar Road", "SE15 5FB")

TT = "https://www.tickettailor.com/events/peckhamdigital"
SITE = "https://www.peckhamdigital.org"
S = {
 "tt": TT,
 "site": SITE,
 "hub": "https://www.arts.ac.uk/colleges/camberwell-college-of-arts/partnerships-knowledge-exchange/the-hub",
 "southwark": "https://www.southwark.gov.uk/southwark-presents/peckham-digital",
}

PAID = "£16.80, concession £10.70 (incl. VAT)."
FREE = "Free, booking required."
PCD = ("Part of Processing Community Day. Free; places prioritised for 18–25 year olds "
       "not in employment or education.")

E = []
def ev(slug, cat, name, desc, start, end, loc, tt_id=None, srcs=("tt",), notes=None, extra=()):
    uris = [uri(f"{TT}/{tt_id}", "Tickets")] if tt_id else []
    uris += [uri(u, n) for u, n in extra]
    if not any(u["uri"] == SITE for u in uris):
        uris.append(uri(SITE, "Peckham Digital"))
    E.append(dict(slug=slug, cat=cat, name=name, desc=desc, start=start, end=end, loc=loc,
                  uris=uris, srcs=[f"{TT}/{tt_id}"] if tt_id else [], srcs_extra=list(srcs),
                  notes=notes))

# ---- Umbrella
ev("peckham-digital-2026", "umbrella", "Peckham Digital 2026",
   "The fifth Peckham Digital, a festival of creative computing in south-east London: two exhibitions, workshops, talks, a Processing Community Day, office hours, live audio-visual performance and a night of short films, across Copeland Park and The Hub. Umbrella record: individual events in this collection reference the same festival.",
   "2026-10-22T00:00:00+01:00", "2026-10-25T23:59:00+00:00", None,
   srcs=("site", "tt"), extra=[(TT, "Programme and tickets")],
   notes="Unofficial umbrella record; not published by Peckham Digital.")

# ---- Thursday 22
ev("exhibition-2026", "exhibition", "Peckham Digital 2026: the exhibitions",
   "Two exhibitions for the festival's fifth year. Mediating Behaviours: ten artists working with interactive installation, digital media and experimental sound and image — Ahnjili Zhuparris, Evander Duncan, Jihui Yang, Latifah Dickson, Mantė Elelueta & Danielius Šermukšnis, Marianna Glykofridi, MDamager, Priyal Patel, Ruiyang Wang and Weezy Derham. Minimal Viable Home: games as an art form, with Ama Dogbe, Cristina Bianchi, Jade Lin and Sabina Oțelea, shown at Rabbet London. Thursday to Sunday. Free; book a ticket for the day you go.",
   "2026-10-22T10:00:00+01:00", "2026-10-25T21:00:00+00:00", COPELAND, 2434118,
   notes="The box office gives 10:00 Thu to 21:00 Sun as one span with a free ticket per day; we read that as daily 10:00–21:00 but the organisers don't say so. Minimal Viable Home is described as being at Rabbet London; no address is given, so the record carries Copeland Gallery only.")
ev("noodlerack-generative-modular", "workshop", "Intro to Generative Modular Synthesis with Noodlerack",
   "Jeremy Osztreicher introduces modular synthesis as a way to build small generative sound systems, patching oscillators, clocks, envelopes, filters and randomness in Noodlerack, a free modular synth that runs in the browser. Beginners welcome; bring a laptop and headphones. " + PAID,
   "2026-10-22T17:30:00+01:00", "2026-10-22T19:00:00+01:00", HUB, 2394047)
ev("artists-party-opening", "party", "Artists' Party – Festival Opening",
   "The festival's opening night at the gallery, with performances by malu laet (WYRMDIE: Cyber-Dragons), Yaa Adoma (Like my heart is me, a voice and DNA-sonification piece) and Nell Lang with Ezra Escobar. " + FREE,
   "2026-10-22T18:30:00+01:00", "2026-10-22T22:00:00+01:00", COPELAND, 2426153)

# ---- Friday 23
ev("byow-meetup", "meetup", "BYOW (Bring Your Own Website) Meetup",
   "A meet-up for small, handmade and poetic web practice, hosted by artist and researcher Kendal Beynon. Bring a web project and show it in up to ten minutes; conversation follows. " + FREE,
   "2026-10-23T17:30:00+01:00", "2026-10-23T19:30:00+01:00", COPELAND, 2419647)
ev("noisy-spaces", "workshop", "Noisy Spaces: Embodiment, Technology and Public Space",
   "Sound and performance artist Kat Macdonald leads collective sound-making exercises from the London Community Laptop Orchestra and a short history of London's 1970s experimental collective performance — the laptop as a tool that looks outward. Open to all levels; bring a laptop. " + PAID,
   "2026-10-23T17:30:00+01:00", "2026-10-23T19:00:00+01:00", HUB, 2394217)
ev("untitled-robot-story", "performance", "Untitled (Robot Story)",
   "A new show by Conscript Theatre, a techno-physical performance company: networks set up and run on stage, live camera, experimental audio and video, 3D animation, dance and puppetry, on telling stories when technology overtakes fiction. " + FREE,
   "2026-10-23T20:00:00+01:00", "2026-10-23T21:45:00+01:00", COPELAND, 2419319)

# ---- Saturday 24
ev("pcd-digital-tile-design", "workshop", "Processing Community Day Workshop: Digital Tile Design and Fabrication",
   "Marysia Tańska and James Walker introduce p5.js through prepared examples, then everyone designs their own pattern and cuts it out as a bookmark. " + PCD,
   "2026-10-24T10:00:00+01:00", "2026-10-24T11:00:00+01:00", HUB, 2434101)
ev("slime-city", "workshop", "SLIME CITY: Grow your own algorithmic slime mold anti-surveillance mask using Scaniverse and Blender",
   "Fran Hayes leads a beginner workshop against facial recognition: 3D-scan each other's heads on a phone, grow a slime-mould pattern over the mesh with a Python script in Blender, and leave with a print-ready mask file. Bring a laptop with Blender and a phone with a scanning app. " + PAID,
   "2026-10-24T10:15:00+01:00", "2026-10-24T12:15:00+01:00", HUB, 2419763,
   notes="The title names Scaniverse; the requirements on the same page say Polycam. The description says 'a scanning app'.")
ev("counterfeit-games", "talk", "Counterfeit Games: Anti-Game Approaches to Playable Experiences",
   "Computational artist and game maker Jade Lin (strawberrycongee) talks about playable works that borrow the language of games while refusing their rules of progress and reward. " + FREE,
   "2026-10-24T10:30:00+01:00", "2026-10-24T11:30:00+01:00", COPELAND, 2418755,
   notes="The box office says 10:30 AM – 11:30 PM; read as 10:30–11:30, a one-hour talk.")
ev("pcd-planet-friendly-processing", "workshop", "Processing Community Day Workshop: Planet-friendly Processing",
   "Considerate Digital show how much energy a creative coding project uses, then build an interactive webcam piece in Processing and look at running creative code on low-power, recycled hardware. Bring a laptop with Processing installed. " + PCD,
   "2026-10-24T11:15:00+01:00", "2026-10-24T12:15:00+01:00", HUB, 2429611)
ev("conserving-time-based-media", "talk", "Methods in Conserving Time-Based Contemporary New Media and Collection as Pilgrimage",
   "Artist and scholar Alexa Ann Bonomo on the history of conserving time-based and digital art, and her 'collection as pilgrimage' practice — 3D-scanning artefacts on long walks for Hyperviolet, a digital world joined to handmade books and craft. " + FREE,
   "2026-10-24T12:00:00+01:00", "2026-10-24T13:00:00+01:00", COPELAND, 2430678)
ev("office-hours-joel-gethin-lewis", "office-hours", "Office Hours with Joel Gethin Lewis",
   "Book a 30-minute one-to-one with Joel Gethin Lewis — course leader at UAL's Creative Computing Institute and Interactive Creative Director of Universal Everything — for questions, feedback on your work or career advice in creative computing. Free.",
   "2026-10-24T12:15:00+01:00", "2026-10-24T18:00:00+01:00", SOCIAL, 2439106,
   notes="Fully booked when read on 13 October; the box office offered a waiting list.")
ev("pcd-spoke-physical-interaction", "workshop", "Processing Community Day Workshop: SPOKE – Physical interaction with Processing",
   "Tom Fox introduces SPOKE, his capacitive-touch MIDI board, with p5.js/Processing: touches become numbers, colour, shape and 3D form in real time. Each participant gets a free SpokeBoard. Bring a laptop with Processing installed. " + PCD,
   "2026-10-24T12:30:00+01:00", "2026-10-24T13:30:00+01:00", HUB, 2432574)
ev("intro-to-picodevil", "workshop", "Intro to Picodevil",
   "Game designer and creative technologist v buckenham teaches Picodevil, her open-source browser tool for live-coding visuals from chopped, tiled and treated video clips. Bring a laptop with a browser. " + PAID,
   "2026-10-24T13:30:00+01:00", "2026-10-24T15:00:00+01:00", HUB, 2419790)
ev("ar-live-performance-spectacles", "talk", "Designing Augmented Reality for Live Performance (with Snapchat Spectacles)",
   "Musician and technologist Lien Tran (LIÊNA) on designing for lightweight AR glasses in live music, drawing on her work as supporting musician and developer for Imogen Heap's improvised performance at the Spectacles launch. " + FREE,
   "2026-10-24T14:30:00+01:00", "2026-10-24T15:30:00+01:00", COPELAND, 2419446)
ev("pcd-small-computers-local-worlds", "workshop", "Processing Community Day Workshop: Small computers, local worlds",
   "Yadira Sánchez (tecnomilpa; Slade Art+Tech Research Lab) leads a hands-on build of small portable computers — board, screen, keyboard, power — then adds sensors, buttons and local links between them, in the spirit of DIY cyberdecks. No experience needed. " + PCD,
   "2026-10-24T14:30:00+01:00", "2026-10-24T15:30:00+01:00", HUB, 2434169)
ev("build-a-bot", "workshop", "Build-a-bot: take back your tools",
   "Mahalia Henry-Richards (UAL Creative Computing Institute) on what a bot can be beyond the chat window: design your own on paper — what it knows, what it won't do, who owns the data — then run it locally with Ollama. No coding needed; bring a laptop with Ollama installed. " + PAID,
   "2026-10-24T15:15:00+01:00", "2026-10-24T16:45:00+01:00", HUB, 2429507)
ev("pcd-machines-made-of-words", "workshop", "Processing Community Day Workshop: Small (or large) machines made of words",
   "Poets and Goldsmiths lecturers Iris Colomb and Jérémie Wenger use visual poetry and Oulipo-style writing constraints, on paper and in p5.js, with a spotlight on the spatialist poet Ilse Garnier. No coding experience needed. " + PCD,
   "2026-10-24T15:45:00+01:00", "2026-10-24T16:45:00+01:00", HUB, 2434190)
ev("vera-molnar-order-and-chaos", "talk", "Between Order and Chaos: The Art of Vera Molnar",
   "Melanie Lenz, the V&A's curator of digital art, on Vera Molnar (1924–2023), a pioneer of computer-made art, and the V&A display Degrees of Disruption: Vera Molnar and Generative Art. " + FREE,
   "2026-10-24T16:00:00+01:00", "2026-10-24T17:00:00+01:00", COPELAND, 2419825)
ev("pcd-townhall-learning-to-teach", "talk", "Processing Community Day Townhall: Learning to Teach",
   "London's grassroots creative-coding groups on how they teach code — quick talks from Future Inventions, In-grid, London Live Coding, Permacomputing Club, Phreaking Collective / Cranberry Lemonade and the Slade Art+Tech Research Lab (UCL) — then an unconference: bring questions and practices to share. Free.",
   "2026-10-24T17:30:00+01:00", "2026-10-24T19:00:00+01:00", COPELAND, 2439027)
ev("live-audio-visual-performances", "performance", "Live Audio-visual Performances",
   "An open mic for laptop performers — bring yours — then sets from Talia'Kah (Behind the signal, generative visuals with TidalCycles sound), LAPTOPBACK (Lithium Womb) and Ali Bross (Twisted dreams). " + FREE,
   "2026-10-24T19:30:00+01:00", "2026-10-24T22:00:00+01:00", COPELAND, 2419340)

# ---- Sunday 25 (GMT from 02:00)
ev("intro-to-pure-data", "workshop", "Intro to Pure Data",
   "Nadia Li (Slade, BA Art and Technology) teaches the basics of sound art in Pure Data's visual programming language — oscillators, noise, filters and arrays to draw your waveforms. Bring a laptop with Pure Data vanilla installed. " + PAID,
   "2026-10-25T10:00:00+00:00", "2026-10-25T11:30:00+00:00", HUB, 2418891)
ev("building-beats-with-strudel", "workshop", "Building Beats with Strudel",
   "Shaan Rehsi (shapesandjapes) of Melanated Coalition teaches Strudel, the browser live-coding environment, building an amapiano-inspired beat from scratch — drums, log drum, bass and chords. No coding or production experience needed; bring a laptop and headphones. " + PAID,
   "2026-10-25T10:30:00+00:00", "2026-10-25T11:30:00+00:00", HUB, 2439138,
   notes="The box office says 10:30 AM – 11:30 PM; the page describes an hour-long session, so read as 10:30–11:30.")
ev("bonsai-sound-and-image", "workshop", "Bonsai: Wiring the World into Sound and Image",
   "NeuroGEARS, who develop the open-source Bonsai visual reactive language, build a live installation from camera and microphone streams, then everyone forks it and remaps the inputs and outputs. Beginners welcome. " + PAID,
   "2026-10-25T12:00:00+00:00", "2026-10-25T13:30:00+00:00", HUB, 2418940)
ev("good-artificial-life-simulation", "talk", "What Makes a Good Artificial Life Simulation?",
   "Tom Appleyard on artificial life, from early computer viruses through embodied agents that learn to walk and cooperate to LLM-driven virtual people — and what it takes for something lifelike to emerge. " + FREE,
   "2026-10-25T12:00:00+00:00", "2026-10-25T13:00:00+00:00", COPELAND, 2434216)
ev("office-hours-kasia-molga", "office-hours", "Office Hours with Kasia Molga",
   "Book a 30-minute one-to-one with artist and creative coder Kasia Molga, whose work collaborates with nature and the oceans, for questions, feedback or career advice in creative computing. Slots 12:15, 12:45, 14:00, 17:00 and 17:30. Free.",
   "2026-10-25T12:15:00+00:00", "2026-10-25T18:00:00+00:00", SOCIAL, 2469093,
   notes="The box office runs this to 18:00 on Mon 26 October, after the festival ends; its five slots are all on Sunday, so read as Sunday 12:15–18:00.")
ev("wall-drawing-robot", "workshop", "Build Your Own Wall Drawing Robot",
   "Artist Liz Melchor leads a group build of a polargraph wall plotter — 3D-printed gondola, stepper motors, servo, MKS TinyBee firmware and G-code — with an online tutorial so you can build your own at home. All levels. " + PAID,
   "2026-10-25T13:45:00+00:00", "2026-10-25T16:45:00+00:00", HUB, 2429521,
   extra=[("https://lizmelchor.com/peckham-workshop/", "Materials list")])
ev("moodboard-to-mannequin", "workshop", "From Moodboard to Mannequin: A Beginner's Guide to Projection Mapping",
   "Amber Lucia's workshop, first made with the V&A Youth Collective: draw a fashion illustration, photograph it, and projection-map it onto a mannequin with Map Club, a free open-source web tool, ending in a group showcase. No experience or device needed. " + PAID,
   "2026-10-25T14:00:00+00:00", "2026-10-25T15:30:00+00:00", HUB, 2429303)
ev("automation-and-us", "talk", "Automation and Us",
   "Live coder Lu Wilson (Algorave London, Pastagang) on automation in their practice — cellular automata worked by hand, surrealist automatism, live coding mistaken for AI, and collaboration as a kind of automation. " + FREE,
   "2026-10-25T14:00:00+00:00", "2026-10-25T15:00:00+00:00", COPELAND, 2434095)
ev("bsl-exhibition-tour", "tour", "British Sign Language Exhibition Tour",
   "A tour of the Mediating Behaviours exhibition in British Sign Language, led by Deaf performance artist, choreographer and BSL art guide Chisato Minamimura. " + FREE,
   "2026-10-25T14:30:00+00:00", "2026-10-25T15:30:00+00:00", COPELAND, 2429655)
ev("voice-technology-witchcraft", "talk", "Voice, Technology, and Witchcraft",
   "Artist and researcher June Kuhn (softshadow; Imperial College London) on trans voice training technology as a mode of magic, through her microtonal feedback instrument Ephemerides and a séance in the Wick Woods, both from NIME '26. " + FREE,
   "2026-10-25T15:30:00+00:00", "2026-10-25T16:30:00+00:00", COPELAND, 2419494)
ev("what-even-is-an-art-game", "talk", "What Even is An Art Game?",
   "Elliott Burns, curator and author of Side Quest, gives a vote-based performance lecture: agree or disagree from your phone as he unpacks what 'art game' means and how games sit in galleries. " + FREE,
   "2026-10-25T17:00:00+00:00", "2026-10-25T18:00:00+00:00", COPELAND, 2419490)
ev("who-gets-seen-in-xr", "talk", "Who Gets Seen in XR? Data, Diversity, and Generalization in Extended Reality",
   "Creative technologist Mashall Khattak (Gloss Engine) draws on teaching XR design in Pakistan to ask whose data, bodies and contexts extended reality is built for. " + FREE,
   "2026-10-25T18:30:00+00:00", "2026-10-25T19:30:00+00:00", COPELAND, 2430614)
ev("digital-reel-screenings", "screening", "Digital Reel: Creative Computing Film Screenings",
   "Eight short films made with creative computing: SHATTRD (uoshi), How to Excel at Everything (Marion Balac), Eye Lynx (Catherine Chapman), Rule 30 (there are no girls on the internet) (Erinne Huston), The Nest (Grier Iana), p0wer vect0rs (Helena Nikonole), Cyborg Needs No Redemption (Sofia Talanti) and IT GIRL (Raw2.2 and Alex Quicho). " + FREE,
   "2026-10-25T19:45:00+00:00", "2026-10-25T20:45:00+00:00", COPELAND, 2434250)

# ---- Build
DT = re.compile(r"^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d+)?(Z|[+-]\d{2}:\d{2})$")
# London offsets: +01:00 before 02:00 BST (01:00 UTC) on 25 Oct 2026, +00:00 after.
SWITCH = "2026-10-25T01:00:00+00:00"
from datetime import datetime, timezone
def offset_ok(iso):
    d = datetime.fromisoformat(iso)
    want = "+01:00" if d.astimezone(timezone.utc) < datetime.fromisoformat(SWITCH) else "+00:00"
    return iso.endswith(want)

base_us = int(time.mktime(time.strptime("2026-10-13 12:00:00", "%Y-%m-%d %H:%M:%S"))) * 1_000_000
random.seed(2026_10_22)
clock = random.randrange(1024)

out = []
for i, e in enumerate(E):
    rec = {"$type": COLL, "name": e["name"], "description": e["desc"], "createdAt": CREATED,
           "startsAt": e["start"], "mode": INPERSON, "status": SCHEDULED}
    if e["end"]: rec["endsAt"] = e["end"]
    if e["loc"]: rec["locations"] = [e["loc"]]
    rec["uris"] = e["uris"]
    for k in ("createdAt", "startsAt", "endsAt"):
        if k in rec: assert DT.match(rec[k]), (e["slug"], k, rec[k])
    for k in ("startsAt", "endsAt"):
        if k in rec: assert offset_ok(rec[k]), ("wrong London offset", e["slug"], k, rec[k])
    if "endsAt" in rec:
        assert datetime.fromisoformat(rec["endsAt"]) > datetime.fromisoformat(rec["startsAt"]), e["slug"]
    assert len(rec["description"]) <= 3000 and len(rec["name"]) <= 300, e["slug"]
    rk = tid(base_us + i * 1000, clock)
    entry = {"slug": e["slug"], "category": e["cat"], "rkey": rk,
             "atUri": f"at://{REPO}/{COLL}/{rk}",
             "sources": e["srcs"] + [S[s] for s in e["srcs_extra"] if S[s] not in e["srcs"]],
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

doc = {
  "meta": {
    "title": "Peckham Digital 2026 — CultureBlocs event dataset",
    "name": "Peckham Digital 2026",
    "directory": "peckham-digital",
    "tag": "peckham-digital-2026",
    "short": "pd",   # printed QR cards: cultureblocs.com/w/pd/<rkey> (redirect in vercel.json)
    "tz": "Europe/London",
    "cardLine": "Workshops, talks, performance and two exhibitions, day by day",
    "repo": REPO,
    "collection": COLL,
    "lexicon": "https://github.com/lexicon-community/lexicon/blob/main/community/lexicon/calendar/event.json",
    "generated": "2026-10-13",
    "status": "draft — review flagged notes before publishing",
    "howToUse": "Publish each entry's `record` with com.atproto.repo.putRecord (repo=cultureblocs.com, collection, rkey). Everything outside `record` is sidecar metadata for the site and is not published.",
    "timezone": "Times are Europe/London; BST (+01:00) until 02:00 on 25 Oct 2026, GMT (+00:00) after — so the festival's last day, Sunday 25 October, is +00:00.",
    "checked": "Every event read from the festival's own Ticket Tailor box office on 13 October 2026. Three box-office times are evidently typos and are corrected; each says so in its `notes`.",
    "prices": "Prices are the box office's own: paid workshops £16.80 or £10.70 concession incl. VAT; everything else free to book.",
    "omitted": "Nothing from the box office is left out. Descriptions are our own short summaries; the organisers' copy and artist biographies stay on their pages.",
    "unofficial": "Independent listing by CultureBlocs; not affiliated with or endorsed by Peckham Digital or any listed artist or venue.",
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
