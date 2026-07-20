# cultureblocs.com

Static site for CultureBlocs: the com.cultureblocs.* schema commons, the
apps built on it, and the London meetup.

    index.html / apps.html / meetup.html   hand-written pages
    lexicons.html                          GENERATED — do not edit by hand
    build.py + lexicons/*.json             regenerate: python build.py
    cultureblocs-strands.js                the strand embed component
    meetup/strands.json                    (future) published meetup strands

Deploy: push to GitHub, import into Vercel as a plain static project (no
framework, no build step needed — lexicons.html is committed). To update
schema docs: sync lexicons/ from cultureblocs-spine, run build.py, commit.

Publishing meetup beads later: from the spine repo,
    python scripts/export_public.py export <strand-id> --out <this-repo>/meetup
and the embed on meetup.html picks it up.
