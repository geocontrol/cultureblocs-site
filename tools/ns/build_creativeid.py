#!/usr/bin/env python3
"""Build the CreativeID vocabulary: ns/creativeid.{html,ttl,jsonld}.

One table of terms (TERMS below) is the source; the page, the Turtle and the
JSON-LD are all generated from it, so they can't disagree. Run from the site
root:

    python3 tools/ns/build_creativeid.py          # write the three files
    python3 tools/ns/build_creativeid.py --check  # fail if they are stale

The namespace IRI is https://www.cultureblocs.com/ns/creativeid# and
/ns/creativeid answers with HTML, Turtle or JSON-LD by Accept header
(rewrites in vercel.json). The terms are used by CreativeID Studio
(github.com/geocontrol/creativeid-studio) and read by the CreativeID
Aggregator.

Rules for changing this file: terms are only ever added. A published term
keeps its IRI and its meaning; if one stops being useful, set its status to
"deprecated" and say what to use instead. Never delete a term.
"""

from __future__ import annotations

import html
import json
import sys
from pathlib import Path

NS = "https://www.cultureblocs.com/ns/creativeid#"
DOC = "https://www.cultureblocs.com/ns/creativeid"
VERSION = "0.1"
ISSUED = "2026-10-20"
MODIFIED = "2026-10-20"

SCHEMA = "https://schema.org/"
PREFIXES = {
    "creativeid": NS,
    "schema": SCHEMA,
    "rdf": "http://www.w3.org/1999/02/22-rdf-syntax-ns#",
    "rdfs": "http://www.w3.org/2000/01/rdf-schema#",
    "owl": "http://www.w3.org/2002/07/owl#",
    "xsd": "http://www.w3.org/2001/XMLSchema#",
    "dcterms": "http://purl.org/dc/terms/",
    "vs": "http://www.w3.org/2003/06/sw-vocab-status/ns#",
}

LEX = "https://www.cultureblocs.com/lexicons.html"

# Each term: name, kind (Class | Property), label, comment (one or two plain
# sentences: what it means), plus optional:
#   sub      - superclass (CURIE)
#   on       - classes it is used on (schema:domainIncludes)
#   value    - what its value is (schema:rangeIncludes; "IRI" or "text" for the page)
#   lexicon  - the matching AT Protocol field, as (label, anchor on lexicons.html)
#   note     - extra guidance shown on the page only
#   local    - True for terms that only appear in the file on the creative's computer
#   status   - "stable" (default), "testing" or "deprecated"
TERMS: list[dict] = [
    # ---------------------------------------------------------------- classes
    dict(
        name="Persona", kind="Class", label="Persona",
        comment="A name someone works under, described the way they choose. "
                "It is not a legal identity: one person can have several personas, "
                "and a duo, band or collective can share one.",
        note="Published alongside schema:Person. Personas are never linked to each "
             "other in anything published.",
        lexicon=("com.cultureblocs.creative.profile", "creative-profile"),
    ),
    dict(
        name="Work", kind="Class", label="Work", sub="schema:CreativeWork",
        comment="Something a persona made, performed, showed, curated or released: "
                "an object, an event, a recording, an exhibition, a text.",
        note="Published alongside schema:CreativeWork. Saying it is yours is the claim; "
             "nobody has to approve it.",
        lexicon=("com.cultureblocs.creative.work", "creative-work"),
    ),
    dict(
        name="Connection", kind="Class", label="Connection",
        comment="One persona's own statement about a party or a record: I performed at, "
                "exhibited with, curated, am a member of, am represented by. "
                "It is one-sided by design.",
        note="When the other side makes the matching statement, a reader can see that "
             "the two agree. A connection without a match is ordinary, not doubtful.",
        lexicon=("com.cultureblocs.creative.connection", "creative-connection"),
    ),
    dict(
        name="Credit", kind="Class", label="Credit",
        comment="A name on a work: who else was involved, optionally with their DID "
                "and what they did.",
        lexicon=("com.cultureblocs.defs#creditRef", "defs"),
    ),
    # ------------------------------------------------------------- properties
    dict(
        name="completionDate", kind="Property", label="completion date",
        comment="When the work was made or first shown, in the creator's own words: "
                "“2019”, “spring 2024”, “2021–2023”.",
        on=["creativeid:Work"], value=["xsd:string"],
        note="Deliberately free text, because creative dates are often approximate or "
             "spans. schema:dateCreated is kept for when the record itself was made.",
        lexicon=("creative.work · completionDate", "creative-work"),
    ),
    dict(
        name="credits", kind="Property", label="credits",
        comment="The people and groups credited on a work.",
        on=["creativeid:Work"], value=["creativeid:Credit"],
        lexicon=("creative.work · credits", "creative-work"),
    ),
    dict(
        name="links", kind="Property", label="links",
        comment="Web pages about a persona or a work: a portfolio, a shop, a gallery "
                "page, a review. Each is a schema:WebPage with a url and an optional name.",
        on=["creativeid:Persona", "creativeid:Work"], value=["schema:WebPage"],
        note="Not schema:sameAs, which would say the page <em>is</em> the persona; "
             "not schema:url, which holds one main address.",
        lexicon=("creative.profile / creative.work · links", "creative-profile"),
    ),
    dict(
        name="subject", kind="Property", label="subject",
        comment="Who or what a connection is about. Either a party, given by "
                "creativeid:did (and optionally a name), or a specific record, given by "
                "creativeid:uri (and optionally creativeid:cid).",
        on=["creativeid:Connection"],
        lexicon=("creative.connection · subject", "creative-connection"),
    ),
    dict(
        name="relationship", kind="Property", label="relationship",
        comment="What the connection says, as a short word or phrase.",
        on=["creativeid:Connection"], value=["xsd:string"],
        note="Suggested values: <code>created</code>, <code>collaborated_on</code>, "
             "<code>performed</code>, <code>exhibited</code>, <code>curated</code>, "
             "<code>released</code>, <code>represented_by</code>, <code>attests_to</code>, "
             "<code>references</code>, <code>member_of</code>. Any other value is valid; "
             "a practice that needs a new word doesn’t need a schema change.",
        lexicon=("creative.connection · relationship", "creative-connection"),
    ),
    dict(
        name="role", kind="Property", label="role",
        comment="The part someone played, in their own words: “vocals”, "
                "“lighting design”, “co-curator”.",
        on=["creativeid:Connection", "creativeid:Credit"], value=["xsd:string"],
        lexicon=("creative.connection · role; defs#creditRef · role", "creative-connection"),
    ),
    dict(
        name="note", kind="Property", label="note",
        comment="A short free-text note on a connection.",
        on=["creativeid:Connection"], value=["xsd:string"],
        lexicon=("creative.connection · note", "creative-connection"),
    ),
    dict(
        name="did", kind="Property", label="DID",
        comment="The decentralised identifier (DID) of a party: a persona's AT Protocol "
                "account, a venue, a collective. Written as an IRI, e.g. "
                "did:plc:… or did:web:…",
        on=["creativeid:Credit", "schema:Place"], value=["IRI"],
        note="Also used on the subject of a connection. A DID is what lets a reader "
             "match two sides of a connection.",
        lexicon=("defs#didRef / #creditRef / #placeRef · did", "defs"),
    ),
    dict(
        name="uri", kind="Property", label="record URI",
        comment="The address of a specific record, normally an at:// URI, used as the "
                "subject of a connection about that record.",
        value=["IRI"],
        lexicon=("defs#strongRef · uri", "defs"),
    ),
    dict(
        name="cid", kind="Property", label="content identifier",
        comment="The CID of the record named by creativeid:uri, pinning the exact "
                "version that was referred to.",
        value=["xsd:string"],
        note="If the record is edited later its CID changes, so a reader can say "
             "“changed since confirmed” without anyone having to police it.",
        lexicon=("defs#strongRef · cid", "defs"),
    ),
    # ----------------------------------------------------- local-only properties
    dict(
        name="private", kind="Property", label="private details", local=True,
        comment="Details the creative keeps for themselves (legal name, agent's phone, "
                "anything else). Stored only in the persona file on their computer.",
        on=["creativeid:Persona"],
    ),
    dict(
        name="publications", kind="Property", label="publications", local=True,
        comment="Where and when this persona has been published, so republishing "
                "updates the same records.",
    ),
    dict(
        name="personaId", kind="Property", label="persona id", local=True,
        comment="The persona's local identifier and file name in the studio.",
    ),
    dict(
        name="schemaVersion", kind="Property", label="schema version", local=True,
        comment="The version of the local file format, used to upgrade older files.",
        value=["xsd:integer"],
    ),
]

# schema.org terms CreativeID uses directly, with what they hold. Page only.
SCHEMA_TERMS = [
    ("schema:name", "Persona, Work, Credit, Place, a connection's subject",
     "the name worked under; a title"),
    ("schema:description", "Persona, Work", "about; a description"),
    ("schema:knowsAbout", "Persona", "disciplines, in the creative's own words"),
    ("schema:homeLocation", "Persona", "where they're based (a schema:Place)"),
    ("schema:identifier", "Persona, Work",
     "identifiers elsewhere (ISNI, ORCID, Wikidata…) as schema:PropertyValue"),
    ("schema:url", "Work", "the work's main page"),
    ("schema:keywords", "Work", "tags"),
    ("schema:dateCreated / dateModified", "every node",
     "when the record was first made and last changed (xsd:dateTime)"),
]


def iri(curie: str) -> str:
    if curie in ("IRI",):
        return "http://www.w3.org/2000/01/rdf-schema#Resource"
    prefix, local = curie.split(":", 1)
    return PREFIXES[prefix] + local


def status(t: dict) -> str:
    return t.get("status", "testing" if t.get("local") else "stable")


def plain(s: str) -> str:
    """Strip the little HTML the notes use, for RDF literals."""
    for a, b in (("<em>", ""), ("</em>", ""), ("<code>", ""), ("</code>", "")):
        s = s.replace(a, b)
    return s


def comment_of(t: dict) -> str:
    c = t["comment"]
    if t.get("note"):
        c += " " + plain(t["note"])
    if t.get("local"):
        c += " Never published: it appears only in the file on the creative's own computer."
    return c


# ------------------------------------------------------------------- RDF model
def triples() -> list[tuple[str, str, object]]:
    """(subject IRI, predicate IRI, object) where object is ('iri', x) or ('lit', x, datatype|None)."""
    P = lambda c: iri(c)  # noqa: E731
    out: list[tuple[str, str, object]] = []
    onto = DOC
    out += [
        (onto, P("rdf:type"), ("iri", P("owl:Ontology"))),
        (onto, P("dcterms:title"), ("lit", "CreativeID vocabulary", None)),
        (onto, P("dcterms:description"), ("lit",
            "Terms for describing a creative persona, its works and its connections, "
            "for any creative or cultural practice. Used with schema.org; mirrors the "
            "com.cultureblocs.creative.* AT Protocol lexicons.", None)),
        (onto, P("dcterms:creator"), ("lit", "CultureBlocs", None)),
        (onto, P("dcterms:issued"), ("lit", ISSUED, P("xsd:date"))),
        (onto, P("dcterms:modified"), ("lit", MODIFIED, P("xsd:date"))),
        (onto, P("owl:versionInfo"), ("lit", VERSION, None)),
        (onto, P("rdfs:seeAlso"), ("iri", LEX)),
        (onto, P("rdfs:seeAlso"), ("iri", "https://github.com/geocontrol/creativeid-studio")),
    ]
    for t in TERMS:
        s = NS + t["name"]
        kind = P("rdfs:Class") if t["kind"] == "Class" else P("rdf:Property")
        out += [
            (s, P("rdf:type"), ("iri", kind)),
            (s, P("rdfs:label"), ("lit", t["label"], None)),
            (s, P("rdfs:comment"), ("lit", comment_of(t), None)),
            (s, P("rdfs:isDefinedBy"), ("iri", onto)),
            (s, P("vs:term_status"), ("lit", status(t), None)),
        ]
        if t.get("sub"):
            out.append((s, P("rdfs:subClassOf"), ("iri", iri(t["sub"]))))
        for c in t.get("on", []):
            out.append((s, P("schema:domainIncludes"), ("iri", iri(c))))
        for c in t.get("value", []):
            out.append((s, P("schema:rangeIncludes"), ("iri", iri(c))))
    return out


def curie(full: str) -> str:
    for p, base in PREFIXES.items():
        if full.startswith(base) and full != base:
            local = full[len(base):]
            if local.replace("_", "").isalnum():
                return f"{p}:{local}"
    return f"<{full}>"


def lit_ttl(v: str, dt: str | None) -> str:
    s = json.dumps(v, ensure_ascii=False)  # JSON escaping is valid Turtle string escaping
    return s + (f"^^{curie(dt)}" if dt else "")


def to_turtle() -> str:
    lines = [f"@prefix {p}: <{b}> ." for p, b in PREFIXES.items()]
    lines.append("")
    by_subject: dict[str, list] = {}
    for s, p, o in triples():
        by_subject.setdefault(s, []).append((p, o))
    for s, pos in by_subject.items():
        lines.append(f"<{s}>" if s == DOC else curie(s))
        body = []
        for p, o in pos:
            pred = "a" if p == iri("rdf:type") else curie(p)
            obj = curie(o[1]) if o[0] == "iri" else lit_ttl(o[1], o[2])
            body.append(f"    {pred} {obj}")
        lines.append(" ;\n".join(body) + " .")
        lines.append("")
    head = (f"# CreativeID vocabulary {VERSION} — {DOC}\n"
            f"# Generated by tools/ns/build_creativeid.py; edit that file, not this one.\n\n")
    return head + "\n".join(lines)


def to_jsonld() -> dict:
    nodes: dict[str, dict] = {}
    for s, p, o in triples():
        n = nodes.setdefault(s, {"@id": s if s == DOC else curie(s)})
        key = "@type" if p == iri("rdf:type") else curie(p)
        if o[0] == "iri":
            c = curie(o[1])
            ref = o[1] if c.startswith("<") else c
            val = ref if key == "@type" else {"@id": ref}
        else:
            val = o[1] if not o[2] else {"@value": o[1], "@type": curie(o[2])}
        if key in n:
            n[key] = n[key] if isinstance(n[key], list) else [n[key]]
            n[key].append(val)
        else:
            n[key] = val
    return {"@context": dict(PREFIXES), "@graph": list(nodes.values())}


# ------------------------------------------------------------------------ HTML
def e(s: str) -> str:
    return html.escape(s, quote=True)


def term_link(c: str) -> str:
    if c.startswith("creativeid:"):
        n = c.split(":", 1)[1]
        return f'<a href="#{n}">{e(c)}</a>'
    if c.startswith("schema:"):
        n = c.split(":", 1)[1]
        return f'<a href="https://schema.org/{n}">{e(c)}</a>'
    return {"IRI": "an IRI", "xsd:string": "text", "xsd:integer": "a whole number"}.get(c, e(c))


def term_card(t: dict) -> str:
    rows = []
    if t.get("sub"):
        rows.append(("kind of", term_link(t["sub"])))
    if t.get("on"):
        rows.append(("used on", ", ".join(term_link(c) for c in t["on"])))
    if t.get("value"):
        rows.append(("value", ", ".join(term_link(c) for c in t["value"])))
    if t.get("lexicon"):
        label, anchor = t["lexicon"]
        rows.append(("AT Protocol", f'<a href="/lexicons.html#{anchor}"><code>{e(label)}</code></a>'))
    rows.append(("IRI", f"<code>{e(NS + t['name'])}</code>"))
    table = "".join(f'<tr><th scope="row">{k}</th><td>{v}</td></tr>' for k, v in rows)
    note = f'<p class="note">{t["note"]}</p>' if t.get("note") else ""
    return (f'<div class="lex term" id="{t["name"]}">\n'
            f'<h3><a class="self" href="#{t["name"]}">creativeid:{t["name"]}</a></h3>\n'
            f'<p>{e(t["comment"])}</p>{note}\n'
            f'<table class="facts"><tbody>{table}</tbody></table>\n</div>')


def to_html() -> str:
    classes = [t for t in TERMS if t["kind"] == "Class"]
    props = [t for t in TERMS if t["kind"] == "Property" and not t.get("local")]
    local = [t for t in TERMS if t.get("local")]
    toc = lambda ts: " · ".join(f'<a href="#{t["name"]}">{t["name"]}</a>' for t in ts)  # noqa: E731
    schema_rows = "".join(
        f'<tr><td class="n"><a href="https://schema.org/{e(n.split(":")[1].split(" ")[0])}">{e(n)}</a></td>'
        f"<td>{e(on)}</td><td>{e(what)}</td></tr>"
        for n, on, what in SCHEMA_TERMS)
    example = """{
  "@context": {
    "@vocab": "https://schema.org/",
    "creativeid": "https://www.cultureblocs.com/ns/creativeid#"
  },
  "@graph": [
    { "@id": "#me", "@type": ["Person", "creativeid:Persona"],
      "name": "Ada Ferrous", "knowsAbout": ["sound", "installation"] },
    { "@id": "#work-3l4qkxyz2bc2a", "@type": ["CreativeWork", "creativeid:Work"],
      "name": "Tidal Room", "creativeid:completionDate": "spring 2024",
      "creativeid:credits": [{ "@type": "creativeid:Credit",
        "name": "Jun Okafor", "creativeid:role": "lighting" }] },
    { "@id": "#claim-3l4qm2abcd22a", "@type": "creativeid:Connection",
      "creativeid:subject": { "creativeid:did": "did:web:arches.example", "name": "The Arches" },
      "creativeid:relationship": "exhibited" }
  ]
}"""
    return f"""<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>CreativeID vocabulary — CultureBlocs</title>
<meta name="description" content="The creativeid: Linked Data terms for creative personas, their works and connections, used alongside schema.org.">
<link rel="alternate" type="text/turtle" href="/ns/creativeid.ttl">
<link rel="alternate" type="application/ld+json" href="/ns/creativeid.jsonld">
<link rel="stylesheet" href="/style.css">
</head>
<body>
<!-- Generated by tools/ns/build_creativeid.py; edit that file, not this one. -->
<nav>
  <a class="mark" href="/">Culture<span>Blocs</span></a>
  <a class="item" href="/lexicons.html" aria-current="page">Protocol</a>
  <a class="item" href="/apps.html">Apps</a>
  <a class="item" href="/howto.html">How to</a>
  <a class="item" href="/events/">Events</a>
  <a class="item" href="/meetup.html">Meetup</a>
</nav>
<main>
  <div class="hero"><h1>The CreativeID vocabulary.</h1>
  <p class="lede">A handful of Linked Data terms for describing a creative
  persona, what they've made and who they've made it with, for any practice.
  They fill the gaps <a href="https://schema.org/">schema.org</a> leaves and
  mirror the <a href="/lexicons.html#creative-profile">creative lexicons</a>, so a
  persona published as a file on a website or in a Solid Pod says the same
  thing as one published to AT Protocol.</p>
  <p class="meetup-meta">namespace <code>{e(NS)}</code> · prefix <code>creativeid:</code>
  · version {VERSION}, {ISSUED}<br>
  also as <a href="/ns/creativeid.ttl">Turtle</a> and
  <a href="/ns/creativeid.jsonld">JSON-LD</a>, or ask
  <code>{e(DOC)}</code> with an <code>Accept</code> header</p>
  <p class="meetup-meta">classes: {toc(classes)}<br>properties: {toc(props)}<br>
  kept on your computer: {toc(local)}</p></div>

  <section>
    <h2 class="sec">How it fits together</h2>
    <p class="measure">A persona file has three kinds of node. The profile is
    <code>#me</code>, typed both <code>schema:Person</code> and
    <code>creativeid:Persona</code>. Each work is <code>#work-&lt;id&gt;</code>,
    typed <code>schema:CreativeWork</code> and <code>creativeid:Work</code>. Each
    connection is <code>#claim-&lt;id&gt;</code>, a <code>creativeid:Connection</code>.
    The ids match the AT Protocol record keys, so the same work has the same name
    everywhere it's published.</p>
    <div class="pipeline" tabindex="0" role="region" aria-label="Example persona in JSON-LD">{e(example)}</div>
    <p class="measure note">Personas made with <a href="https://github.com/geocontrol/creativeid-studio">CreativeID
    Studio</a> are written this way, and the
    <a href="https://github.com/geocontrol/creativeid-aggregator">CreativeID
    Aggregator</a> reads them from <code>/.well-known/creativeid.jsonld</code> on a
    website, from a Solid Pod, or as AT Protocol records.</p>
  </section>

  <section>
    <h2 class="sec">schema.org terms used as they are</h2>
    <p class="measure">Where schema.org already has the right word, CreativeID uses
    it and adds nothing.</p>
    <div class="scroll" tabindex="0" role="region" aria-label="schema.org terms used"><table>
      <thead><tr><th>term</th><th>used on</th><th>holds</th></tr></thead>
      <tbody>{schema_rows}</tbody>
    </table></div>
  </section>

  <section>
    <h2 class="sec">Classes</h2>
{chr(10).join(term_card(t) for t in classes)}
  </section>

  <section>
    <h2 class="sec">Properties</h2>
{chr(10).join(term_card(t) for t in props)}
  </section>

  <section>
    <h2 class="sec">Kept on your computer</h2>
    <p class="measure">These terms appear only in the persona file on the
    creative's own computer. Nothing published ever contains them; they're defined
    here so that file describes itself.</p>
{chr(10).join(term_card(t) for t in local)}
  </section>

  <section>
    <h2 class="sec">How the vocabulary changes</h2>
    <p class="measure">Terms are only ever added. A published term keeps its
    IRI and its meaning for good; if one stops being useful it's marked deprecated,
    with what to use instead, and stays resolvable. Usage hints
    (<code>schema:domainIncludes</code>, <code>schema:rangeIncludes</code>) are
    suggestions, not rules, so nothing here makes a published persona invalid.
    Suggestions and questions go to the
    <a href="https://github.com/geocontrol/creativeid-studio/issues">CreativeID Studio
    issues</a>.</p>
  </section>
</main>
<footer><div class="inner">CultureBlocs · <a href="/lexicons.html">protocol</a> ·
<a href="/ns/creativeid.ttl">creativeid.ttl</a> ·
<a href="/ns/creativeid.jsonld">creativeid.jsonld</a></div></footer>
</body>
</html>
"""


OUTPUTS = {
    "ns/creativeid.html": to_html,
    "ns/creativeid.ttl": to_turtle,
    "ns/creativeid.jsonld": lambda: json.dumps(to_jsonld(), indent=2, ensure_ascii=False) + "\n",
}


def main() -> int:
    root = Path(__file__).resolve().parents[2]
    check = "--check" in sys.argv
    stale = []
    for rel, make in OUTPUTS.items():
        path = root / rel
        content = make()
        if check:
            if not path.exists() or path.read_text(encoding="utf-8") != content:
                stale.append(rel)
        else:
            path.parent.mkdir(parents=True, exist_ok=True)
            path.write_text(content, encoding="utf-8")
            print("wrote", rel)
    if stale:
        print("stale (run python3 tools/ns/build_creativeid.py):", ", ".join(stale))
        return 1
    return 0


if __name__ == "__main__":
    sys.exit(main())
