/* The week in numbers. Pure: beads in, figures out — no network, no DOM.
 *
 * `beads` are { did, rkey, uri, value, profile } as readBeads returns them,
 * already filtered to this directory's events and the hide list. People
 * are counted by DID, so one person recording three days is one person.
 */
import { addDays, dayLabel } from './schedule.js';

export function summarise({ listing, beads, strands = 0, posts = 0 }) {
  const events = (listing?.records || []).filter(e => e.category !== 'umbrella');
  const byUri = new Map(events.map(e => [e.atUri, e]));
  const eventOf = (b) => byUri.get(String(b.value?.subject?.uri || ''));
  const dayOf = (b) => String(b.value?.createdAt || '').slice(0, 10);

  const people = new Set(beads.map(b => b.did));
  const notes = beads.filter(b => String(b.value?.note || '').trim()).length;

  // per event: people and beads
  const perEventMap = new Map(events.map(e => [e.atUri, { slug: e.slug, name: e.record.name, category: e.category, people: new Set(), beads: 0 }]));
  for (const b of beads) {
    const row = perEventMap.get(String(b.value?.subject?.uri || ''));
    if (!row) continue;
    row.people.add(b.did);
    row.beads += 1;
  }
  const perEvent = [...perEventMap.values()]
    .map(r => ({ ...r, people: r.people.size }))
    .sort((a, b) => b.people - a.people || b.beads - a.beads || a.name.localeCompare(b.name));

  // per day, across the directory's span (and any day a bead names)
  const days = new Map();
  const span = weekSpan(listing);
  if (span) for (let d = span.from; d <= span.to; d = addDays(d, 1)) days.set(d, { date: d, beads: 0, people: new Set() });
  for (const b of beads) {
    const d = dayOf(b);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(d)) continue;
    if (!days.has(d)) days.set(d, { date: d, beads: 0, people: new Set() });
    days.get(d).beads += 1;
    days.get(d).people.add(b.did);
  }
  const perDay = [...days.values()].sort((a, b) => a.date.localeCompare(b.date))
    .map(d => ({ date: d.date, label: dayLabel(d.date), beads: d.beads, people: d.people.size }));

  // what went together: pairs of events the same person recorded
  const eventsByPerson = new Map();
  for (const b of beads) {
    const e = eventOf(b);
    if (!e) continue;
    if (!eventsByPerson.has(b.did)) eventsByPerson.set(b.did, new Set());
    eventsByPerson.get(b.did).add(e.atUri);
  }
  const pairCount = new Map();
  for (const set of eventsByPerson.values()) {
    const list = [...set].sort();
    for (let i = 0; i < list.length; i++) {
      for (let j = i + 1; j < list.length; j++) {
        const k = `${list[i]}|${list[j]}`;
        pairCount.set(k, (pairCount.get(k) || 0) + 1);
      }
    }
  }
  const pairs = [...pairCount.entries()]
    .map(([k, n]) => { const [a, b] = k.split('|'); return { a: byUri.get(a), b: byUri.get(b), people: n }; })
    .sort((x, y) => y.people - x.people || x.a.record.name.localeCompare(y.a.record.name))
    .slice(0, 8);

  const widest = Math.max(0, ...[...eventsByPerson.values()].map(s => s.size));

  return {
    people: people.size,
    beads: beads.length,
    notes,
    strands,
    posts,
    eventsTotal: events.length,
    eventsReached: perEvent.filter(r => r.people > 0).length,
    perEvent,
    perDay,
    pairs,
    widest,
  };
}

/* The directory's own week: from the umbrella record if there is one,
 * else the earliest start to the latest end of short events. */
export function weekSpan(listing) {
  const umbrella = (listing?.records || []).find(e => e.category === 'umbrella');
  const rec = umbrella?.record;
  const from = String(rec?.startsAt || '').slice(0, 10);
  const to = String(rec?.endsAt || '').slice(0, 10);
  return /^\d{4}-\d{2}-\d{2}$/.test(from) && /^\d{4}-\d{2}-\d{2}$/.test(to) ? { from, to } : null;
}

/* A person's week: their beads for this directory, by day. */
export function personWeek({ listing, beads }) {
  const events = new Map((listing?.records || []).map(e => [e.atUri, e]));
  const days = new Map();
  for (const b of [...beads].sort((x, y) => String(x.value?.createdAt).localeCompare(String(y.value?.createdAt)))) {
    const d = String(b.value?.createdAt || '').slice(0, 10);
    if (!days.has(d)) days.set(d, []);
    days.get(d).push({ bead: b, event: events.get(String(b.value?.subject?.uri || '')) || null });
  }
  const list = [...days.entries()].map(([date, items]) => ({ date, label: dayLabel(date), items }));
  return {
    days: list,
    beads: beads.length,
    events: new Set(beads.map(b => b.value?.subject?.uri)).size,
  };
}

/* Is this bead about one of the directory's events? Matches by collection
 * and record key, so either the publisher's DID or handle form counts. */
export function belongsTo(listing, publisher = []) {
  const keys = new Set((listing?.records || []).filter(e => e.category !== 'umbrella').map(e => e.rkey));
  const authorities = new Set(publisher.filter(Boolean));
  return (bead) => {
    const m = /^at:\/\/([^/]+)\/community\.lexicon\.calendar\.event\/([^/]+)$/.exec(String(bead?.value?.subject?.uri || ''));
    return Boolean(m && keys.has(m[2]) && (authorities.size === 0 || authorities.has(m[1])));
  };
}

/* Event URIs in a person's beads may use the publisher's handle; the
 * report keys everything by the listing's DID form. */
export function canonicalise(listing, beads) {
  const byKey = new Map((listing?.records || []).map(e => [e.rkey, e.atUri]));
  return beads.map(b => {
    const rkey = String(b.value?.subject?.uri || '').split('/').pop();
    const uri = byKey.get(rkey);
    return uri && uri !== b.value?.subject?.uri
      ? { ...b, value: { ...b.value, subject: { ...b.value.subject, uri } } } : b;
  });
}
