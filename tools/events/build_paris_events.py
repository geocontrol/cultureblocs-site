"""Build Paris Art Week 2026 event records for the cultureblocs.com repo.

Same shape as build_frieze_events.py: each entry = sidecar metadata (slug,
category, sources, notes) + a schema-pure `record` for
community.lexicon.calendar.event. Publishers send only `record`. rkeys are
pre-generated TIDs so at:// URIs are known before publishing.

Times are Europe/Paris: CEST (+02:00) until 03:00 on Sunday 25 October 2026,
CET (+01:00) from then on — so anything on the Sunday, the fair's last day,
carries +01:00. The listing's meta.tz tells the site to read it in Paris time.

Dates were checked on each organiser's own site on 7 October 2026; where only
a secondary source had a fact, the entry's `notes` say so.
"""
import json, re, time, random
from pathlib import Path

OUT = Path(__file__).resolve().parents[2] / "events" / "paris-art-week" / "events.json"

COLL = "community.lexicon.calendar.event"
INPERSON = f"{COLL}#inperson"
SCHEDULED = f"{COLL}#scheduled"
CREATED = "2026-10-07T12:00:00.000Z"
REPO = "cultureblocs.com"

B32 = "234567abcdefghijklmnopqrstuvwxyz"
def tid(us, clock):
    n = (us << 10) | clock
    s = ""
    for _ in range(13):
        s = B32[n & 31] + s
        n >>= 5
    return s

def addr(name, street=None, postal=None, locality="Paris"):
    a = {"$type": "community.lexicon.location.address", "country": "FR",
         "locality": locality, "name": name}
    if street: a["street"] = street
    if postal: a["postalCode"] = postal
    return a

def uri(u, name):
    return {"uri": u, "name": name}

# Venues
GRAND_PALAIS_FAIR = addr("Grand Palais", "Avenue Winston Churchill", "75008")
GRAND_PALAIS_EXPO = addr("Grand Palais, Galleries 3–4", "17 avenue du Général Eisenhower", "75008")
PETIT_PALAIS = addr("Petit Palais", "Avenue Winston Churchill", "75008")
WINSTON = addr("Avenue Winston Churchill (between the Grand Palais and the Petit Palais)", "Avenue Winston Churchill", "75008")
CLEMENCEAU = addr("Place Clemenceau", "Place Clemenceau", "75008")
JEAN_PERRIN = addr("Square Jean Perrin", "Avenue du Général Eisenhower", "75008")
NOUVELLE_FRANCE = addr("Jardin de la Nouvelle-France", "Avenue Franklin-D.-Roosevelt", "75008")
TROCADERO = addr("Parvis des Droits de l'Homme, Trocadéro", "Place du Trocadéro-et-du-11-Novembre", "75116")
PETITS_AUGUSTINS = addr("Chapelle des Petits-Augustins, Beaux-Arts de Paris", "14 rue Bonaparte", "75006")
IENA = addr("Palais d'Iéna", "9 place d'Iéna", "75116")
CITE_ARCHI = addr("Cité de l'architecture et du patrimoine", "1 place du Trocadéro-et-du-11-Novembre", "75116")
VALMY = addr("Paris Internationale, 187–189 Quai de Valmy", "187–189 Quai de Valmy", "75010")
MONNAIE = addr("La Monnaie de Paris", "11 Quai de Conti", "75006")
MAISONS = addr("L'Hôtel de Maisons", "51 rue de l'Université", "75007")
CARREAU = addr("Carreau du Temple", "4 rue Eugène Spuller", "75003")
SALPETRIERE = addr("Chapelle Saint-Louis de la Salpêtrière (enter via Jardin Marie Curie)", "47 boulevard de l'Hôpital", "75013")
AMERIQUE_LATINE = addr("Maison de l'Amérique latine", "1 rue Saint-Dominique", "75007")
BASTILLE_DC = addr("Bastille Design Center", "74 boulevard Richard-Lenoir", "75011")
CONCORDE = addr("Place de la Concorde (temporary pavilions)", "Place de la Concorde", "75008")
GALERIE_JOSEPH = addr("Galerie Joseph", "116 rue de Turenne", "75003")
FLV = addr("Fondation Louis Vuitton", "8 avenue du Mahatma Gandhi", "75116")
BOURSE = addr("Bourse de Commerce – Pinault Collection", "2 rue de Viarmes", "75001")
PICASSO = addr("Musée national Picasso-Paris", "5 rue de Thorigny", "75003")
JDP = addr("Jeu de Paume, Jardin des Tuileries", "1 place de la Concorde", "75001")
MEP = addr("Maison Européenne de la Photographie (MEP)", "5/7 rue de Fourcy", "75004")
TOKYO = addr("Palais de Tokyo", "13 avenue du Président Wilson", "75116")
MAM = addr("Musée d'Art Moderne de Paris", "11 avenue du Président Wilson", "75116")
LAFAYETTE = addr("Lafayette Anticipations", "9 rue du Plâtre", "75004")
CARTIER = addr("Fondation Cartier pour l'art contemporain", "2 place du Palais-Royal", "75001")
PANTHEON = addr("Panthéon", "Place du Panthéon", "75005")
ORSAY = addr("Musée d'Orsay", "1 rue de la Légion d'Honneur", "75007")

S = {  # sources (official first)
 "ab_pr": "https://d2u3kfwd92fzu7.cloudfront.net/EN_ABP26_GLA_PR_1.pdf",
 "ab_story": "https://www.artbasel.com/stories/art-basel-paris-2026-gallery-list-announcement",
 "ab_visit": "https://www.artbasel.com/paris/visitor-information",
 "ab_petit": "https://www.artbasel.com/paris/public-program/petit-palais",
 "ab_clem": "https://www.artbasel.com/paris/public-program/place-clemenceau",
 "ab_perrin": "https://www.artbasel.com/paris/public-program/square-jean-perrin",
 "ab_nf": "https://www.artbasel.com/paris/public-program/jardin-nouvelle-france",
 "ab_troca": "https://www.artbasel.com/paris/public-program/parvis-droits-homme",
 "ab_winston": "https://www.artbasel.com/paris/public-program/avenue-winston-churchill",
 "ab_iena": "https://www.artbasel.com/paris/public-program/palais-iena",
 "ab_yanko": "https://www.artbasel.com/stories/kennedy-yanko-art-basel-paris-2026-mary-magdalene",
 "sp_offsite": "https://www.sortiraparis.com/en/what-to-visit-in-paris/exhibit-museum/guides/262814-art-basel-2026-the-off-site-exhibition-program-to-discover-in-paris",
 "sp_events": "https://www.sortiraparis.com/en/what-to-visit-in-paris/exhibit-museum/articles/152802-art-basel-paris-2026-the-events-and-meetings-in-paris-during-this-art-week",
 "sp_winston": "https://www.sortiraparis.com/en/what-to-visit-in-paris/exhibit-museum/articles/319777-art-basel-paris-2026-contemporary-artworks-transform-winston-churchill-avenue",
 "sp_augustins": "https://www.sortiraparis.com/en/what-to-visit-in-paris/exhibit-museum/articles/283304-art-basel-paris-2026-an-installation-exploring-memory-at-the-chapelle-des-petits-augustins",
 "sp_iena": "https://www.sortiraparis.com/en/what-to-visit-in-paris/exhibit-museum/articles/283340-art-basel-paris-2026-cinema-dance-and-sculpture-as-alice-diop-and-miu-miu-take-over-the-palais-d-iena",
 "nss_iena": "https://www.nssmag.com/en/art-design/46808/art-basel-paris-2026-miu-miu-alice-diop-geste-de-consolation",
 "ocula": "https://ocula.com/magazine/art-news/art-basel-paris-reveals-2026-programme/",
 "tan": "https://theartnewspaper.com/2026/09/22/emily-in-art-basel-paris-netflix-star-lead-french-fairs-weekend-rehang",
 "cite": "https://www.citedelarchitecture.fr/en?page=361",
 "agenda_yanko": "https://75.agendaculturel.fr/exposition/exposition-kennedy-yanco-1.html",
 "pi": "https://parisinternationale.com",
 "pi_press": "https://parisinternationale.com/press",
 "asianow": "https://asianowparis.com",
 "dm": "https://designmiami.com/fair/paris-2026",
 "akaa": "https://akaafair.com/infos-pratiques/",
 "akaa_tix": "https://my.weezevent.com/akaa-also-known-as-africa-2026",
 "offscreen": "https://offscreenparis.com/visiting",
 "ceramic": "https://ceramicartfair.com",
 "outsider": "https://www.outsiderparis.com",
 "moderne": "https://moderneartfair.com/informations/",
 "menart": "https://menart-fair.com/access/",
 "gp_cezanne": "https://www.grandpalais.fr/fr/programme/cezanne-et-nous",
 "flv_fayet": "https://www.fondationlouisvuitton.fr/fr/evenements/gustave-fayet-collectionneur-createur",
 "bdc": "https://www.pinaultcollection.com/en/press",
 "bdc_rm": "https://www.pinaultcollection.com/en/node/2174",
 "picasso": "https://www.museepicassoparis.fr/fr/agenda/kurt-schwitters-le-chaos-monde-1918-1948/",
 "jdp": "https://jeudepaume.org/en/evenement/35043/",
 "mep": "https://www.mep-fr.org/wp-content/uploads/2026/07/cp_pennfashion_eng_mep.pdf",
 "tokyo": "https://www.paris.fr/evenements/toi-et-ta-bande-exposition-collective-117953",
 "mam": "https://www.mam.paris.fr/fr/expositions-en-cours",
 "lafayette_yn": "https://www.lafayetteanticipations.com/fr/exposition/yu-nishimura",
 "lafayette_hf": "https://www.lafayetteanticipations.com/fr/exposition/helene-fauquet",
 "cartier": "https://www.fondationcartier.com/programme/exposition/le-temps-des-recoltes-ibrahim-mahama",
 "pompidou": "https://www.centrepompidou.fr/fr/programme/agenda/evenement/zfJ5Enx",
 "orsay": "https://www.musee-orsay.fr/fr/programme/agenda/expositions/jenny-holzer-jai-vu",
}

E = []
def ev(slug, cat, name, desc, start, end, loc, uris, srcs, status=SCHEDULED, notes=None):
    E.append(dict(slug=slug, cat=cat, name=name, desc=desc, start=start, end=end,
                  loc=loc, uris=uris, srcs=srcs, status=status, notes=notes))

# ---- Umbrella
ev("paris-art-week-2026", "umbrella", "Paris Art Week 2026",
   "The week of art fairs, public installations, talks and museum openings around Art Basel Paris at the Grand Palais. Umbrella record: individual events in this collection reference the same week.",
   "2026-10-20T00:00:00+02:00", "2026-10-25T23:59:00+01:00", None,
   [uri("https://www.artbasel.com/paris", "Art Basel Paris")],
   ["ab_pr", "sp_offsite"], notes="Unofficial umbrella record; not published by Art Basel.")

# ---- Art Basel Paris
ev("art-basel-paris-2026", "fair", "Art Basel Paris 2026",
   "Fifth edition, the first under director Karim Crippa: 211 exhibitors from 41 countries and territories across the Galeries, Emergence and Premise sectors. Avant-Première Tue 20 (invitation only); Preview Days Wed 21 10:00–20:00 and Thu 22 11:00–14:00 (invitation); Vernissage Thu 22 14:00–20:00 (Vernissage ticket or invitation); public days Fri 23–Sun 25, 11:00–19:00. Oh La La!, the fair's one-day rehang with a guest from outside the art world, runs Fri 23 and Sat 24. Ticketed.",
   "2026-10-21T10:00:00+02:00", "2026-10-25T19:00:00+01:00", GRAND_PALAIS_FAIR,
   [uri("https://www.artbasel.com/paris", "Art Basel Paris"),
    uri("https://www.artbasel.com/paris/tickets", "Tickets")],
   ["ab_pr", "ab_story", "ab_visit"],
   notes="Ticket prices not confirmed on artbasel.com (secondary listings give €47 day / €30 reduced), so left out. Oh La La! 2026 lead reported as Philippine Leroy-Beaulieu (Ocula, The Art Newspaper) but not yet named by Art Basel — left out. The 2025 names (Loïc Prigent, Edward Enninful) do not apply to 2026.")
ev("art-basel-paris-conversations-2026", "talks", "Art Basel Paris Conversations 2026",
   "The fair's talks programme, moved this year to the Grand Palais auditorium. Free to attend; booking advised. Art Basel has said the full line-up is still to be announced.",
   "2026-10-22T00:00:00+02:00", "2026-10-24T23:59:00+02:00", GRAND_PALAIS_FAIR,
   [uri("https://www.artbasel.com/paris/conversations", "Conversations")],
   ["ab_pr", "sp_events", "tan"],
   notes="Venue and free access from the official press release. The Thu 22–Sat 24 days and session names come from secondary sources only and disagree with each other (e.g. a Louvre panel's speakers), so no sessions are listed yet. Update when artbasel.com publishes the programme.")

# ---- Satellite fairs
ev("paris-internationale-2026", "fair", "Paris Internationale 2026",
   "12th edition of the gallery-founded fair for emerging and experimental positions, this year in a new canal-side space on the Quai de Valmy. Preview Mon 19 October.",
   "2026-10-20T00:00:00+02:00", "2026-10-24T23:59:00+02:00", VALMY,
   [uri("https://parisinternationale.com", "Paris Internationale")],
   ["pi", "pi_press"],
   notes="Daily hours not published. Admission conflicts on the official site: the press page says free and open to all, the info page says accreditation only. Postcode 75010 inferred from the street address.")
ev("asia-now-2026", "fair", "Asia Now 2026",
   "12th edition of the Paris fair for contemporary art from Asia and its diasporas, with galleries, curated projects, film and performance across La Monnaie de Paris. VIP preview Mon 19 October; open daily 11:00–19:00. Ticketed.",
   "2026-10-20T11:00:00+02:00", "2026-10-24T19:00:00+02:00", MONNAIE,
   [uri("https://asianowparis.com", "Asia Now")],
   ["asianow"],
   notes="Some listings give 22–26 October; the fair's own site gives 20–24. Price not shown on the official ticket page.")
ev("design-miami-paris-2026", "fair", "Design Miami.Paris 2026",
   "Fourth Paris edition of the collectible design fair, in an 18th-century hôtel particulier in the 7th. Preview Tue 20 (members and collectors). Public days Wed 21–Sun 25: Wed–Sat 11:00–19:00, Sun 11:00–18:00.",
   "2026-10-21T11:00:00+02:00", "2026-10-25T18:00:00+01:00", MAISONS,
   [uri("https://designmiami.com/fair/paris-2026", "Design Miami.Paris")],
   ["dm"],
   notes="Some listings give 22–26 October; the fair's own site gives 20–25 with the 20th as preview. No ticket price published.")
ev("akaa-2026", "fair", "AKAA – Also Known As Africa 2026",
   "11th edition of the art and design fair centred on Africa and its diasporas. Preview Thu 22 (invitation). Fri 23–Sat 24 12:00–20:00, Sun 25 12:00–18:00. €16, reduced €11, under-12s free.",
   "2026-10-23T12:00:00+02:00", "2026-10-25T18:00:00+01:00", CARREAU,
   [uri("https://akaafair.com", "AKAA")],
   ["akaa", "akaa_tix"])
ev("offscreen-paris-2026", "fair", "OFFSCREEN Paris 2026",
   "Fifth edition of the fair for photography and the moving image, with about 30 artists in a 17th-century chapel at the Salpêtrière. Preview Mon 19 (invitation). Tue–Sat 11:00–19:00, Sun 11:00–18:00. €12, students €8 (free on Wed 21), under-12s free.",
   "2026-10-20T11:00:00+02:00", "2026-10-25T18:00:00+01:00", SALPETRIERE,
   [uri("https://offscreenparis.com", "OFFSCREEN")],
   ["offscreen"])
ev("ceramic-art-fair-paris-2026", "fair", "Ceramic Art Fair Paris 2026",
   "Galleries showing ceramics and glass, from historical pieces to new work. Preview Tue 20. Wed–Sat 11:00–20:00, Thu until 21:00, Sun 11:00–17:00.",
   "2026-10-21T11:00:00+02:00", "2026-10-25T17:00:00+01:00", AMERIQUE_LATINE,
   [uri("https://ceramicartfair.com", "Ceramic Art Fair")],
   ["ceramic"],
   notes="No ticket price published.")
ev("outsider-paris-2026", "fair", "Outsider' Paris 2026",
   "Fourth edition of the fair for art brut and outsider art: 18 galleries from 8 countries, with a side programme at the Halle Saint-Pierre. Vernissage Tue 20 from 17:00. Wed–Sat 11:00–20:00, Sun 11:00–17:00. Free.",
   "2026-10-21T11:00:00+02:00", "2026-10-25T17:00:00+01:00", BASTILLE_DC,
   [uri("https://www.outsiderparis.com", "Outsider' Paris")],
   ["outsider"])
ev("moderne-art-fair-2026", "fair", "Moderne Art Fair 2026",
   "Modern and contemporary art in temporary pavilions on the Place de la Concorde. Preview and vernissage Wed 21. Thu–Sat 11:00–20:00, Sun 11:00–18:00.",
   "2026-10-22T11:00:00+02:00", "2026-10-25T18:00:00+01:00", CONCORDE,
   [uri("https://moderneartfair.com", "Moderne Art Fair")],
   ["moderne"],
   notes="Ticket page mixes 2025 and 2026 content (€25 / €15 students), so prices are left out.")
ev("menart-fair-2026", "fair", "Menart Fair 2026",
   "Seventh edition of the fair for art from the Middle East and North Africa and its diasporas, about 40 galleries, themed 'Where is Home?'. Preview Thu 22. Fri–Sat 12:00–20:00, Sun 12:00–19:00. €16, reduced €11.",
   "2026-10-23T12:00:00+02:00", "2026-10-25T19:00:00+01:00", GALERIE_JOSEPH,
   [uri("https://menart-fair.com", "Menart Fair")],
   ["menart"])

# ---- Art Basel Paris Public Program (free unless noted)
ev("petit-palais-cosima-von-bonin", "commission", "Cosima von Bonin, 'Dollys & Beaux' at the Petit Palais",
   "Art Basel Paris Public Program: new soft sculptures by Cosima von Bonin, presented by Petzel, Gala and Neu. Free. 10:00–18:00, until 20:00 on Fri 23 and Sat 24.",
   "2026-10-20T10:00:00+02:00", "2026-10-25T18:00:00+01:00", PETIT_PALAIS,
   [uri("https://www.artbasel.com/paris/public-program/petit-palais", "Art Basel Public Program")],
   ["ab_petit"],
   notes="Not to be confused with the Petit Palais's own paid show, Prune Nourry's carte blanche, opening the same day.")
ev("place-clemenceau-robert-indiana-love-wall", "commission", "Robert Indiana, 'LOVE Wall' on Place Clemenceau",
   "Art Basel Paris Public Program: Indiana's Cor-Ten steel LOVE Wall (1966–2006), presented by Almine Rech, outdoors between the Champs-Élysées and Avenue Winston Churchill. Free.",
   "2026-10-20T00:00:00+02:00", "2026-10-25T23:59:00+01:00", CLEMENCEAU,
   [uri("https://www.artbasel.com/paris/public-program/place-clemenceau", "Art Basel Public Program")],
   ["ab_clem"])
ev("square-jean-perrin-lionel-sabatte", "commission", "Lionel Sabatté, 'Champs d'Oiseaux' in Square Jean Perrin",
   "Art Basel Paris Public Program: new bronze work by Lionel Sabatté, presented by Ceysson & Bénétière, in the garden beside the Grand Palais. Free.",
   "2026-10-20T00:00:00+02:00", "2026-10-25T23:59:00+01:00", JEAN_PERRIN,
   [uri("https://www.artbasel.com/paris/public-program/square-jean-perrin", "Art Basel Public Program")],
   ["ab_perrin"])
ev("jardin-nouvelle-france-boz-deseo-garden", "commission", "Boz Deseo Garden, 'Celia, or the Misfortunes of Virtue'",
   "Art Basel Paris Public Program: painted steel sculptures by Boz Deseo Garden, presented by Petrine, in the small garden behind the Grand Palais. Free.",
   "2026-10-20T00:00:00+02:00", "2026-10-25T23:59:00+01:00", NOUVELLE_FRANCE,
   [uri("https://www.artbasel.com/paris/public-program/jardin-nouvelle-france", "Art Basel Public Program")],
   ["ab_nf"])
ev("trocadero-tracey-emin", "commission", "Tracey Emin at the Trocadéro",
   "Art Basel Paris Public Program: three bronzes by Tracey Emin — 'I lay here for you' (2018), 'I Followed You to the End' (2024) and 'I Will Not Be Alone' (2025) — presented by White Cube on the Parvis des Droits de l'Homme, facing the Eiffel Tower. Free.",
   "2026-10-14T00:00:00+02:00", "2026-11-01T23:59:00+01:00", TROCADERO,
   [uri("https://www.artbasel.com/paris/public-program/parvis-droits-homme", "Art Basel Public Program")],
   ["ab_troca"], notes="End is after the CEST→CET change (25 Oct), hence +01:00.")
ev("avenue-winston-churchill-sculpture-2026", "commission", "Sculpture on Avenue Winston Churchill",
   "Art Basel Paris Public Program: the pedestrianised avenue between the Grand Palais and the Petit Palais becomes an open-air sculpture route. Free.",
   "2026-10-20T00:00:00+02:00", "2026-10-25T23:59:00+01:00", WINSTON,
   [uri("https://www.artbasel.com/paris/public-program/avenue-winston-churchill", "Art Basel Public Program")],
   ["ab_winston", "sp_winston", "ocula"],
   notes="2026 artist list not confirmed: the official page still shows the 2025 line-up. Press reports name works by Niki de Saint Phalle and Marcello Maloberti among others. Add names when artbasel.com updates.")
ev("beaux-arts-kutlug-ataman", "commission", "Kutluğ Ataman at the Chapelle des Petits-Augustins",
   "Shown during Art Basel Paris week: a video installation of some forty screens carrying portraits and testimony from Küba, a vanished community near Istanbul. Free. 10:00–19:00.",
   "2026-10-20T10:00:00+02:00", "2026-10-25T19:00:00+01:00", PETITS_AUGUSTINS,
   [uri("https://beauxartsparis.fr", "Beaux-Arts de Paris")],
   ["sp_augustins"],
   notes="Secondary source only (Sortiraparis); no artbasel.com page found and no work title published. Check before publishing.")
ev("palais-iena-miu-miu-alice-diop", "commission", "Miu Miu presents Alice Diop: 'Geste de Consolation'",
   "Art Basel Paris Public Program, with Miu Miu: the film-maker Alice Diop's first exhibition, on how Black women are represented, with works by Zanele Muholi, Simone Leigh and Mary Lee Bendolph, choreography by Nadia Beugré, readings and music. Free; guided tours bookable on miumiu.com from 8 October.",
   "2026-10-21T00:00:00+02:00", "2026-10-25T23:59:00+01:00", IENA,
   [uri("https://www.artbasel.com/paris/public-program/palais-iena", "Art Basel Public Program"),
    uri("https://www.miumiu.com", "Miu Miu")],
   ["ab_iena", "sp_iena", "nss_iena"],
   notes="The official page names Alice Diop but gave no details; content from Sortiraparis and NSS. Opening hours and performance times not yet published.")
ev("cite-architecture-kennedy-yanko", "commission", "Kennedy Yanko: 'Ce qui nous rassemble'",
   "Art Basel Paris Public Program: Kennedy Yanko's sculptures shown among the museum's plaster casts of French monuments. Included in the museum ticket. 11:00–19:00, until 21:00 on Thursdays, closed Tuesdays.",
   "2026-10-16T00:00:00+02:00", "2027-01-03T23:59:00+01:00", CITE_ARCHI,
   [uri("https://www.citedelarchitecture.fr", "Cité de l'architecture et du patrimoine")],
   ["ab_yanko", "cite", "agenda_yanko"],
   notes="Part of the Public Program per artbasel.com; hours and price from a secondary listing. Unlike the rest of the programme, this one is paid.")

# ---- Institutional exhibitions
def show(slug, name, desc, s, e, loc, url, label, srcs, notes=None):
    ev(slug, "exhibition", name, desc, s, e, loc, [uri(url, label)], srcs, notes=notes)

show("grand-palais-cezanne-et-nous", "Cézanne et nous / Cézanne and Us",
     "About 180 works tracing how Cézanne was taken up by later artists, from Gauguin, Matisse, Picasso and Mondrian to Joan Mitchell, Bridget Riley and Peter Doig — in the same building as the fair. €19, reduced €16.",
     "2026-09-23T00:00:00+02:00", "2027-01-17T23:59:00+01:00", GRAND_PALAIS_EXPO,
     "https://www.grandpalais.fr/fr/programme/cezanne-et-nous", "Grand Palais", ["gp_cezanne"],
     notes="Opening days conflict on grandpalais.fr (exhibition page says Tue–Sun; practical info lists no closed day).")
show("flv-gustave-fayet", "Gustave Fayet, collectionneur – créateur. Icônes de l'art moderne",
     "The Fondation's reopening show: the collector and artist Gustave Fayet, his own work beside the Van Gogh, Gauguin and Redon he collected, including Van Gogh's 'Self-Portrait with Bandaged Ear'. Closed Tuesdays.",
     "2026-10-09T00:00:00+02:00", "2027-03-08T23:59:00+01:00", FLV,
     "https://www.fondationlouisvuitton.fr/fr/evenements/gustave-fayet-collectionneur-createur", "Fondation Louis Vuitton", ["flv_fayet"])
show("bourse-de-commerce-remember-me", "Remember Me",
     "Photography's bicentenary from the Pinault Collection: about 700 works by more than 70 photographers, from Le Gray and Man Ray to Cindy Sherman and Wolfgang Tillmans, hung across eras. Barbara Kruger takes over the Rotunda alongside. €15, reduced €10; closed Tuesdays; Fridays until 21:00.",
     "2026-10-07T00:00:00+02:00", "2027-01-18T23:59:00+01:00", BOURSE,
     "https://www.pinaultcollection.com/en/node/2174", "Bourse de Commerce", ["bdc_rm", "bdc"])
show("picasso-kurt-schwitters", "Kurt Schwitters. Le chaos-monde 1918–1948",
     "Retrospective of more than 300 works by Schwitters — painter, poet, typographer and collagist — set against Picasso. Tue–Sun 9:30–18:00. €16, reduced €12.",
     "2026-10-06T00:00:00+02:00", "2027-02-07T23:59:00+01:00", PICASSO,
     "https://www.museepicassoparis.fr/fr/agenda/kurt-schwitters-le-chaos-monde-1918-1948/", "Musée Picasso", ["picasso"])
show("jeu-de-paume-stan-douglas", "Stan Douglas. Parallax",
     "Retrospective of about 40 films, video installations and photographs since the late 1980s, on how technology shapes images and memory. Opens on the first day of the week. €14.",
     "2026-10-20T00:00:00+02:00", "2027-01-10T23:59:00+01:00", JDP,
     "https://jeudepaume.org/en/evenement/35043/", "Jeu de Paume", ["jdp"],
     notes="Official hours page incomplete; closed Mondays per secondary listings.")
show("mep-penn-fashion", "Penn & Fashion",
     "Irving Penn's fashion photography from 1947 to 2008, much of it for Vogue, including his work with Issey Miyake. Wed–Sun; closed Mon–Tue. €13, reduced €8.",
     "2026-09-30T00:00:00+02:00", "2027-01-17T23:59:00+01:00", MEP,
     "https://www.mep-fr.org", "MEP", ["mep"])
show("palais-de-tokyo-toi-et-ta-bande", "Toi et ta bande. Exposition collective",
     "Group show of about 30 works by artists and collectives living outside the big cities, on ways of living and working together. Closed Tuesdays; open until midnight on Thursdays.",
     "2026-10-21T00:00:00+02:00", "2027-02-14T23:59:00+01:00", TOKYO,
     "https://palaisdetokyo.com", "Palais de Tokyo", ["tokyo"],
     notes="Secondary source only (paris.fr); palaisdetokyo.com could not be read. Check before publishing.")
show("mam-kerry-james-marshall", "Kerry James Marshall: The Histories",
     "Marshall's first exhibition in France: about 70 works across four decades. Tue–Sun 10:00–18:00, Thursdays until 21:30. €17, reduced €15.",
     "2026-09-18T00:00:00+02:00", "2027-01-24T23:59:00+01:00", MAM,
     "https://www.mam.paris.fr/fr/expositions-en-cours", "Musée d'Art Moderne de Paris", ["mam"])
show("mam-prix-marcel-duchamp-2026", "Prix Marcel Duchamp 2026",
     "The four nominees — Joël Andrianomearisoa, Brognon Rollin, Laura Henno and Josèfa Ntjam — shown with the Centre Pompidou. The winner is announced on Thursday 22 October, mid-week.",
     "2026-10-02T00:00:00+02:00", "2027-02-07T23:59:00+01:00", MAM,
     "https://www.mam.paris.fr/fr/expositions-en-cours", "Musée d'Art Moderne de Paris", ["mam"],
     notes="Price not confirmed.")
show("lafayette-anticipations-autumn-2026", "Yu Nishimura and Hélène Fauquet at Lafayette Anticipations",
     "Two openings: Yu Nishimura's first French institutional solo show, 'Towards a Sea', about 50 dreamlike landscapes; and Hélène Fauquet's 'Vivresse', sculpture built around shells and bubbles. Mungo Thomson's bronze snowman stands in the courtyard until 29 November. Free. Wed–Sun 11:00–19:00.",
     "2026-10-21T00:00:00+02:00", "2027-01-03T23:59:00+01:00", LAFAYETTE,
     "https://www.lafayetteanticipations.com", "Lafayette Anticipations", ["lafayette_yn", "lafayette_hf"])
show("fondation-cartier-ibrahim-mahama", "Ibrahim Mahama: Le Temps des récoltes",
     "Ibrahim Mahama and nine collaborators, including his 'Parliament of Ghosts', in the Fondation's new Palais-Royal building. Opens Thursday 22 October. Tue–Sun 11:00–19:00, Fridays until 22:00. €15, reduced €10.",
     "2026-10-22T00:00:00+02:00", "2027-02-28T23:59:00+01:00", CARTIER,
     "https://www.fondationcartier.com/programme/exposition/le-temps-des-recoltes-ibrahim-mahama", "Fondation Cartier", ["cartier"])
show("pantheon-vies-minuscules", "Vies minuscules",
     "A Centre Pompidou show at the Panthéon while the Pompidou is closed for renovation: about 30 artists, from Kupka to Jumana Manna, on lives at the margins of history. Daily 10:00–18:00. €16, reduced €13.",
     "2026-09-24T00:00:00+02:00", "2027-01-31T23:59:00+01:00", PANTHEON,
     "https://www.centrepompidou.fr/fr/programme/agenda/evenement/zfJ5Enx", "Centre Pompidou", ["pompidou"])
show("orsay-jenny-holzer", "Jenny Holzer. J'ai vu",
     "Holzer's text works drawn from Orsay's collections — LED pieces, engraved stone benches and projections — opening on the first day of the week. Tue–Sun 9:30–18:00, Thursdays until 21:45. €16, reduced €13.",
     "2026-10-20T00:00:00+02:00", "2027-02-21T23:59:00+01:00", ORSAY,
     "https://www.musee-orsay.fr/fr/programme/agenda/expositions/jenny-holzer-jai-vu", "Musée d'Orsay", ["orsay"],
     notes="Façade projections 18–22 Oct, 19:00–23:00, are from a secondary source and not listed separately.")

# ---- Build
DT = re.compile(r"^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d+)?(Z|[+-]\d{2}:\d{2})$")
# Paris offsets: +02:00 before 03:00 local on 25 Oct 2026, +01:00 after.
SWITCH = "2026-10-25T01:00:00Z"
from datetime import datetime, timezone
def offset_ok(iso):
    d = datetime.fromisoformat(iso)
    want = "+02:00" if d.astimezone(timezone.utc) < datetime.fromisoformat(SWITCH.replace("Z", "+00:00")) else "+01:00"
    return iso.endswith(want)

base_us = int(time.mktime(time.strptime("2026-10-07 12:00:00", "%Y-%m-%d %H:%M:%S"))) * 1_000_000
random.seed(2026_10_20)
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
    for k in ("startsAt", "endsAt"):
        if k in rec: assert offset_ok(rec[k]), ("wrong Paris offset", e["slug"], k, rec[k])
    if "endsAt" in rec: assert rec["endsAt"] > rec["startsAt"] or rec["endsAt"][:10] > rec["startsAt"][:10], e["slug"]
    assert len(rec["description"]) <= 3000 and len(rec["name"]) <= 300, e["slug"]
    rk = tid(base_us + i * 1000, clock)
    entry = {"slug": e["slug"], "category": e["cat"], "rkey": rk,
             "atUri": f"at://{REPO}/{COLL}/{rk}",
             "sources": [S[s] for s in e["srcs"]], "record": rec}
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
    "title": "Paris Art Week 2026 — CultureBlocs event dataset",
    "name": "Paris Art Week 2026",
    "directory": "paris-art-week",
    "tag": "paris-art-week-2026",
    "short": "paw",   # printed QR cards: cultureblocs.com/w/paw/<rkey> (redirect in vercel.json)
    "tz": "Europe/Paris",
    "cardLine": "Fairs, free installations, talks and exhibitions, day by day",
    "repo": REPO,
    "collection": COLL,
    "lexicon": "https://github.com/lexicon-community/lexicon/blob/main/community/lexicon/calendar/event.json",
    "generated": "2026-10-07",
    "status": "draft — review flagged notes before publishing",
    "howToUse": "Publish each entry's `record` with com.atproto.repo.putRecord (repo=cultureblocs.com, collection, rkey). Everything outside `record` is sidecar metadata for the site and is not published.",
    "timezone": "Times are Europe/Paris; CEST (+02:00) until 03:00 on 25 Oct 2026, CET (+01:00) after — so the fair's last day, Sunday 25 October, is +01:00. All-day/date-only events use 00:00–23:59 because the lexicon has no all-day flag.",
    "checked": "Dates checked on each organiser's own website on 7 October 2026. Entries with `notes` rely partly on secondary sources or have open questions.",
    "omitted": "7 Rue Froissart, Place des Vosges and Upstairs Art Fair (no 2026 edition confirmed on their sites); Art Basel Paris Conversations sessions (line-up not yet announced); auction-house sales (Sotheby's 'Modernités' 23 Oct, Phillips 21 Oct, Artcurial 24 Oct; Christie's dates not found).",
    "unofficial": "Independent listing by CultureBlocs; not affiliated with or endorsed by Art Basel or any listed organiser.",
    "count": len(out),
    **({"did": did} if did else {}),
  },
  "records": out,
}
with open(OUT, "w", encoding="utf-8") as f:
    json.dump(doc, f, ensure_ascii=False, indent=2)
print(len(out), "records ->", OUT)
from collections import Counter
print(Counter(o["category"] for o in out))
print(sum(1 for o in out if "notes" in o), "with notes")
