/* Pure record -> model -> HTML. No DOM, no network.
 *
 * The class names are the contract wall.css styles, so they are an API:
 * do not rename them casually.
 */
import { beadImages, blocksHtml, esc, imageModel } from './embed.js';
import { strandHref, wallHref } from './route.js';

export const PAGE_SIZE = 10;
const OPENING_MAX = 240;

const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July',
  'August', 'September', 'October', 'November', 'December'];

/* The day a strand is about, which is `day` when it has one and the moment it
 * was written when it does not. */
export function dayOf(value) {
  const raw = String(value?.day || value?.createdAt || '');
  return raw.slice(0, 10);
}

export function longDay(iso) {
  const [y, m, d] = String(iso || '').split('-').map(Number);
  if (!y || !m || !d) return '';
  return `${d} ${MONTHS[m - 1]} ${y}`;
}

/* The first words of the narrative, cut on a word boundary. A summary is an
 * invitation, not the thing itself. */
export function opening(narrative) {
  const flat = String(narrative || '').replace(/\s+/g, ' ').trim();
  if (flat.length <= OPENING_MAX) return flat;
  const cut = flat.slice(0, OPENING_MAX - 1);
  const at = cut.lastIndexOf(' ');
  return `${(at > 40 ? cut.slice(0, at) : cut).trimEnd()}…`;
}

export function strandSummary(record, { actor }) {
  const v = record?.value || {};
  const day = dayOf(v);
  const rkey = String(record?.uri || '').split('/').pop() || '';
  return {
    rkey,
    href: strandHref(actor, rkey),
    title: v.title || longDay(day),
    day,
    dayLong: longDay(day),
    place: v.place?.name || '',
    opening: opening(v.narrative),
    beads: Array.isArray(v.items) ? v.items.length : 0,
  };
}

export function renderSummary(m) {
  const meta = [m.dayLong, m.place, m.beads ? `${m.beads} bead${m.beads === 1 ? '' : 's'}` : '']
    .filter(Boolean).join(' · ');
  return `<article class="strand">
  <h2 class="strand-title"><a href="${esc(m.href)}">${esc(m.title)}</a></h2>
  ${meta ? `<p class="strand-meta">${esc(meta)}</p>` : ''}
  ${m.opening ? `<p class="strand-opening">${esc(m.opening)}</p>` : ''}
</article>`;
}

/* Where you are in the list. A page past the end is the last page: a URL
 * someone kept after publishing more should not show an empty wall. */
export function paging(total, page, { actor } = {}) {
  const pages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const at = Math.min(Math.max(1, page || 1), pages);
  return {
    page: at,
    pages,
    from: (at - 1) * PAGE_SIZE,
    to: Math.min(at * PAGE_SIZE, total),
    prevHref: at > 1 && actor ? wallHref(actor, at - 1) : null,
    nextHref: at < pages && actor ? wallHref(actor, at + 1) : null,
  };
}

export function renderWall({ actor, records, page }) {
  if (!records.length) {
    return `<p class="notice">Nothing published yet.</p>`;
  }
  const p = paging(records.length, page, { actor });
  const items = records.slice(p.from, p.to)
    .map((r) => renderSummary(strandSummary(r, { actor }))).join('\n');
  const nav = p.pages > 1
    ? `<nav class="paging">
  ${p.prevHref ? `<a class="newer" href="${esc(p.prevHref)}">newer</a>` : '<span></span>'}
  <span class="where">page ${p.page} of ${p.pages}</span>
  ${p.nextHref ? `<a class="older" href="${esc(p.nextHref)}">older</a>` : '<span></span>'}
</nav>`
    : '';
  return `<h1 class="wall-title">${esc(actor)}</h1>\n${items}\n${nav}`;
}
