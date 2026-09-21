# The wall — a page of published blocs, and the first permalink: design

Status: approved 2026-09-21; §5 amended the same day, after the finding in §3.1.
Answers `cultureblocs-loom` `docs/backlog.md` item 3, the last of the five
things using the desk turned up.
Code lands in **this repository** (`cultureblocs-site`), at `/wall/`. One
small change lands in `cultureblocs-string`: the embed stops discarding each
strand's `uri` (§7).

## 1 · Goal

A page of one actor's published cultureblocs in date order, ten per page,
paging back through older entries — and, underneath it, the thing the rest of
the project has been missing: **a URL for a single strand**.

Success looks like: `cultureblocs.com/wall/geocontrol.bsky.social/` lists the
strands newest first, ten of them; page two is
`…/?page=2`, a link someone can send; and clicking a strand opens
`cultureblocs.com/wall/geocontrol.bsky.social/3lxyz`, the whole thing —
narrative, beads, photos — at an address that can be pasted into a post.

The wall is a **read surface**, not part of Loom. Loom is where the string is
written; this is where what was published can be seen by anyone, including
its author.

## 2 · Decisions taken

| Question | Decision |
|---|---|
| Where it lives | **This repo, served at `/wall/`.** Beside `catalogue/`, which is the precedent for a sub-app here |
| How it renders | **Static files, fetching in the browser.** No build step, no server, works for any actor |
| Data source | **The actor's own PDS**, via `com.atproto.repo.listRecords`. Not the appview: it has no cursor, it only knows actors it has indexed, and `APPVIEW.md` says "No ranking, no feed, no algorithm" |
| Paging | **Walk every cursor once, sort by date, page in the browser.** Ten per page, the page number in the URL. Forced by §3.1: cursor order is not date order |
| A wall entry | **A summary** — title, date, place, the narrative's opening, a bead count — so a page of ten is ten records and one request |
| The whole strand | **Its own URL**, `/wall/<handle>/<rkey>`, rendered with every bead and photo |
| Relationship to the embed | **Its own modules.** The embed gains one additive fix so it can link inward (§7) |
| Shared code | **Copied, not shared, for now.** `catalogue/lib/atproto.js` is not refactored to serve the wall (§8) |
| Failure policy | **Loud.** A destination that fails silently reads as a broken site |

## 3 · What exists, and the two things that don't

**`cultureblocs-strands.js`** (canonical in `cultureblocs-string/web/`,
copied here at the repo root) is the closest thing to the wall that exists. It
takes an `actor`, resolves handle → DID → PDS, lists strands, hydrates each
one's beads, and renders narratives properly. Two things stop it being the
wall:

- It asks for **`limit=50` with no cursor** — one page, ever. Its `limit`
  attribute only slices what that single fetch returned.
- It **discards each strand's `uri`** (`bundles.push({strand: s.value, …})`),
  so the surface that renders strands cannot name the strand it is rendering.

**`catalogue/`** is the precedent for everything else: a `?actor=`-driven page
in this repo, with a real cursor loop (`PAGE_LIMIT = 100`, `MAX_PAGES = 50`), a
stuck-cursor guard, a pure `record → model → HTML` renderer, and the rule that
matters most here — stated in its own header — that unlike the embeds it never
fails silently, "because a catalogue IS the destination, so a blank page reads
as a broken site." It fetches everything before rendering and has no page-two
UI, and it lists works rather than strands.

**No permalink to a strand exists anywhere.** The Bluesky adapter's docstring
says so in as many words: "No link facet — there is no per-strand permalink to
point at yet." The only way to see a published strand today is a third-party
record browser. That is the gap this design closes, and it is why the wall
gates the rest of syndication: an Instagram caption needs a link, and a
Bluesky post deserves one.

### 3.1 · The finding that changed the paging

**A published strand's record key is a UUID, so key order is not date order.**
`publisher._rkey_for` writes a strand under its String record id, which is a
`uuid4`. Cursor paging follows key order, so it cannot produce a date-ordered
wall. Against the seven strands `geocontrol.bsky.social` has published, the
PDS returns 18 September, 4 August, 23 July, 15 September, 2 August, 19 July,
8 August — arbitrary with respect to date.

This is why the embed sorts client-side after fetching: inside one page of 50,
sorting is enough. A paged wall cannot do that, because page one would be an
arbitrary ten rather than the newest ten.

Fetching everything up front is cheap here **because §2 chose summaries**: a
summary needs no beads, so the whole walk is one `listRecords` request per
hundred strands. The expensive thing was never the strand records; it was
hydrating beads, and the wall only does that on a single strand's page.

Publishing under time-ordered keys instead was considered and rejected: it
changes how publishing works, breaks the rkey reuse that lets a republish
update a record in place, and would not reorder the strands already out there.

## 4 · Architecture

Four modules, one impure. The split follows `catalogue/`: the network takes an
injected `fetch`, rendering is pure, and only the boot module touches the DOM.

    /wall/<handle>/           the wall, page one
    /wall/<handle>/?page=2    a later page
    /wall/<handle>/<rkey>     one strand, whole
      │
      ├── route.js     the URL ⇄ {actor, rkey, page}, both directions, pure
      ├── atproto.js   resolveActor, fetchAllStrands, fetchStrand, fetchBeads
      ├── render.js    record → model → HTML, pure: strandSummary, strandPage
      └── wall.js      reads the location, fetches, renders, wires the buttons

```
wall/
├── index.html          the shell: one <main>, one <script type="module">
├── wall.css            its own stylesheet, in catalogue/templates/'s spirit
├── wall.js             the only impure module
├── lib/
│   ├── atproto.js
│   ├── route.js
│   ├── embed.js        the text and image helpers, copied from the embed
│   └── render.js
└── test/
    ├── atproto.test.mjs
    ├── route.test.mjs
    └── render.test.mjs
```

`route.js` is its own module rather than a few lines inside `wall.js` because
the permalink is the one thing other services will hold. Link building and
link reading must not disagree, and a round-trip test is what guarantees that.

### 4.1 `lib/atproto.js`

```js
resolveActor(actor, { fetchFn })         // -> { did, pds }
fetchAllStrands(pds, did, { fetchFn })   // -> [{ uri, cid, value }], newest first
fetchStrand(pds, did, rkey, { fetchFn }) // -> { uri, cid, value } | null
fetchBeads(pds, strand, { fetchFn })     // -> [{ uri, value } | { uri, missing: true }]
```

- **`resolveActor` is `catalogue`'s, adapted**: handle → DID via
  `com.atproto.identity.resolveHandle`, DID → PDS via `plc.directory` (or the
  DID's own document for `did:web:`), keeping its careful distinction between
  a 4xx (this handle does not resolve) and anything else (we could not reach
  the resolver). Reporting a network fault as "no such handle" sends someone
  hunting for a typo that isn't there.
- **`fetchAllStrands` is `catalogue`'s `fetchAllWorks`** over
  `com.cultureblocs.strand`: a hundred records a request, every cursor
  followed, sorted newest-first by `createdAt` at the end. It keeps both of
  that function's guards — a repeated cursor stops the walk, and hitting the
  page cap **throws** rather than returning a partial list, because a plain
  array cannot say "this is not all of it".
- **It keeps each record's `uri`**, which is what the permalink is built from
  and the thing the embed drops (§3).
- **`fetchBeads` tolerates a missing bead.** Each item is fetched in parallel;
  one that fails comes back marked `missing` rather than dropped, so §6 can
  say so out loud.

### 4.2 `lib/route.js`

Pure, and the canonical form is the path:

```js
parse(pathname, search)   // -> { actor, rkey, page }  — any supported shape
wallHref(actor, page)     // -> /wall/<handle>/[?page=N]
strandHref(actor, rkey)   // -> /wall/<handle>/<rkey>
```

`page` parses to 1 for anything absent, unparseable or below 1, so a mangled
`?page=` shows the wall rather than an error.

The query form `/wall/?actor=…` **parses** too, because `catalogue` taught
people that shape and an embed may already point that way, but links are
always built as paths.

`vercel.json` gains one rewrite so the path form reaches the shell:

```json
{ "rewrites": [ { "source": "/wall/:actor/:rkey", "destination": "/wall/index.html" },
                { "source": "/wall/:actor",       "destination": "/wall/index.html" },
                { "source": "/wall/:actor/",      "destination": "/wall/index.html" } ] }
```

A rewrite, not a redirect: the URL the person shared is the URL they keep.

### 4.4 · The risk this shape carries

**A handle looks like a filename.** `geocontrol.bsky.social` is a path segment
with dots in it, and static hosts routinely treat `something.social` as a file
request rather than a route — which can mean a 404 before any rewrite is
consulted, or a rewrite that matches locally and not in production.

This is the one part of the design that cannot be settled by reading code, so
the plan must settle it early: deploy a preview with the rewrites and the
shell in place, and fetch `/wall/<a handle with dots>/` and
`/wall/<handle>/<rkey>` against it before anything else is built. If Vercel
will not route a dotted segment, the fallback is decided here rather than
improvised then: **keep the path for the strand and move the actor into a
query** — `/wall/?actor=<handle>` for the wall and `/wall/s/<rkey>?actor=…`
for a strand — which keeps a readable permalink without a dotted segment. A
third option, encoding the handle, is rejected: `geocontrol%2Ebsky%2Esocial`
is not a link anyone would paste.

`route.js` is where this lands either way, which is another reason it is its
own module: the decision changes one file and its tests, not the wall.

### 4.3 `lib/render.js`

`strandSummary(entry, { actor })` → title, the day, place if the record
carries one, the narrative's opening, how many beads, and the `href` from
`strandHref`. Everything comes from the strand record itself, which is what
makes a page of ten cost one request.

`strandPage(entry, beads, { blobBase })` → the strand whole: narrative, then
every bead in time order with its photos. Photos resolve through the actor's
own PDS, the same construction the embed uses:
`{pds}/xrpc/com.atproto.sync.getBlob?did={did}&cid={cid}`.

The narrative formatter and the image reader are **copied verbatim** from the
canonical embed into `lib/embed.js`, comments included, and pinned by tests
against a real published narrative. The wall does not import the embed (§2),
but a narrative must read the same in both places, so this is a copy rather
than a reimplementation — the same trade as §8, for the same reason.

Both are pure functions returning HTML strings, so both are tested directly.

## 5 · Paging, precisely

Ten strands a page, the page number in the URL (`/wall/<handle>/?page=2`), so
every page is a link that can be sent. Page one omits the parameter.

The whole list is fetched and sorted **once per page load**, then sliced:
both directions work from a cold link, and there are real page numbers. A page
beyond the end shows the last page rather than an empty one.

Paging is plain links, so each one is a fresh document load that resolves the
actor and walks the list again. What fetching everything buys is therefore
**correct order**, not speed — at seven strands the difference is invisible,
and keeping `wall.js` free of history and in-memory state is worth more than
instant paging. If the wall ever grows enough for that to bite, the answer is
`history.pushState` and re-rendering from the list already in memory, which is
a change to one module.

The cost is that the first paint waits for the whole walk. At one request per
hundred strands that is one request today and two at two hundred; several
thousand strands would want a date cursor the appview does not have yet, and
that is a different piece of work than this.

## 6 · When things go wrong

Each state says which it is, because a blank page reads as a broken site.

| Condition | What the wall says |
|---|---|
| Handle does not resolve (4xx) | "No such handle" — naming the handle |
| Resolver or PDS unreachable | "Could not reach it", distinct from the above |
| Actor has published nothing | "Nothing published yet." Not an error |
| A page beyond the end | The last page, rather than an empty one |
| A stuck cursor | The walk stops and says the repository's paging is repeating |
| More strands than the page cap | Says so and stops, as `catalogue` does — never a silent half |
| `rkey` not found | "That strand isn't there", with a link to the wall |
| A bead fails to load | A visible "a bead could not be loaded" line, in place |
| No actor at all (`/wall/`) | A line saying what the wall is, linking to `cultureblocs.com`'s own |

The bead case is the one place this deliberately differs from the embed. The
embed swallows a failed bead because it is a guest on someone else's page; the
wall is the destination, and a strand quietly missing a third of its evening
is worse than a strand that admits it.

## 7 · The one change in `cultureblocs-string`

`web/cultureblocs-strands.js` keeps each strand's `uri` alongside its
`value`, instead of dropping it. Nothing in the embed's rendering changes; the
`uri` simply becomes available, so an embed can link each strand into the
wall. It is canonical in `cultureblocs-string` and vendored into this repo and
`geekyoto`, so it ships as a small PR there and is copied outward afterwards —
`geekyoto`'s vendor script has a `--check` mode for exactly this drift.

Linking from the embeds into the wall is **not** in this design: the fix makes
it possible, and whether an embed should carry links at all is a separate
question.

## 8 · The duplication this accepts

`wall/lib/atproto.js` holds its own copy of handle resolution — about **eighty
identical lines** (`getJson`, `pdsFromDoc`, `notResolved`, `resolveActor`),
plus `fetchAllStrands`, which is `fetchAllWorks` differing only in the
collection it names. The repository also ends up with a third copy of `esc`. That is deliberate:
extracting a shared module now would mean changing a working, deployed surface
to serve one that does not exist yet, and `catalogue`'s tests live in the
`cultureblocs-string` repo, so a regression here would not be caught by
anything in this one.

Once the wall works, both uses are visible and the shared module is the
obvious follow-up, and it has a shape: one `lib/atproto.js` whose
`listAll(pds, did, nsid)` is the single cursor loop both surfaces call. The
spec records the debt at its real size so it is a decision rather than an
accident — and so the follow-up is scheduled rather than aspirational.

## 9 · Testing

`node --test 'wall/test/*.test.mjs'` — **the first tests in this repository.**
No `package.json` is needed; the site stays a no-build static site. The
command goes in `README.md`.

- **`atproto.js`** with an injected `fetchFn`: every cursor threaded into the
  next request and absent from the first; a repeated cursor stopping the walk;
  the page cap throwing rather than truncating; the result sorted newest-first
  by `createdAt` **even when key order disagrees** (§3.1's real data is the
  fixture); a 4xx told apart from a 5xx in `resolveActor`; a missing bead
  coming back marked rather than dropped.
- **`route.js`**: every supported shape parsed — path, path with a page
  number, the legacy query form — a page number that is absent, zero, negative
  or nonsense landing on 1, and the round trip, that `strandHref` then `parse`
  returns the same actor and rkey. Handles with dots and `did:plc:` actors
  both survive.
- **`render.js`**: a summary from a strand record; a strand with no narrative;
  a strand whose beads include a missing one; a bead with photos and a bead
  without; escaping, since every value here came off the network.
- **No test of `wall.js`.** It is the boot module; everything it decides lives
  in the three pure and injectable ones.

## 10 · Delivery

One PR to this repository: `wall/`, the `vercel.json` rewrites, the README
line. One small PR to `cultureblocs-string` for §7, which can land in either
order — the wall does not read the embed.

After merge, `cultureblocs-loom` `docs/backlog.md` item 3 closes, and the
follow-up it unlocks is recorded there: the Bluesky adapter can now build a
link back, and an Instagram caption has something to name.

## 11 · Out of scope

- **Link facets in Bluesky posts.** Additive, and the adapter's own docstring
  is already waiting for it.
- **Preview cards and server rendering.** A client-rendered page gets no
  unfurl and no search indexing. That is the cost of staying a static site,
  taken knowingly.
- **Search, filters, tags, months.** The backlog asked for date order and
  paging. Nothing else — though once the whole list is in memory (§5), search
  becomes nearly free, which is worth remembering rather than building.
- **Any appview change**, including the cursor it lacks.
- **Instagram**, which needs this wall first but is its own design.
- **Any change to `geekyoto`**, and any linking from the embeds inward (§7).
