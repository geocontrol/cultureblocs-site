import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { arrange, dayLabel, londonParts, merge, shape, whenLabel } from '../lib/schedule.js';

const listing = JSON.parse(readFileSync(
  new URL('../frieze-week-london/events.json', import.meta.url), 'utf8'));
const rec = (startsAt, endsAt) => ({ name: 'x', startsAt, ...(endsAt ? { endsAt } : {}) });

test('times are read in London whatever the offset written', () => {
  assert.deepEqual(londonParts('2026-10-15T11:00:00+01:00'), { date: '2026-10-15', time: '11:00', mins: 660 });
  assert.deepEqual(londonParts('2026-10-15T10:00:00Z'), { date: '2026-10-15', time: '11:00', mins: 660 });
  // after the clocks go back, +00:00 is London time
  assert.equal(londonParts('2026-11-01T23:59:00+00:00').date, '2026-11-01');
  assert.equal(londonParts('not a date'), null);
});

test('a party running past midnight belongs to the evening it started', () => {
  const sh = shape(rec('2026-10-13T20:30:00+01:00', '2026-10-14T03:00:00+01:00'));
  assert.equal(sh.days, 1);
  assert.equal(whenLabel(sh, '2026-10-13'), '20:30–03:00');
});

test('labels for single-day events', () => {
  assert.equal(whenLabel(shape(rec('2026-10-15T12:00:00+01:00')), '2026-10-15'), 'From 12:00');
  assert.equal(whenLabel(shape(rec('2026-10-09T16:00:00+01:00', '2026-10-09T20:00:00+01:00')), '2026-10-09'), '16:00–20:00');
  assert.equal(whenLabel(shape(rec('2026-10-15T00:00:00+01:00', '2026-10-15T23:59:00+01:00')), '2026-10-15'), 'All day');
});

test('labels across a multi-day fair', () => {
  const sh = shape(rec('2026-10-14T11:00:00+01:00', '2026-10-18T18:00:00+01:00'));
  assert.equal(sh.days, 5);
  assert.equal(whenLabel(sh, '2026-10-14'), 'Opens 11:00');
  assert.equal(whenLabel(sh, '2026-10-16'), 'Day 3 of 5');
  assert.equal(whenLabel(sh, '2026-10-18'), 'Final day · until 18:00');
  const open = shape(rec('2026-10-15T00:00:00+01:00', '2026-10-18T23:59:00+01:00'));
  assert.equal(whenLabel(open, '2026-10-15'), 'Opens · day 1 of 4');
  assert.equal(whenLabel(open, '2026-10-18'), 'Final day');
});

test('the live repository wins over the bundled copy, unknown records are ignored', () => {
  const entries = [{ slug: 'a', category: 'fair', rkey: 'k1', atUri: 'at://h/c/k1', record: { name: 'old' } },
    { slug: 'b', category: 'talk', rkey: 'k2', atUri: 'at://h/c/k2', record: { name: 'bundled' } }];
  const live = [{ uri: 'at://did:plc:x/c/k1', value: { name: 'new' } },
    { uri: 'at://did:plc:x/c/zzz', value: { name: 'someone else’s directory' } }];
  const out = merge(entries, live);
  assert.equal(out.length, 2);
  assert.deepEqual(out.map(e => [e.record.name, e.live, e.uri]),
    [['new', true, 'at://did:plc:x/c/k1'], ['bundled', false, 'at://h/c/k2']]);
  assert.equal(out[0].group, 'fairs');
});

test('the Frieze listing arranges into days plus exhibitions running all week', () => {
  const { days, running } = arrange(merge(listing.records));
  assert.deepEqual(days.map(d => d.date), ['2026-10-09', '2026-10-11', '2026-10-12', '2026-10-13',
    '2026-10-14', '2026-10-15', '2026-10-16', '2026-10-17', '2026-10-18']);
  // the umbrella record is not an event to go to
  assert.ok(!days.some(d => [...d.timed, ...d.open].some(x => x.ev.category === 'umbrella')));
  // every exhibition longer than a week is in "running", soonest-closing first
  assert.ok(running.length >= 10);
  assert.equal(running[0].ev.slug, 'hayward-anish-kapoor');
  // timed events in time order on the 15th
  const thu = days.find(d => d.date === '2026-10-15');
  assert.equal(thu.timed[0].ev.slug, 'frieze-masters-talk-grayson-perry-iris-moon');
  // openings before mid-run days
  const firstOpen = thu.open.findIndex(x => x.when.startsWith('Opens'));
  const firstMid = thu.open.findIndex(x => x.when.startsWith('Day '));
  assert.ok(firstOpen > -1 && firstOpen < firstMid);
  assert.equal(dayLabel('2026-10-15'), 'Thu 15 Oct');
});
