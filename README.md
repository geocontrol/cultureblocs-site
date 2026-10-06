# cultureblocs.com

Static site for CultureBlocs: the com.cultureblocs.* schema commons, the
apps built on it, and the London meetup.

    index.html / apps.html / howto.html /
      meetup.html                          hand-written pages
    lexicons.html                          GENERATED — do not edit by hand
    build.py + lexicons/*.json             regenerate: python build.py
    cultureblocs-strands.js                the strand embed component
    meetup/strands.json                    (future) published meetup strands
    wall/                                  one actor's published cultureblocs, newest
                                           first, one URL per strand (/wall/<handle>/
                                           and /wall/<handle>/<rkey>). Reads the actor's
                                           own PDS in the browser; needs the /wall/
                                           rewrites in vercel.json.
    events/                                event directories. events/index.html lists them;
                                           each directory is a folder (events/<name>/) with
                                           an index.html and an events.json listing which
                                           community.lexicon.calendar.event records belong
                                           to it. The page draws the listing at once, then
                                           redraws from the publisher's repo (data-actor).
    tools/events/                          build + publish scripts for the Frieze Week
                                           records (see "Event directories" below)

Deploy: push to GitHub, import into Vercel as a plain static project (no
framework, no build step needed — lexicons.html is committed). To update
schema docs: copy lexicons/com/cultureblocs/* from cultureblocs-string into
lexicons/ (same tree, one level flatter), run build.py, commit:

    for f in $(cd ../cultureblocs-string && find lexicons/com/cultureblocs -name '*.json'); do
      cp "../cultureblocs-string/$f" "lexicons/${f#lexicons/com/cultureblocs/}"
    done
    python build.py

The nav lives in seven places — index.html, apps.html, howto.html, meetup.html,
build.py's page template, events/index.html and each events/<name>/index.html.
Adding a top-level page means editing all of them.

Publishing meetup beads later: from the cultureblocs-string repo,
    python scripts/export_public.py export <strand-id> --out <this-repo>/meetup
and the embed on meetup.html picks it up.

Tests (the wall's pure and injectable modules):

    node --test 'wall/test/*.test.mjs'

The wall's boot module (wall.js) is impure and not tested; verify it parses as an ES
module before deploy:

    node --input-type=module --check < wall/wall.js

Event directories:

    python3 tools/events/build_frieze_events.py      # regenerate the listing
    python3 tools/events/publish_frieze_events.py    # dry run against @cultureblocs.com
    python3 tools/events/publish_frieze_events.py --apply

Publishing needs ATP_HANDLE and ATP_APP_PASSWORD (an app password) in the
environment, and writes DID-based URIs and CIDs back into the listing — commit
it afterwards. Edits to published records show on the page without a deploy;
adding or removing an event from a directory is a listing change and does.

A new directory: copy events/frieze-week-london/ to events/<name>/, replace its
events.json and page copy, add a card to events/index.html and a redirect for
/events/<name> in vercel.json.

    node --test 'events/test/*.test.mjs'
    node --input-type=module --check < events/events.js
