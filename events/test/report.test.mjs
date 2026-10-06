import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { belongsTo, canonicalise, personWeek, summarise, weekSpan } from '../lib/report.js';

const listing = JSON.parse(readFileSync(new URL('../frieze-week-london/events.json', import.meta.url), 'utf8'));
const ev = (slug) => listing.records.find(e => e.slug === slug);
const bead = (did, slug, day, note = '') => ({
  did, rkey: `${did}-${slug}-${day}`, uri: `at://${did}/com.cultureblocs.bead/x`,
  value: { createdAt: `${day}T12:00:00.000Z`, note, subject: { uri: ev(slug).atUri } },
});

const beads = [
  bead('did:a', 'frieze-london-2026', '2026-10-15', 'The Code Universe'),
  bead('did:a', 'frieze-masters-2026', '2026-10-15'),
  bead('did:a', 'frieze-london-2026', '2026-10-16', 'Back again'),
  bead('did:b', 'frieze-london-2026', '2026-10-17'),
  bead('did:b', 'frieze-masters-2026', '2026-10-17', 'Spotlight was great'),
  bead('did:c', '1-54-london-2026', '2026-10-17'),
];

test('people are counted once; notes, events reached and widest week add up', () => {
  const s = summarise({ listing, beads, strands: 2, posts: 5 });
  assert.equal(s.people, 3);
  assert.equal(s.beads, 6);
  assert.equal(s.notes, 3);
  assert.equal(s.strands, 2);
  assert.equal(s.posts, 5);
  assert.equal(s.eventsTotal, 30);
  assert.equal(s.eventsReached, 3);
  assert.equal(s.widest, 2);
  assert.deepEqual(s.perEvent.slice(0, 3).map(r => [r.slug, r.people, r.beads]), [
    ['frieze-london-2026', 2, 3], ['frieze-masters-2026', 2, 2], ['1-54-london-2026', 1, 1]]);
});

test('every day of the week is present, even quiet ones', () => {
  const s = summarise({ listing, beads });
  assert.equal(s.perDay[0].date, '2026-10-13');
  assert.equal(s.perDay.at(-1).date, '2026-10-18');
  assert.deepEqual(s.perDay.find(d => d.date === '2026-10-17'), { date: '2026-10-17', label: 'Sat 17 Oct', beads: 3, people: 2 });
  assert.equal(s.perDay.find(d => d.date === '2026-10-14').beads, 0);
  assert.deepEqual(weekSpan(listing), { from: '2026-10-13', to: '2026-10-18' });
});

test('what went together: pairs of events the same people recorded', () => {
  const [top] = summarise({ listing, beads }).pairs;
  assert.deepEqual([top.a.slug, top.b.slug].sort(), ['frieze-london-2026', 'frieze-masters-2026']);
  assert.equal(top.people, 2);
});

test('nothing yet is a valid week', () => {
  const s = summarise({ listing, beads: [] });
  assert.equal(s.people, 0);
  assert.equal(s.eventsReached, 0);
  assert.equal(s.pairs.length, 0);
  assert.equal(s.widest, 0);
  assert.equal(s.perDay.length, 6);
});

test("a person's week groups their beads by day, in order", () => {
  const w = personWeek({ listing, beads: beads.filter(b => b.did === 'did:a') });
  assert.deepEqual(w.days.map(d => [d.label, d.items.length]), [['Thu 15 Oct', 2], ['Fri 16 Oct', 1]]);
  assert.equal(w.events, 2);
  assert.equal(w.days[0].items[0].event.slug, 'frieze-london-2026');
});

test('beads about the directory are recognised by DID or handle, others are not', () => {
  const ok = belongsTo(listing, [listing.meta.did, 'cultureblocs.com']);
  const rkey = ev('pad-london-2026').rkey;
  assert.ok(ok({ value: { subject: { uri: `at://cultureblocs.com/community.lexicon.calendar.event/${rkey}` } } }));
  assert.ok(ok({ value: { subject: { uri: ev('pad-london-2026').atUri } } }));
  assert.ok(!ok({ value: { subject: { uri: `at://did:plc:someoneelse/community.lexicon.calendar.event/${rkey}` } } }));
  assert.ok(!ok({ value: { subject: { uri: 'at://x/community.lexicon.calendar.event/nope' } } }));
  const [c] = canonicalise(listing, [{ value: { subject: { uri: `at://cultureblocs.com/community.lexicon.calendar.event/${rkey}` } } }]);
  assert.equal(c.value.subject.uri, ev('pad-london-2026').atUri);
});
