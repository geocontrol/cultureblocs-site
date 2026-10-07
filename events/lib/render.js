/* HTML for an event directory. Pure: strings in, strings out.
 *
 * Every value from a record is escaped — the records are ours today, but
 * they arrive over the network and the page must not care who wrote them.
 */
import { FILTERS, arrange, dateLabel, dayLabel, statusOf } from './schedule.js';
import { WENT } from './verb.js';

export const esc = (s) => String(s ?? '').replace(/[&<>"']/g, c => ({
  '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
}[c]));

/* Only http(s) links from a record become hrefs. */
export function safeHref(u) {
  try {
    const url = new URL(String(u));
    return url.protocol === 'https:' || url.protocol === 'http:' ? url.href : null;
  } catch {
    return null;
  }
}

const place = (record) => {
  const loc = (record?.locations || []).find(l =>
    String(l?.$type || '').endsWith('location.address') || l?.name);
  if (!loc) return null;
  const query = [loc.name, loc.street, loc.postalCode, loc.locality].filter(Boolean).join(', ');
  return {
    name: loc.name || loc.street || loc.locality || 'Venue',
    map: `https://www.openstreetmap.org/search?query=${encodeURIComponent(query)}`,
  };
};

const STATUS_NOTE = {
  cancelled: 'cancelled', postponed: 'postponed', rescheduled: 'rescheduled', planned: 'dates tbc',
};

/* Where an event's own page is, and where "I went" goes. `dir` is the
 * directory's folder name; without it, events link nowhere new. */
export function eventLinks(ev, dir) {
  if (!dir) return { page: null, went: null };
  const page = `/events/${encodeURIComponent(dir)}/${encodeURIComponent(ev.slug)}/`;
  const went = `/went/?dir=${encodeURIComponent(dir)}&event=${encodeURIComponent(ev.uri)}`;
  return { page, went };
}

export function eventHtml({ ev, when }, idSuffix, dir, verb = WENT) {
  const r = ev.record || {};
  const { page, went } = eventLinks(ev, dir);
  const where = place(r);
  const status = STATUS_NOTE[statusOf(r)];
  const links = (r.uris || [])
    .map(u => ({ href: safeHref(u?.uri), name: u?.name || u?.uri }))
    .filter(u => u.href)
    .map(u => `<a href="${esc(u.href)}" rel="noopener">${esc(u.name)}</a>`)
    .join(' · ');
  return `<article class="ev ev-${esc(ev.group)}${status ? ' ev-flag' : ''}" data-group="${esc(ev.group)}" id="${esc(ev.slug)}${idSuffix}">
  <div class="ev-when">${esc(when)}</div>
  <div class="ev-body">
    <h3>${page ? `<a href="${esc(page)}">${esc(r.name)}</a>` : esc(r.name)}${status ? ` <span class="status prototype">${esc(status)}</span>` : ''}</h3>
    ${where ? `<p class="ev-where"><a href="${esc(where.map)}" rel="noopener">${esc(where.name)}</a></p>` : ''}
    <div class="ev-actions">
    ${went ? `<a class="went-btn" href="${esc(went)}">${esc(verb.button)}</a>` : ''}
    <span class="went-count" data-uri="${esc(ev.uri)}"></span>
    <details>
      <summary>Details</summary>
      ${r.description ? `<p>${esc(r.description)}</p>` : ''}
      ${links ? `<p class="ev-links">${links}</p>` : ''}
      <p class="ev-ref">Reference this event in a bead:<br>
        <code>${esc(ev.uri)}</code>
        <button type="button" class="copy" data-copy="${esc(ev.uri)}">Copy</button></p>
    </details>
    </div>
  </div>
</article>`;
}

function dayHtml(day, today, dir, verb) {
  const isToday = day.date === today;
  const timed = day.timed.map(x => eventHtml(x, `--${day.date}`, dir, verb)).join('\n');
  const open = day.open.map(x => eventHtml(x, `--${day.date}`, dir, verb)).join('\n');
  return `<section class="day" id="d-${esc(day.date)}" data-day="${esc(day.date)}">
  <h2 class="sec">${esc(dayLabel(day.date))}${isToday ? ' <span class="status working">today</span>' : ''}</h2>
  ${timed ? `<div class="ev-group" data-kind="timed">${timed}</div>` : ''}
  ${open ? `<div class="ev-group" data-kind="open"><p class="ev-sub"${timed ? '' : ' hidden'}>Open this day</p>${open}</div>` : ''}
</section>`;
}

function runningHtml(running, weekEnd, dir, verb) {
  if (!running.length) return '';
  const items = running.map(({ ev, sh }) => {
    const closing = sh.endDate <= weekEnd;
    const when = closing
      ? `Closes ${dayLabel(sh.endDate)}`
      : `Until ${dateLabel(sh.endDate)}`;
    return eventHtml({ ev, when }, '', dir, verb);
  });
  return `<section class="day" id="running" data-day="running">
  <h2 class="sec">On throughout the week</h2>
  <p class="ev-intro">Exhibitions open across the week. Check each venue for daily hours.</p>
  ${items.join('\n  ')}
</section>`;
}

export function sourceLine({ actor, live, total, error }) {
  if (live === total && total > 0) {
    return `Live from <code>@${esc(actor)}</code> · all ${total} events read from the repository just now.`;
  }
  if (live > 0) {
    return `Live from <code>@${esc(actor)}</code> · ${live} of ${total} events published so far; the rest are shown from the prepared listing.`;
  }
  return error
    ? `Showing the prepared listing — <code>@${esc(actor)}</code> couldn’t be reached just now.`
    : `Showing the prepared listing — these events are not yet published to <code>@${esc(actor)}</code>.`;
}

/* The whole schedule. `today` is a date string in the directory's zone
 * (`tz`, London by default) or null. */
export function renderDirectory({ events, today = null, dir = null, tz, verb = WENT }) {
  const { days, running } = arrange(events, tz);
  const weekEnd = days.length ? days[days.length - 1].date : '';
  const groups = new Set(events.map(e => e.group).filter(Boolean));
  const filters = FILTERS.filter(([key]) => key === 'all' || groups.has(key))
    .map(([key, label]) =>
      `<button type="button" class="chip" data-filter="${key}" aria-pressed="${key === 'all'}">${esc(label)}</button>`)
    .join('');
  const jump = [
    ...days.map(d => `<a href="#d-${d.date}"${d.date === today ? ' aria-current="date"' : ''}>${esc(dayLabel(d.date))}</a>`),
    ...(running.length ? ['<a href="#running">All week</a>'] : []),
  ].join('');
  return `<div class="ev-controls">
  <div class="chips" role="group" aria-label="Show">${filters}</div>
  <div class="jump" role="navigation" aria-label="Days">${jump}</div>
</div>
${days.map(d => dayHtml(d, today, dir, verb)).join('\n')}
${runningHtml(running, weekEnd, dir, verb)}`;
}
