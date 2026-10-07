/* HTML for a film festival: one entry per film, not per screening. Pure.
 *
 * A festival listing is a different shape from an art week. Most films show
 * two or three times over twelve days, so a film is one record (first
 * screening to last) and its screenings live beside it in the listing as
 * site-only `screenings` — the page can then show the programme both ways:
 *
 *   A–Z     every film once, by title, with when and where it shows
 *   By day  each day's screenings in time order, each pointing at its film
 *
 * Filtering (search, section, view) is done by the page on data-attributes,
 * so this module only ever renders the whole thing.
 */
import { esc, eventLinks, safeHref } from './render.js';
import { TZ, dayLabel, statusOf, zonedParts } from './schedule.js';
import { WENT } from './verb.js';

/* Titles file under their first real word, as the festival's own A–Z does:
 * "The Animals" under A, "A Bit of Light" under B, "14th" under #. */
const ARTICLE = /^(the|a|an|la|le|les|el|il)\s+/i;
export function sortTitle(name) {
  return String(name || '').trim().replace(/^[("'‘“(]+/, '').replace(ARTICLE, '');
}
export function letterOf(name) {
  const c = sortTitle(name).normalize('NFD').replace(/[̀-ͯ]/g, '').charAt(0).toUpperCase();
  return /[A-Z]/.test(c) ? c : '#';
}
const collator = new Intl.Collator('en', { sensitivity: 'base', numeric: true });
export const byTitle = (a, b) => collator.compare(sortTitle(a.record?.name), sortTitle(b.record?.name));

/* Everything a search box should find a film by. */
export function searchText(ev) {
  const f = ev.film || {};
  return [ev.record?.name, f.programme, f.section, ...(f.directors || []), f.cast, f.country]
    .filter(Boolean).join(' ').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');
}

/* "Dir. Cristian Mungiu · Romania-France 2026 · 146min" */
export function creditLine(film) {
  if (!film) return '';
  const parts = [];
  if (film.directors?.length) parts.push(`Dir. ${film.directors.join(', ')}`);
  const made = [film.country, film.year].filter(Boolean).join(' ');
  if (made) parts.push(made);
  if (film.runtime) parts.push(`${film.runtime}min`);
  return parts.join(' · ');
}

/* Screenings in the directory's zone, sorted, unparseable ones dropped. */
export function screeningsOf(ev, tz = TZ) {
  return (ev.screenings || [])
    .map(s => ({ ...s, at: zonedParts(s.start, tz) }))
    .filter(s => s.at)
    .sort((a, b) => String(a.start).localeCompare(String(b.start)));
}

const screeningLine = (s, today) =>
  `<li${s.at.date === today ? ' class="today"' : ''}><span class="sc-when">${esc(dayLabel(s.at.date))} ${esc(s.at.time)}</span>`
  + ` <span class="sc-where">${esc(s.venue || '')}</span></li>`;

function filmHtml(ev, { dir, verb, tz, today, idPrefix = '' }) {
  const r = ev.record || {};
  const f = ev.film || {};
  const { page, went } = eventLinks(ev, dir);
  const shows = screeningsOf(ev, tz);
  const status = statusOf(r);
  const bfi = safeHref(f.bfi);
  return `<article class="ev ev-films film" id="${esc(idPrefix + ev.slug)}" data-section="${esc(f.section || '')}" data-q="${esc(searchText(ev))}">
  <div class="ev-when">${shows.length ? `${shows.length} screening${shows.length === 1 ? '' : 's'}` : 'See listing'}</div>
  <div class="ev-body">
    <h3>${page ? `<a href="${esc(page)}">${esc(r.name)}</a>` : esc(r.name)}${status === 'cancelled' ? ' <span class="status prototype">cancelled</span>' : ''}</h3>
    ${creditLine(f) ? `<p class="film-credit">${esc(creditLine(f))}</p>` : ''}
    ${f.programme ? `<p class="film-prog">Short, in the programme <b>${esc(f.programme)}</b></p>` : ''}
    ${shows.length ? `<ul class="film-shows">${shows.map(s => screeningLine(s, today)).join('')}</ul>` : ''}
    <div class="ev-actions">
    ${went ? `<a class="went-btn" href="${esc(went)}">${esc(verb.button)}</a>` : ''}
    <span class="went-count" data-uri="${esc(ev.uri)}"></span>
    <details>
      <summary>Details</summary>
      ${f.cast ? `<p><b>With</b> ${esc(f.cast)}</p>` : ''}
      ${f.section ? `<p><b>Section</b> ${esc(f.section)}</p>` : ''}
      ${bfi ? `<p class="ev-links"><a href="${esc(bfi)}" rel="noopener">BFI page and tickets</a></p>` : ''}
      <p class="ev-ref">Reference this film in a bead:<br>
        <code>${esc(ev.uri)}</code>
        <button type="button" class="copy" data-copy="${esc(ev.uri)}">Copy</button></p>
    </details>
    </div>
  </div>
</article>`;
}

/* One screening as a line in the day view. */
function slotHtml({ ev, s }, { dir, verb }) {
  const r = ev.record || {};
  const f = ev.film || {};
  const { page, went } = eventLinks(ev, dir);
  return `<article class="ev ev-films slot" data-section="${esc(f.section || '')}" data-q="${esc(searchText(ev))}">
  <div class="ev-when">${esc(s.at.time)}</div>
  <div class="ev-body">
    <h3>${page ? `<a href="${esc(page)}">${esc(f.programme || r.name)}</a>` : esc(f.programme || r.name)}</h3>
    ${f.programme ? `<p class="film-prog">includes <b>${esc(r.name)}</b></p>` : ''}
    <p class="ev-where">${esc(s.venue || '')}</p>
    ${creditLine(f) && !f.programme ? `<p class="film-credit">${esc(creditLine(f))}</p>` : ''}
    <div class="ev-actions">
    ${went ? `<a class="went-btn" href="${esc(went)}">${esc(verb.button)}</a>` : ''}
    <span class="went-count" data-uri="${esc(ev.uri)}"></span>
    </div>
  </div>
</article>`;
}

/* The day view: a shorts programme is one screening however many films it
 * holds, so its films collapse to one line naming the programme. */
export function daySlots(films, tz = TZ) {
  const days = new Map();
  const seen = new Set();
  for (const ev of films) {
    for (const s of screeningsOf(ev, tz)) {
      const key = ev.film?.programme ? `${ev.film.programme}|${s.start}|${s.venue}` : null;
      if (key && seen.has(key)) continue;
      if (key) seen.add(key);
      if (!days.has(s.at.date)) days.set(s.at.date, []);
      days.get(s.at.date).push({ ev, s });
    }
  }
  return [...days.entries()].sort(([a], [b]) => a.localeCompare(b)).map(([date, slots]) => ({
    date,
    slots: slots.sort((a, b) => a.s.at.mins - b.s.at.mins
      || collator.compare(a.ev.film?.programme || a.ev.record?.name, b.ev.film?.programme || b.ev.record?.name)),
  }));
}

export const sectionsOf = (films) =>
  [...new Set(films.map(e => e.film?.section).filter(Boolean))].sort(collator.compare);

/* The whole programme, both views; the page shows one at a time. */
export function renderFilms({ events, today = null, dir = null, tz = TZ, verb = WENT }) {
  const films = events.filter(e => e.category !== 'umbrella' && e.record).sort(byTitle);
  const letters = new Map();
  for (const ev of films) {
    const l = letterOf(ev.record.name);
    if (!letters.has(l)) letters.set(l, []);
    letters.get(l).push(ev);
  }
  const order = [...letters.keys()].sort((a, b) => (a === '#' ? -1 : b === '#' ? 1 : a.localeCompare(b)));
  const az = order.map(l => `<section class="day letter" id="l-${l === '#' ? 'num' : l}" data-day="${l}">
  <h2 class="sec">${esc(l)}</h2>
  ${letters.get(l).map(ev => filmHtml(ev, { dir, verb, tz, today })).join('\n')}
</section>`).join('\n');

  const days = daySlots(films, tz);
  const byDay = days.map(d => `<section class="day" id="d-${esc(d.date)}" data-day="${esc(d.date)}">
  <h2 class="sec">${esc(dayLabel(d.date))}${d.date === today ? ' <span class="status working">today</span>' : ''}</h2>
  ${d.slots.map(x => slotHtml(x, { dir, verb })).join('\n')}
</section>`).join('\n');

  const sections = sectionsOf(films);
  const letterJump = order.map(l => `<a href="#l-${l === '#' ? 'num' : l}">${esc(l)}</a>`).join('');
  const dayJump = days.map(d => `<a href="#d-${d.date}"${d.date === today ? ' aria-current="date"' : ''}>${esc(dayLabel(d.date))}</a>`).join('');
  return `<div class="ev-controls film-controls">
  <div class="film-bar">
    <div class="chips" role="group" aria-label="View">
      <button type="button" class="chip view" data-view="az" aria-pressed="true">A–Z</button>
      <button type="button" class="chip view" data-view="days" aria-pressed="false">By day</button>
    </div>
    <label class="film-find"><span class="sr">Find a film</span>
      <input type="search" id="film-q" placeholder="Find a film, director or programme" autocomplete="off"></label>
    ${sections.length > 1 ? `<label class="film-find"><span class="sr">Section</span>
      <select id="film-section"><option value="">All sections</option>${sections.map(s => `<option>${esc(s)}</option>`).join('')}</select></label>` : ''}
  </div>
  <div class="jump" role="navigation" aria-label="Letters" data-for="az">${letterJump}</div>
  <div class="jump" role="navigation" aria-label="Days" data-for="days" hidden>${dayJump}</div>
  <p class="film-count" id="film-count" aria-live="polite">${films.length} films</p>
</div>
<div class="film-view" data-view="az">${az}</div>
<div class="film-view" data-view="days" hidden>${byDay}</div>`;
}
