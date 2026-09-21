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
  const lines = String(narrative || '').split('\n');
  const noMarkers = lines.map(line => line.replace(/^[\s*-]+/, '').trimStart()).join(' ');
  const flat = noMarkers.replace(/\s+/g, ' ').trim();
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
  const sorted = [...records].sort((a, b) => {
    const dayA = dayOf(a.value);
    const dayB = dayOf(b.value);
    if (dayA !== dayB) return dayB.localeCompare(dayA); // Newest first
    const createdA = String(a.value?.createdAt || '');
    const createdB = String(b.value?.createdAt || '');
    return createdB.localeCompare(createdA); // Tie-break by createdAt, newest first
  });
  const p = paging(sorted.length, page, { actor });
  const items = sorted.slice(p.from, p.to)
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

function renderImage(entry, base) {
  const m = imageModel(entry);
  if (!m || !base) return '';
  const dims = m.width && m.height ? ` width="${m.width}" height="${m.height}"` : '';
  return `<img class="bead-image" loading="lazy" src="${esc(base + encodeURIComponent(m.cid))}" alt="${esc(m.alt)}"${dims}>`;
}

function renderBead(b, base) {
  if (b.missing) {
    return `<li class="bead bead-missing"><p>A bead could not be loaded.</p></li>`;
  }
  const v = b.value || {};
  const time = String(v.createdAt || '').slice(11, 16);
  const images = beadImages(v).map((e) => renderImage(e, base)).filter(Boolean).join('');
  return `<li class="bead bead-${esc(v.kind || 'bloc')}">
  ${time ? `<span class="bead-time">${esc(time)}</span>` : ''}
  ${v.note ? `<div class="bead-note">${blocksHtml(v.note)}</div>` : ''}
  ${images ? `<div class="bead-images">${images}</div>` : ''}
</li>`;
}

export function renderStrand({ strand, beads, actor, blobBase: base }) {
  const v = strand?.value || {};
  const day = dayOf(v);
  const meta = [longDay(day), v.place?.name || ''].filter(Boolean).join(' · ');
  return `<article class="strand-page">
  <p class="back"><a href="${esc(wallHref(actor))}">← ${esc(actor)}</a></p>
  <h1 class="strand-title">${esc(v.title || longDay(day))}</h1>
  ${meta ? `<p class="strand-meta">${esc(meta)}</p>` : ''}
  ${v.narrative ? `<div class="narrative">${blocksHtml(v.narrative)}</div>` : ''}
  ${beads.length ? `<ol class="beads">${beads.map((b) => renderBead(b, base)).join('\n')}</ol>` : ''}
</article>`;
}
