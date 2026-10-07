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
import { renderFilms } from './lib/films.js';
import { renderGallery } from './lib/gallery.js';
import { merge, tzOf, zonedParts } from './lib/schedule.js';
import { WENT, verbOf } from './lib/verb.js';
import { beadLinks, hider, makeReader, peopleIn, pool, readBeads } from './lib/went.js';
import { beadList, countLabel } from './lib/whowent.js';

const root = document.getElementById('directory');
const sourceEl = document.getElementById('source');
const actor = root.dataset.actor;
/* Set from the listing: the directory's time zone and today's date in it. */
let tz;
let today = null;
let verb = WENT;
/* 'films' for a festival: one entry per film, A–Z or by day (lib/films.js);
 * 'gallery' for a venue's programme: on now / soon / talks (lib/gallery.js). */
let layout = 'week';
const q0 = new URLSearchParams(location.search);
let view = q0.get('view') === 'days' ? 'days' : 'az';
let findText = '';
let section = q0.get('section') || '';

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

/* ---------- a festival: view, search, section ---------- */
const fold = (s) => String(s || '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').trim();

function applyFilms() {
  const words = fold(findText).split(/\s+/).filter(Boolean);
  root.querySelectorAll('.chip.view').forEach(c => c.setAttribute('aria-pressed', String(c.dataset.view === view)));
  root.querySelectorAll('.film-view').forEach(v => { v.hidden = v.dataset.view !== view; });
  root.querySelectorAll('.jump[data-for]').forEach(j => { j.hidden = j.dataset.for !== view; });
  let shown = 0;
  const pane = root.querySelector(`.film-view[data-view="${view}"]`);
  pane?.querySelectorAll('.ev').forEach(el => {
    const ok = (!section || el.dataset.section === section)
      && words.every(w => el.dataset.q.includes(w));
    el.hidden = !ok;
    if (ok) shown += 1;
  });
  pane?.querySelectorAll('section.day').forEach(sec => {
    const any = [...sec.querySelectorAll('.ev')].some(ev => !ev.hidden);
    sec.hidden = !any;
    const link = root.querySelector(`.jump a[href="#${sec.id}"]`);
    if (link) link.hidden = !any;
  });
  const count = root.querySelector('#film-count');
  if (count) {
    const what = view === 'days' ? 'screening' : 'film';
    count.textContent = `${shown} ${what}${shown === 1 ? '' : 's'}${words.length || section ? ' match' : ''}`;
  }
}

function keepInUrl() {
  const q = new URLSearchParams(location.search);
  if (view === 'days') q.set('view', 'days'); else q.delete('view');
  if (section) q.set('section', section); else q.delete('section');
  history.replaceState(null, '', `${location.pathname}${q.size ? `?${q}` : ''}${location.hash}`);
}

root.addEventListener('input', (e) => {
  if (e.target.id === 'film-q') { findText = e.target.value; applyFilms(); }
});
root.addEventListener('change', (e) => {
  if (e.target.id === 'film-section') { section = e.target.value; keepInUrl(); applyFilms(); }
});

/* ---------- who went ---------- */
const counts = new Map();   // event uri -> people
function applyCounts() {
  root.querySelectorAll('.went-count').forEach(el => {
    const n = counts.get(el.dataset.uri) || 0;
    el.textContent = countLabel(n, verb);
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
  let real = events.filter(e => e.category !== 'umbrella' && e.uri);
  // A festival has hundreds of films: only ask the index about ones that
  // have started showing — nobody has said they saw the rest yet.
  if (layout === 'films' && today) real = real.filter(e => String(e.record?.startsAt || '').slice(0, 10) <= today);
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
  summary.textContent = `${people} ${people === 1 ? 'person has' : 'people have'} said they ${verb.past}`
    + ` — ${unique.length} ${unique.length === 1 ? 'bead' : 'beads'} so far. Newest first.`;
  items.innerHTML = beadList(beads, (b) => {
    const e = nameOf.get(b.value.subject.uri);
    return { verb, event: e ? { name: e.record.name, href: `/events/${dir}/${e.slug}/` } : null };
  });
  section.hidden = false;
}

function draw(events) {
  const open = new Set([...root.querySelectorAll('details[open]')]
    .map(d => d.closest('.ev')?.id).filter(Boolean));
  const args = { events, today, dir: root.dataset.dir || null, tz, verb };
  if (layout === 'films') {
    const q = root.querySelector('#film-q')?.value;
    root.innerHTML = renderFilms(args);
    if (q) root.querySelector('#film-q').value = q;
    const sel = root.querySelector('#film-section');
    if (sel) sel.value = section;
    open.forEach(id => document.getElementById(id)?.querySelector('details')?.setAttribute('open', ''));
    applyFilms();
    applyCounts();
    return;
  }
  root.innerHTML = layout === 'gallery' ? renderGallery(args) : renderDirectory(args);
  open.forEach(id => document.getElementById(id)?.querySelector('details')?.setAttribute('open', ''));
  applyFilter();
  applyCounts();
}

root.addEventListener('click', async (e) => {
  const viewChip = e.target.closest('.chip.view');
  if (viewChip) {
    view = viewChip.dataset.view;
    keepInUrl();
    applyFilms();
    if (view === 'days' && today) document.getElementById(`d-${today}`)?.scrollIntoView();
    return;
  }
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
  verb = verbOf(listing);
  layout = ['films', 'gallery'].includes(listing.meta?.layout) ? listing.meta.layout : 'week';
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
