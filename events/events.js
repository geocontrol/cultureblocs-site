/* Boot module for an event directory page — the only impure part.
 *
 * The page names its listing and its publisher:
 *   <main id="directory" data-listing="./events.json" data-actor="cultureblocs.com">
 * so the next directory is a new folder with its own index.html and
 * events.json, and no new code.
 *
 * Order of work: draw the bundled listing at once (the page is never blank
 * and works with the network down), then read the publisher's repository
 * and redraw with whatever is published there.
 */
import { listCollection, resolveActor } from './lib/atproto.js';
import { esc, renderDirectory, sourceLine } from './lib/render.js';
import { merge, tzOf, zonedParts } from './lib/schedule.js';
import { beadLinks, hider, makeReader, peopleIn, pool, readBeads } from './lib/went.js';
import { beadList, countLabel } from './lib/whowent.js';

const root = document.getElementById('directory');
const sourceEl = document.getElementById('source');
const actor = root.dataset.actor;
/* Set from the listing: the directory's time zone and today's date in it. */
let tz;
let today = null;

let filter = new URLSearchParams(location.search).get('show') || 'all';

function applyFilter() {
  const chips = root.querySelectorAll('.chip');
  if (![...chips].some(c => c.dataset.filter === filter)) filter = 'all';
  chips.forEach(c => c.setAttribute('aria-pressed', String(c.dataset.filter === filter)));
  root.querySelectorAll('.ev').forEach(el => {
    el.hidden = filter !== 'all' && el.dataset.group !== filter;
  });
  const visibleIn = (el) => Boolean(el) && [...el.querySelectorAll('.ev')].some(ev => !ev.hidden);
  root.querySelectorAll('section.day').forEach(sec => {
    const any = visibleIn(sec);
    sec.hidden = !any;
    const link = root.querySelector(`.jump a[href="#${sec.id}"]`);
    if (link) link.hidden = !any;
    const sub = sec.querySelector('.ev-sub');
    if (sub) {
      sub.hidden = !(visibleIn(sec.querySelector('[data-kind="timed"]'))
        && visibleIn(sec.querySelector('[data-kind="open"]')));
    }
  });
}

/* ---------- who went ---------- */
const counts = new Map();   // event uri -> people
function applyCounts() {
  root.querySelectorAll('.went-count').forEach(el => {
    const n = counts.get(el.dataset.uri) || 0;
    el.textContent = countLabel(n);
  });
}

async function loadHidden() {
  try {
    const r = await fetch('/events/hidden.json', { cache: 'no-cache' });
    return r.ok ? hider(await r.json()) : hider(null);
  } catch {
    return hider(null);
  }
}

async function whoWent(events) {
  const section = document.getElementById('who-went');
  const items = document.getElementById('who-items');
  const summary = document.getElementById('who-summary');
  if (!section) return;
  const hidden = await loadHidden();
  const real = events.filter(e => e.category !== 'umbrella' && e.uri);
  const nameOf = new Map(real.map(e => [e.uri, e]));
  const linkSets = await pool(real, 5, (e) => beadLinks(e.uri));
  const all = [];
  real.forEach((e, i) => {
    const links = Array.isArray(linkSets[i]) ? linkSets[i] : [];
    counts.set(e.uri, peopleIn(links, hidden));
    all.push(...links);
  });
  applyCounts();
  const people = peopleIn(all, hidden);
  if (!people) return;
  const seen = new Set();
  const unique = all.filter(l => !seen.has(l.uri) && seen.add(l.uri));
  const beads = await readBeads(unique, {
    reader: makeReader(), hidden, limit: 24, eventUris: new Set(nameOf.keys()),
  });
  if (!beads.length) return;
  const dir = root.dataset.dir;
  summary.textContent = `${people} ${people === 1 ? 'person has' : 'people have'} said they went`
    + ` — ${unique.length} ${unique.length === 1 ? 'bead' : 'beads'} so far. Newest first.`;
  items.innerHTML = beadList(beads, (b) => {
    const e = nameOf.get(b.value.subject.uri);
    return { event: e ? { name: e.record.name, href: `/events/${dir}/${e.slug}/` } : null };
  });
  section.hidden = false;
}

function draw(events) {
  const open = new Set([...root.querySelectorAll('details[open]')]
    .map(d => d.closest('.ev')?.id).filter(Boolean));
  root.innerHTML = renderDirectory({ events, today, dir: root.dataset.dir || null, tz });
  open.forEach(id => document.getElementById(id)?.querySelector('details')?.setAttribute('open', ''));
  applyFilter();
  applyCounts();
}

root.addEventListener('click', async (e) => {
  const chip = e.target.closest('.chip');
  if (chip) {
    filter = chip.dataset.filter;
    const q = new URLSearchParams(location.search);
    if (filter === 'all') q.delete('show'); else q.set('show', filter);
    history.replaceState(null, '', `${location.pathname}${q.size ? `?${q}` : ''}${location.hash}`);
    applyFilter();
    return;
  }
  const copy = e.target.closest('.copy');
  if (copy) {
    try {
      await navigator.clipboard.writeText(copy.dataset.copy);
      copy.textContent = 'Copied';
    } catch {
      copy.textContent = 'Select and copy';
    }
    setTimeout(() => { copy.textContent = 'Copy'; }, 2000);
  }
});

async function main() {
  let listing;
  try {
    const r = await fetch(root.dataset.listing, { cache: 'no-cache' });
    if (!r.ok) throw new Error(String(r.status));
    listing = await r.json();
  } catch {
    root.innerHTML = '<p class="ev-intro">The listing could not be loaded. Please reload the page.</p>';
    return;
  }
  tz = tzOf(listing);
  today = zonedParts(new Date().toISOString(), tz)?.date || null;
  const entries = listing.records || [];
  const total = entries.filter(e => e.category !== 'umbrella').length;

  let current = merge(entries);
  draw(current);
  sourceEl.innerHTML = `Checking <code>@${esc(actor)}</code> for the latest…`;

  try {
    const { did, pds } = await resolveActor(actor);
    const records = await listCollection(pds, did, listing.meta?.collection);
    const events = merge(entries, records);
    const live = events.filter(e => e.live && e.category !== 'umbrella').length;
    if (live) { current = events; draw(events); }
    sourceEl.innerHTML = sourceLine({ actor, live, total });
  } catch {
    sourceEl.innerHTML = sourceLine({ actor, live: 0, total, error: true });
  }

  if (location.hash) document.getElementById(location.hash.slice(1))?.scrollIntoView();

  // Who went is extra: if Constellation or a PDS is down, the programme stands.
  whoWent(current).catch(() => {});
}

main();
