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
import { londonParts, merge } from './lib/schedule.js';

const root = document.getElementById('directory');
const sourceEl = document.getElementById('source');
const actor = root.dataset.actor;
const today = londonParts(new Date().toISOString())?.date || null;

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

function draw(events) {
  const open = new Set([...root.querySelectorAll('details[open]')]
    .map(d => d.closest('.ev')?.id).filter(Boolean));
  root.innerHTML = renderDirectory({ events, today, dir: root.dataset.dir || null });
  open.forEach(id => document.getElementById(id)?.querySelector('details')?.setAttribute('open', ''));
  applyFilter();
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
  const entries = listing.records || [];
  const total = entries.filter(e => e.category !== 'umbrella').length;

  draw(merge(entries));
  sourceEl.innerHTML = `Checking <code>@${esc(actor)}</code> for the latest…`;

  try {
    const { did, pds } = await resolveActor(actor);
    const records = await listCollection(pds, did, listing.meta?.collection);
    const events = merge(entries, records);
    const live = events.filter(e => e.live && e.category !== 'umbrella').length;
    if (live) draw(events);
    sourceEl.innerHTML = sourceLine({ actor, live, total });
  } catch {
    sourceEl.innerHTML = sourceLine({ actor, live: 0, total, error: true });
  }

  if (location.hash) document.getElementById(location.hash.slice(1))?.scrollIntoView();
}

main();
