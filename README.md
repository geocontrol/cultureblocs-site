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

Deploy: push to GitHub, import into Vercel as a plain static project (no
framework, no build step needed — lexicons.html is committed). To update
schema docs: copy lexicons/com/cultureblocs/* from cultureblocs-string into
lexicons/ (same tree, one level flatter), run build.py, commit:

    for f in $(cd ../cultureblocs-string && find lexicons/com/cultureblocs -name '*.json'); do
      cp "../cultureblocs-string/$f" "lexicons/${f#lexicons/com/cultureblocs/}"
    done
    python build.py

The nav lives in five places — index.html, apps.html, howto.html, meetup.html
and build.py's page template. Adding a page means editing all five.

Publishing meetup beads later: from the cultureblocs-string repo,
    python scripts/export_public.py export <strand-id> --out <this-repo>/meetup
and the embed on meetup.html picks it up.

Tests (the wall's pure and injectable modules):

    node --test 'wall/test/*.test.mjs'

The wall's boot module (wall.js) is impure and not tested; verify it parses as an ES
module before deploy:

    node --input-type=module --check < wall/wall.js
