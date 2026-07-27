#!/usr/bin/env python3
"""Generate lexicons.html from the JSON lexicon documents in ./lexicons.

The reference page is built from the actual schema files — the same ones the
Spine validates against — so the docs cannot drift from the truth. Re-run
after syncing lexicons/ from the cultureblocs-spine repo:

    python build.py
"""
import html
import json
from pathlib import Path

ORDER = ["com.cultureblocs.bead", "com.cultureblocs.annotation",
         "com.cultureblocs.strand", "com.cultureblocs.creative.profile",
         "com.cultureblocs.creative.work", "com.cultureblocs.creative.connection",
         "com.cultureblocs.venue.profile", "com.cultureblocs.venue.listing",
         "com.cultureblocs.defs"]
ESC = html.escape


def type_label(schema: dict) -> str:
    t = schema.get("type", "?")
    if t == "ref":
        return f'ref → {schema["ref"]}'
    if t == "union":
        return "union: " + " | ".join(schema.get("refs", []))
    if t == "array":
        inner = type_label(schema.get("items", {}))
        return f"array of {inner} (max {schema['maxLength']})" if "maxLength" in schema else f"array of {inner}"
    if t == "string":
        bits = ["string"]
        if schema.get("format"):
            bits.append(schema["format"])
        if schema.get("maxGraphemes"):
            bits.append(f"≤{schema['maxGraphemes']}")
        return " · ".join(bits)
    return t


def prop_rows(properties: dict, required: list[str]) -> str:
    rows = []
    for name, schema in properties.items():
        req = '<span class="req">✱</span> ' if name in required else ""
        note = ESC(schema.get("description", ""))
        kv = schema.get("knownValues")
        if kv:
            note = (note + " " if note else "") + "Known values: " + ", ".join(kv) + "."
        rows.append(
            f'<tr><td class="n">{req}{ESC(name)}</td>'
            f'<td class="t">{ESC(type_label(schema))}</td>'
            f"<td>{note}</td></tr>")
    return "".join(rows)


def render_def(name: str, d: dict) -> str:
    if d.get("type") == "record":
        rec = d["record"]
        head = f'<h4>record · key: {ESC(d.get("key", "tid"))}</h4>'
        props, req = rec.get("properties", {}), rec.get("required", [])
    else:
        head = f"<h4>object · #{ESC(name)}</h4>"
        props, req = d.get("properties", {}), d.get("required", [])
    desc = f'<p class="desc">{ESC(d.get("description", ""))}</p>' if d.get("description") else ""
    table = ("<table><thead><tr><th>field</th><th>type</th><th>notes</th></tr></thead>"
             f"<tbody>{prop_rows(props, req)}</tbody></table>") if props else ""
    return head + desc + table


def render_lexicon(doc: dict) -> str:
    out = [f'<div class="lex" id="{doc["id"].replace("com.cultureblocs.", "").replace(".", "-")}">',
           f'<h3>{ESC(doc["id"])}</h3>']
    main = doc["defs"].get("main")
    if main and main.get("description"):
        out.append(f'<p class="desc">{ESC(main["description"])}</p>')
    if main:
        out.append(render_def("main", main))
    for name, d in doc["defs"].items():
        if name != "main":
            out.append(render_def(name, d))
    out.append("</div>")
    return "\n".join(out)


def main() -> None:
    docs = {}
    for f in Path("lexicons").rglob("*.json"):
        doc = json.loads(f.read_text())
        docs[doc["id"]] = doc
    body = "\n".join(render_lexicon(docs[k]) for k in ORDER if k in docs)

    page = f"""<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Protocol — CultureBlocs</title>
<meta name="description" content="The com.cultureblocs.* lexicons: open schemas for beads, annotations and strands of cultural memory.">
<link rel="stylesheet" href="/style.css">
</head>
<body>
<nav>
  <a class="mark" href="/">Culture<span>Blocs</span></a>
  <a class="item" href="/lexicons.html" aria-current="page">Protocol</a>
  <a class="item" href="/apps.html">Apps</a>
  <a class="item" href="/meetup.html">Meetup</a>
</nav>
<main>
  <div class="hero"><h1>The schema commons.</h1>
  <p class="lede">Eight small <a href="https://atproto.com/guides/lexicon">ATProto
  lexicons</a> under the <code>com.cultureblocs.*</code> namespace — anchored to
  this domain, which is what makes them citable. The same shapes describe a record
  on a device, in a self-hosted spine, or published to the open network; privacy is
  a property of where a record lives, not of its schema. <b>Status: published and
  resolvable</b> — these schemas are live protocol infrastructure, in daily use by
  the reference apps.</p>
  <p class="meetup-meta">resolve it yourself: <code>_lexicon.cultureblocs.com</code>
  → <code>did:plc:l3726um33xesakwqhjkkpoet</code> → e.g.
  <code>at://cultureblocs.com/com.atproto.lexicon.schema/com.cultureblocs.bead</code></p>
  <p class="meetup-meta">personal record:
    <a href="#bead">bead</a> · <a href="#annotation">annotation</a> ·
    <a href="#strand">strand</a><br>creative identity:
    <a href="#creative-profile">creative.profile</a> ·
    <a href="#creative-work">creative.work</a> ·
    <a href="#creative-connection">creative.connection</a><br>venues:
    <a href="#venue-profile">venue.profile</a> ·
    <a href="#venue-listing">venue.listing</a> ·
    <a href="#defs">shared defs</a> —
    fields marked <span class="req">✱</span> are required</p></div>
{body}
  <section>
    <h2 class="sec">Design notes</h2>
    <p><b>Self-assertion is the normal state.</b> A creative's profile and
    work claims live in their own repository; that is the claim. A work
    record proves one narrow, honest thing — this claim was made on this
    date by the holder of this repository — which is enough to tag work as
    yours and to be referenced by everything further up the stack. Industry
    metadata, scene-specific layers and commercial registrations belong in
    other namespaces that <em>reference</em> these records rather than
    growing them. Attestation is an optional overlay: when two parties
    independently point at each other, a reader can compute a verified
    relationship; unattested records are ordinary, not deficient.</p>
    <p><b>Venues stay small.</b> A listing exists to be a stable thing that
    beads can point at. Audiences publish their own records referencing it,
    so a venue reads public references rather than collecting anything about
    the people who came.</p>
    <p>Records reference artworks by stable external identity (Wikidata QIDs,
    institution accession numbers, Linked Art URIs) with a descriptive fallback —
    works are referenced, never owned. Coordinate fuzzing is a schema concept
    (<code>geo.precision</code>), not an app afterthought. <code>knownValues</code>
    on <code>kind</code> is advisory, so the vocabulary can grow without breaking
    old records. Event and calendar shapes are deliberately absent: for those we
    intend to interoperate with the
    <a href="https://github.com/lexicon-community">Lexicon Community</a> calendar
    work rather than fork it.</p>
  </section>
</main>
<footer><div class="inner">
  cultureblocs.com is the schema authority for <code>com.cultureblocs.*</code> ·
  a <a href="https://geekyoto.com">geekyoto</a> project ·
  <a href="https://github.com/Geocontrol">github.com/Geocontrol</a>
</div></footer>
</body>
</html>
"""
    Path("lexicons.html").write_text(page)
    print(f"lexicons.html written ({len(docs)} lexicons)")


if __name__ == "__main__":
    main()
