/* A gallery's programme: a few long shows with talks and nights dotted
 * through them. Pure: strings in, strings out.
 *
 * An art week reads best day by day; a gallery doesn't — its exhibitions run
 * for months and a visitor's question is "what's on, what's next, and when
 * are the talks?". So: On now, Opening soon, Talks and events (by date), and
 * Recently — kept so that someone who was there last week can still say so.
 */
import { addDays, dateLabel, dayLabel, shape } from './schedule.js';
import { eventHtml, esc } from './render.js';
import { WENT } from './verb.js';

/* Ending within this many days counts as "closing soon" — three weeks, so
 * a visitor planning a weekend sees it coming. */
const CLOSING_DAYS = 21;
/* How far back "Recently" looks. */
const RECENT_DAYS = 60;

/* Which part of the page an event belongs on, and its line beside it. */
export function placeOf(ev, today, tz) {
  const sh = shape(ev.record, tz);
  if (!sh || !ev.group) return null;
  const long = sh.running;
  const t = today || sh.start.date;
  if (sh.endDate < t) {
    if (sh.endDate < addDays(t, -RECENT_DAYS)) return null;
    const when = long ? `Closed ${dayLabel(sh.endDate)}`
      : `${dayLabel(sh.start.date)}${sh.openStart ? '' : ` · ${sh.start.time}`}`;
    return { part: 'recent', sh, when, key: sh.endDate };
  }
  if (long) {
    if (sh.start.date > t) {
      return { part: 'soon', sh, when: `Opens ${dayLabel(sh.start.date)}`, key: sh.start.date };
    }
    const closing = sh.endDate <= addDays(t, CLOSING_DAYS);
    const when = sh.endDate === t ? 'Final day'
      : closing ? `Closes ${dayLabel(sh.endDate)}` : `Until ${dateLabel(sh.endDate)}`;
    return { part: 'now', sh, when, key: sh.endDate };
  }
  const time = sh.openStart ? '' : sh.start.time;
  return { part: 'dated', sh, when: time || 'Time tbc', key: `${sh.start.date} ${time}`, date: sh.start.date };
}

export function renderGallery({ events, today = null, dir = null, tz, verb = WENT }) {
  const parts = { now: [], soon: [], dated: [], recent: [] };
  for (const ev of events) {
    const p = placeOf(ev, today, tz);
    if (p) parts[p.part].push({ ev, ...p });
  }
  const byName = (a, b) => String(a.ev.record.name).localeCompare(String(b.ev.record.name));
  const byKey = (a, b) => a.key.localeCompare(b.key) || byName(a, b);
  parts.now.sort(byKey);
  parts.soon.sort(byKey);
  parts.dated.sort(byKey);
  parts.recent.sort((a, b) => b.key.localeCompare(a.key) || byName(a, b));

  const card = (x) => eventHtml(x, '', dir, verb);
  const section = (id, title, intro, items) => (items.length ? `<section class="day" id="${id}">
  <h2 class="sec">${esc(title)}</h2>
  ${intro ? `<p class="ev-intro">${esc(intro)}</p>` : ''}
  ${items.join('\n  ')}
</section>` : '');

  // Talks and events, one heading per date.
  const days = new Map();
  for (const x of parts.dated) {
    if (!days.has(x.date)) days.set(x.date, []);
    days.get(x.date).push(x);
  }
  const dated = [...days].map(([date, xs]) => `<h3 class="gal-day">${esc(dayLabel(date))}${date === today
    ? ' <span class="status working">today</span>' : ''}</h3>\n  ${xs.map(card).join('\n  ')}`);

  const jump = [
    parts.now.length && '<a href="#now">On now</a>',
    parts.soon.length && '<a href="#soon">Opening soon</a>',
    parts.dated.length && '<a href="#dated">Talks &amp; events</a>',
    parts.recent.length && '<a href="#recent">Recently</a>',
  ].filter(Boolean).join('');

  return `<div class="ev-controls"><div class="jump" role="navigation" aria-label="Sections">${jump}</div></div>
${section('now', 'On now', 'Free to visit. Booking a free ticket is advised.', parts.now.map(card))}
${section('soon', 'Opening soon', '', parts.soon.map(card))}
${section('dated', 'Talks & events', '', dated)}
${section('recent', 'Recently', 'Been to one of these? You can still say so.', parts.recent.map(card))}`;
}
