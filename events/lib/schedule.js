/* Turning event records into a week you can read. Pure: no fetch, no DOM.
 *
 * Every date is read in the directory's own time zone — Europe/London unless
 * the listing's meta.tz says otherwise (Paris Art Week is Europe/Paris). The
 * records carry offsets (+01:00 before 25 October, +00:00 after, in London),
 * so a visitor in New York still sees the fair open at 11:00 — the time on
 * the door, not on their phone.
 */

export const TZ = 'Europe/London';

/* A listing's time zone: meta.tz if it names a real IANA zone, else London. */
export function tzOf(listing) {
  const tz = listing?.meta?.tz;
  if (typeof tz !== 'string' || !tz) return TZ;
  try { new Intl.DateTimeFormat('en-GB', { timeZone: tz }); return tz; } catch { return TZ; }
}

/* The lexicon has no all-day flag; the dataset marks date-only events
 * 00:00 → 23:59. Anything ending before 06:00 is the tail of a night, not
 * another day (a party running to 03:00 belongs to the evening it started). */
const NIGHT_ENDS_BEFORE = 6 * 60;
/* Longer than this and an event is "running" (an exhibition), not a day's plan. */
export const RUNNING_AFTER_DAYS = 7;

export const FILTERS = [
  ['all', 'Everything'],
  ['fairs', 'Fairs'],
  ['talks', 'Talks & film'],
  ['exhibitions', 'Exhibitions'],
  ['galleries', 'Gallery days'],
  ['nights', 'Performance & nights'],
];

const GROUP_OF = {
  fair: 'fairs',
  talk: 'talks', talks: 'talks', screening: 'talks',
  film: 'films',
  exhibition: 'exhibitions', commission: 'exhibitions',
  'gallery-day': 'galleries',
  party: 'nights', performance: 'nights',
};

export const groupOf = (category) => GROUP_OF[category] || null;

const partsFmts = new Map();
function partsFmt(tz) {
  if (!partsFmts.has(tz)) {
    partsFmts.set(tz, new Intl.DateTimeFormat('en-GB', {
      timeZone: tz, year: 'numeric', month: '2-digit', day: '2-digit',
      hour: '2-digit', minute: '2-digit', hourCycle: 'h23',
    }));
  }
  return partsFmts.get(tz);
}

/* { date: '2026-10-15', time: '11:00', mins: 660 } in the given zone. */
export function zonedParts(iso, tz = TZ) {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return null;
  const p = Object.fromEntries(partsFmt(tz).formatToParts(d).map(x => [x.type, x.value]));
  const hour = p.hour === '24' ? '00' : p.hour;
  return {
    date: `${p.year}-${p.month}-${p.day}`,
    time: `${hour}:${p.minute}`,
    mins: Number(hour) * 60 + Number(p.minute),
  };
}

/* The same, in London (the default directory zone). */
export const londonParts = (iso) => zonedParts(iso, TZ);

const utcNoon = (date) => new Date(`${date}T12:00:00Z`);
export const dayDiff = (a, b) => Math.round((utcNoon(b) - utcNoon(a)) / 86400000);
export function addDays(date, n) {
  const d = utcNoon(date);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

const dayFmt = new Intl.DateTimeFormat('en-GB',
  { timeZone: 'UTC', weekday: 'short', day: 'numeric', month: 'short' });
const shortFmt = new Intl.DateTimeFormat('en-GB',
  { timeZone: 'UTC', day: 'numeric', month: 'short', year: 'numeric' });
/* 'Thu 15 Oct' */
export const dayLabel = (date) => dayFmt.format(utcNoon(date)).replace(',', '');
/* '15 Oct 2026' */
export const dateLabel = (date) => shortFmt.format(utcNoon(date));

/* Join the bundled listing with what the repository holds now.
 *
 * The listing says which records belong to this directory (and their
 * site-only category); the repository says what they currently are. A
 * record that has been published wins over the bundled copy, so an edit
 * made with the publish script shows here without a site deploy. Records
 * in the collection that this directory doesn't list are ignored — other
 * directories share the collection. */
export function merge(entries, liveRecords = []) {
  const live = new Map();
  for (const r of liveRecords || []) {
    const rkey = String(r?.uri || '').split('/').pop();
    if (rkey && r?.value) live.set(rkey, r);
  }
  return (entries || []).map(e => {
    const hit = live.get(e.rkey);
    return {
      slug: e.slug,
      category: e.category,
      group: groupOf(e.category),
      rkey: e.rkey,
      uri: hit?.uri || e.atUri,
      record: hit?.value || e.record,
      live: Boolean(hit),
      // Site-only detail a festival listing carries beside each record.
      ...(e.film ? { film: e.film } : {}),
      ...(e.screenings ? { screenings: e.screenings } : {}),
    };
  });
}

/* Where an event sits in time, in the directory's days. */
export function shape(record, tz = TZ) {
  const s = zonedParts(record?.startsAt, tz);
  if (!s) return null;
  const hasEnd = Boolean(record.endsAt && zonedParts(record.endsAt, tz));
  const e = hasEnd ? zonedParts(record.endsAt, tz) : s;
  let endDate = e.date;
  if (hasEnd && endDate > s.date && e.mins < NIGHT_ENDS_BEFORE) endDate = addDays(endDate, -1);
  if (endDate < s.date) endDate = s.date;
  const days = dayDiff(s.date, endDate) + 1;
  return {
    start: s, end: e, hasEnd, endDate, days,
    openStart: s.time === '00:00',
    openEnd: !hasEnd || e.time === '23:59',
    running: days > RUNNING_AFTER_DAYS,
  };
}

/* The line shown beside an event on a given day. */
export function whenLabel(sh, date) {
  if (sh.days === 1) {
    if (sh.openStart && sh.openEnd) return sh.hasEnd ? 'All day' : 'Time tbc';
    if (sh.openStart) return `Until ${sh.end.time}`;
    if (!sh.hasEnd) return `From ${sh.start.time}`;
    if (sh.openEnd) return `From ${sh.start.time}`;
    return `${sh.start.time}–${sh.end.time}`;
  }
  const n = dayDiff(sh.start.date, date) + 1;
  if (n === 1) return sh.openStart ? `Opens · day 1 of ${sh.days}` : `Opens ${sh.start.time}`;
  if (date === sh.endDate) return sh.openEnd ? 'Final day' : `Final day · until ${sh.end.time}`;
  return `Day ${n} of ${sh.days}`;
}

/* A single-day event with a start time is something to be at; everything
 * else that day is somewhere that's open. */
const isTimed = (sh) => sh.days === 1 && !sh.openStart;

/* The week as days, plus what runs throughout. Hidden categories (the
 * umbrella record) and records whose dates don't parse are dropped. */
export function arrange(events, tz = TZ) {
  const days = new Map();
  const running = [];
  for (const ev of events) {
    if (!ev.group) continue;
    const sh = shape(ev.record, tz);
    if (!sh) continue;
    if (sh.running) { running.push({ ev, sh }); continue; }
    for (let d = sh.start.date; d <= sh.endDate; d = addDays(d, 1)) {
      if (!days.has(d)) days.set(d, { date: d, timed: [], open: [] });
      const item = { ev, sh, when: whenLabel(sh, d) };
      (isTimed(sh) ? days.get(d).timed : days.get(d).open).push(item);
    }
  }
  const byName = (a, b) => String(a.ev.record.name).localeCompare(String(b.ev.record.name));
  const list = [...days.values()].sort((a, b) => a.date.localeCompare(b.date));
  for (const day of list) {
    day.timed.sort((a, b) => a.sh.start.mins - b.sh.start.mins || byName(a, b));
    // Openings and final days first; mid-run days after.
    const weight = (x) => (x.sh.days === 1 ? 0 : x.when.startsWith('Opens') ? 1
      : x.when.startsWith('Final') ? 2 : 3);
    day.open.sort((a, b) => weight(a) - weight(b) || byName(a, b));
  }
  running.sort((a, b) => a.sh.endDate.localeCompare(b.sh.endDate) || byName(a, b));
  return { days: list, running };
}

export const statusOf = (record) => String(record?.status || '').split('#').pop() || 'scheduled';
