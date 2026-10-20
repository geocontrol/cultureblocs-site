# CultureBlocs brand files

- `cultureblocs-wordmark.svg`: the threaded wordmark for plaster (#FAFAF9) backgrounds. Used by `nav .mark` in `style.css` on every page.
- `cultureblocs-wordmark-on-white.svg`: the same, for white cards. The knockout halo around each letter must match the background.
- `cultureblocs-avatar.svg` / `.png`: square mark for Bluesky and other avatars (bead with a hole, on the thread).
- `cultureblocs-favicon.svg`: browser icon. `/favicon.ico` and `/apple-touch-icon.png` at the site root are rendered from it.

The wordmark letters are outlined paths, so it renders the same everywhere. They are currently drawn from **Jost Bold** (SIL Open Font Licence), the closest open match to Futura. To rebuild from Futura Bold instead:

    python3 -I tools/brand/outline_wordmark.py /path/to/Futura-Bold.ttf brand/

Rules: never retype or redraw the wordmark, minimum width 140px (use the avatar mark below that), light backgrounds only, the bead is always accent blue (#2B4BC7).
