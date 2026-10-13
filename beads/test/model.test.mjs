import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  APP_ID, applyEdit, tagsFrom, createdAtFrom, exportJson, fitWithin, formFrom, groupByDay, isDayOnly,
  localParts, matches, newBead, offsetAt, parseTags, reanchor, strandsHolding, toItem, validate,
} from '../lib/model.js';

const LON = 'Europe/London';

/* A bead as Loom or the totem might have written it: far more than the
 * form shows. Everything the form doesn't touch must survive an edit. */
const loomBead = () => ({
  $type: 'com.cultureblocs.bead',
  kind: 'visit',
  createdAt: '2026-10-09T19:40:00+01:00',
  note: 'Saw Fjord with Sam — Reinsve was extraordinary.',
  tags: ['lff-2026'],
  subject: { $type: 'com.cultureblocs.defs#strongRef', uri: 'at://did:plc:pub/community.lexicon.calendar.event/3abc', cid: 'bafyev' },
  refs: [
    { type: 'person', role: 'mention', descriptor: { label: 'Renate Reinsve' }, index: { byteStart: 23, byteEnd: 30 } },
    { type: 'work', role: 'subject', descriptor: { label: 'Fjord' } },
  ],
  geo: { lat: 51.51, lng: -0.12, precision: '1km' },
  media: [{ uri: 'loom://blob/1', mime: 'image/jpeg' }],
  prev: { uri: 'at://did:plc:me/com.cultureblocs.bead/3prev', cid: 'bafyprev' },
  provenance: { app: 'loom', device: 'mbp', mintedAt: '2026-10-09T22:00:00.000Z', timeAnchored: true },
  presentation: { format: 'digital', eventRef: { type: 'event', role: 'subject', descriptor: { label: 'LFF screening' } } },
  links: [{ uri: 'https://example.org/fjord', title: 'Fjord' }],
  images: [{ image: { $type: 'blob', ref: { $link: 'bafyimg' }, mimeType: 'image/jpeg', size: 1000 }, alt: 'Poster', aspectRatio: { width: 2, height: 3 } }],
  state: 'kept',
  futureField: { anything: [1, 2, 3] },
});

test('opening and saving a bead untouched changes nothing at all', () => {
  const b = loomBead();
  const { record, changed } = applyEdit(b, formFrom(b, LON), { tz: LON });
  assert.equal(changed, false);
  assert.deepEqual(record, b);
});

test('changing one field changes only that field', () => {
  const b = loomBead();
  const f = { ...formFrom(b, LON), kind: 'screening' };
  const { record, changed } = applyEdit(b, f, { tz: LON });
  assert.equal(changed, true);
  assert.deepEqual(record, { ...b, kind: 'screening' });
  // the original is not mutated
  assert.equal(b.kind, 'visit');
});

test('fields the form never shows survive any edit', () => {
  const b = loomBead();
  const f = { ...formFrom(b, LON), tags: 'lff-2026, with Sam', format: '35mm', time: '20:10' };
  const { record } = applyEdit(b, f, { tz: LON });
  for (const k of ['geo', 'media', 'prev', 'provenance', 'futureField', 'state', 'subject', 'images', 'links']) {
    assert.deepEqual(record[k] ?? null, k === 'presentation' ? null : b[k], k);
  }
  assert.deepEqual(record.presentation, { ...b.presentation, format: '35mm' });  // eventRef kept
  assert.deepEqual(record.tags, ['lff-2026', 'with Sam']);
  assert.equal(record.createdAt, '2026-10-09T20:10:00+01:00');
});

test('editing the note moves an anchored ref with its words, or lets go of the anchor', () => {
  const b = loomBead();
  const moved = applyEdit(b, { ...formFrom(b, LON), note: 'Fjord, with Sam. Reinsve was extraordinary.' }, { tz: LON });
  const r0 = moved.record.refs[0];
  const text = new TextDecoder().decode(new TextEncoder().encode(moved.record.note).slice(r0.index.byteStart, r0.index.byteEnd));
  assert.equal(text, 'Reinsve');
  assert.deepEqual(moved.record.refs[1], b.refs[1]);
  assert.equal(moved.notes.length, 0);

  const gone = applyEdit(b, { ...formFrom(b, LON), note: 'Saw it. Loved it.' }, { tz: LON });
  assert.equal(gone.record.refs[0].index, undefined);
  assert.equal(gone.record.refs[0].descriptor.label, 'Renate Reinsve');   // the ref itself stays
  assert.equal(gone.notes.length, 1);
});

test('re-anchoring counts bytes, not characters', () => {
  const note = 'Café — Hayward';
  const enc = new TextEncoder();
  const start = enc.encode('Café — ').length;
  const refs = [{ descriptor: { label: 'Hayward' }, index: { byteStart: start, byteEnd: start + 7 } }];
  const { refs: out } = reanchor(refs, note, 'Ünïcode café — Hayward');
  const s = out[0].index.byteStart;
  assert.equal(new TextDecoder().decode(enc.encode('Ünïcode café — Hayward').slice(s, s + 7)), 'Hayward');
  // words that now appear twice are ambiguous: drop the anchor
  const twice = reanchor(refs, note, 'Hayward then Hayward');
  assert.equal(twice.refs[0].index, undefined);
});

test('removing things removes them, and only them', () => {
  const b = loomBead();
  const f = { ...formFrom(b, LON), subject: 'none', tags: '', links: [], images: [], removeGeo: true, note: '' };
  const { record, notes } = applyEdit(b, f, { tz: LON });
  for (const k of ['subject', 'tags', 'links', 'images', 'geo', 'note']) assert.ok(!(k in record), k);
  assert.deepEqual(record.media, b.media);
  assert.ok(notes.some(n => /location/.test(n)));
});

test('an image description can change without re-uploading the picture', () => {
  const b = loomBead();
  const f = formFrom(b, LON);
  f.images = [{ keep: 0, alt: 'The festival poster for Fjord' }];
  const { record } = applyEdit(b, f, { tz: LON });
  assert.deepEqual(record.images[0].image, b.images[0].image);
  assert.equal(record.images[0].alt, 'The festival poster for Fjord');
  assert.deepEqual(record.images[0].aspectRatio, b.images[0].aspectRatio);
});

test('a link keeps its own extra fields when its title changes', () => {
  const b = { ...loomBead(), links: [{ uri: 'https://x.org/', title: 'Old', extra: 1 }] };
  const f = { ...formFrom(b, LON), links: [{ uri: 'https://x.org/', title: 'New' }] };
  assert.deepEqual(applyEdit(b, f, { tz: LON }).record.links, [{ uri: 'https://x.org/', title: 'New', extra: 1 }]);
});

test('a place keeps its did and geo when only its name changes', () => {
  const b = { kind: 'visit', createdAt: '2026-10-01T12:00:00.000Z', subject: { $type: 'com.cultureblocs.defs#placeRef', name: 'Tate', did: 'did:plc:tate' } };
  const f = { ...formFrom(b, LON), subject: 'place', place: 'Tate Modern' };
  assert.deepEqual(applyEdit(b, f, { tz: LON }).record.subject,
    { $type: 'com.cultureblocs.defs#placeRef', name: 'Tate Modern', did: 'did:plc:tate' });
});

/* ---------- time ---------- */
test('day-only beads stay day-only; times carry the right offset', () => {
  assert.ok(isDayOnly('2026-10-09T12:00:00.000Z'));
  assert.deepEqual(localParts('2026-10-09T12:00:00.000Z', 'America/Los_Angeles'), { date: '2026-10-09', time: '' });
  assert.equal(createdAtFrom('2026-10-09', '', LON), '2026-10-09T12:00:00.000Z');
  assert.equal(createdAtFrom('2026-10-09', '19:40', LON), '2026-10-09T19:40:00+01:00');
  assert.equal(createdAtFrom('2026-11-02', '19:40', LON), '2026-11-02T19:40:00+00:00');   // after the clocks go back
  assert.equal(offsetAt('2026-10-23', '11:00', 'Europe/Paris'), '+02:00');
  assert.equal(offsetAt('2026-07-01', '09:00', 'America/New_York'), '-04:00');
  assert.equal(createdAtFrom('', '10:00', LON), null);
  assert.deepEqual(localParts('2026-10-09T19:40:00+01:00', LON), { date: '2026-10-09', time: '19:40' });
});

test('a bead from "I went" opens and saves without gaining a time', () => {
  const went = { $type: 'com.cultureblocs.bead', kind: 'visit', createdAt: '2026-10-09T12:00:00.000Z', note: 'Great' };
  const f = { ...formFrom(went, LON), note: 'Great film' };
  assert.equal(f.time, '');
  assert.equal(applyEdit(went, f, { tz: LON }).record.createdAt, '2026-10-09T12:00:00.000Z');
});

/* ---------- new ---------- */
test('a new bead is minimal and says where it came from', () => {
  const now = new Date('2026-10-13T09:00:00Z');
  const f = { ...formFrom(null, LON), date: '2026-10-12', time: '', note: '  A quiet hour with the Rothkos  ',
    tags: '#tate, tate', subject: 'place', place: 'Tate Modern' };
  const b = newBead(f, { tz: LON, now });
  assert.deepEqual(b, {
    $type: 'com.cultureblocs.bead', kind: 'bloc', createdAt: '2026-10-12T12:00:00.000Z',
    note: '  A quiet hour with the Rothkos  ', tags: ['tate'],
    subject: { $type: 'com.cultureblocs.defs#placeRef', name: 'Tate Modern' },
    provenance: { app: APP_ID, mintedAt: now.toISOString() },
  });
  const ev = newBead({ ...formFrom(null, LON), date: '2026-10-12', time: '18:00', subject: 'event',
    eventUri: 'at://did:plc:pub/community.lexicon.calendar.event/3x', eventCid: 'bafy' }, { tz: LON, now });
  assert.deepEqual(ev.subject, { $type: 'com.cultureblocs.defs#strongRef', uri: 'at://did:plc:pub/community.lexicon.calendar.event/3x', cid: 'bafy' });
  assert.equal(ev.provenance.timeAnchored, true);
});

test('validation catches what the server would refuse', () => {
  const ok = { ...formFrom(null, LON), date: '2026-10-12' };
  assert.deepEqual(validate(ok, { tz: LON }), []);
  const bad = validate({ ...ok, date: '', note: 'x'.repeat(3001), tags: 'a,b,c,d,e,f,g,h,i',
    links: [{ uri: 'javascript:alert(1)', title: '' }], subject: 'event', eventUri: 'nope' }, { tz: LON });
  assert.deepEqual(bad.map(e => e[0]).sort(), ['date', 'links', 'note', 'subject', 'tags']);
  assert.deepEqual(parseTags('#one, two,,one\nthree'), ['one', 'two', 'three']);
});

/* ---------- the list ---------- */
const rec = (rkey, createdAt, extra = {}) => ({ uri: `at://did:plc:me/com.cultureblocs.bead/${rkey}`, cid: `c${rkey}`,
  value: { kind: 'visit', createdAt, ...extra } });

test('newest day first; timed beads before day-only ones that day', () => {
  const items = [rec('a', '2026-10-08T12:00:00.000Z'), rec('b', '2026-10-09T12:00:00.000Z'),
    rec('c', '2026-10-09T21:00:00+01:00'), rec('d', '2026-10-09T09:00:00+01:00')].map(r => toItem(r, LON));
  const days = groupByDay(items);
  assert.deepEqual(days.map(d => d.date), ['2026-10-09', '2026-10-08']);
  assert.deepEqual(days[0].items.map(i => i.rkey), ['c', 'd', 'b']);
});

test('search finds notes, tags, places, event names and ref labels; kind filters', () => {
  const it = toItem(rec('a', '2026-10-09T12:00:00.000Z', { note: 'Café talk', tags: ['frieze'],
    subject: { name: 'Regent’s Park' }, refs: [{ descriptor: { label: 'Anish Kapoor' } }] }), LON);
  assert.ok(matches(it, 'cafe'));
  assert.ok(matches(it, 'FRIEZE regent'));
  assert.ok(matches(it, 'kapoor'));
  assert.ok(matches(it, 'boosters', { subjectName: 'I Love Boosters' }));
  assert.ok(!matches(it, 'tate'));
  assert.ok(!matches(it, '', { kind: 'listen' }));
});

test('a strand holding the bead is found, by DID or handle authority', () => {
  const uri = 'at://did:plc:me/com.cultureblocs.bead/3b';
  const strands = [
    { uri: 's1', value: { title: 'Thursday', items: [{ uri: 'at://did:plc:me/com.cultureblocs.bead/3b' }] } },
    { uri: 's2', value: { items: [{ uri: 'at://me.bsky.social/com.cultureblocs.bead/3b' }] } },
    { uri: 's3', value: { items: [{ uri: 'at://did:plc:other/com.cultureblocs.bead/3b' }] } },
    { uri: 's4', value: { items: [{ uri: 'at://did:plc:me/com.cultureblocs.annotation/3b' }] } },
  ];
  assert.deepEqual(strandsHolding(strands, uri, 'did:plc:me').map(s => s.uri), ['s1', 's2']);
});

test('export holds every record whole', () => {
  const items = [toItem(rec('a', '2026-10-09T12:00:00.000Z', { geo: { lat: 1, lng: 2, precision: 'city' } }), LON)];
  const j = JSON.parse(exportJson(items, { did: 'did:plc:me', handle: 'me.test', now: new Date(0) }));
  assert.equal(j.count, 1);
  assert.deepEqual(j.records[0].value.geo, { lat: 1, lng: 2, precision: 'city' });
});

test('pictures shrink to fit, keeping their shape', () => {
  assert.deepEqual(fitWithin(4032, 3024), { width: 2000, height: 1500 });
  assert.deepEqual(fitWithin(800, 600), { width: 800, height: 600 });
});

/* ---------- from the review ---------- */
test('times near a clock change keep the hour that was typed', () => {
  const back = (iso, tz) => localParts(iso, tz).time;
  for (const [date, time, tz] of [['2026-04-04', '17:00', 'Australia/Sydney'], ['2026-03-08', '03:30', 'America/New_York'],
    ['2026-03-29', '01:30', 'Europe/Paris'], ['2026-03-29', '03:30', 'Europe/Paris'], ['2026-10-25', '01:30', 'Europe/London'],
    ['2026-10-25', '02:30', 'Europe/Paris']]) {
    assert.equal(back(createdAtFrom(date, time, tz), tz), time, `${tz} ${date} ${time}`);
  }
  // Sydney's clocks go back at 03:00 on Sunday 5 April 2026
  assert.equal(offsetAt('2026-04-04', '17:00', 'Australia/Sydney'), '+11:00');
  assert.equal(offsetAt('2026-04-05', '04:00', 'Australia/Sydney'), '+10:00');
});

test('a link another app stored, of any kind, never blocks a save', () => {
  const b = { kind: 'visit', createdAt: '2026-10-01T12:00:00.000Z', links: [{ uri: 'at://did:plc:x/app.bsky.feed.post/1' }] };
  const f = { ...formFrom(b, LON), tags: 'new' };
  assert.deepEqual(validate(f, { tz: LON, original: b }), []);
  assert.deepEqual(applyEdit(b, f, { tz: LON }).record.links, b.links);
  // but one typed here must be a web address
  const g = { ...f, links: [...f.links, { uri: 'ftp://x', title: '' }] };
  assert.equal(validate(g, { tz: LON, original: b })[0][0], 'links');
});

test('adding a tag leaves the stored tags exactly as they were', () => {
  const b = { kind: 'listen', createdAt: '2026-10-01T12:00:00.000Z', tags: ['#CultureBlocs', 'a, b'] };
  const f = { ...formFrom(b, LON) };
  f.tags += ', new';
  assert.deepEqual(applyEdit(b, f, { tz: LON }).record.tags, ['#CultureBlocs', 'a, b', 'new']);
  assert.deepEqual(tagsFrom('#CultureBlocs,a, b', ['#CultureBlocs', 'a, b']), ['#CultureBlocs', 'a, b']);
  // removing one removes just that one
  assert.deepEqual(tagsFrom('a, b', ['#CultureBlocs', 'a, b']), ['a, b']);
  // only respacing is not a change
  const sp = { ...formFrom(b, LON), tags: '#CultureBlocs ,  a, b ' };
  assert.equal(applyEdit(b, sp, { tz: LON }).changed, false);
});

test('a bead from elsewhere with CRLF breaks, padded alt or titles opens unchanged', () => {
  const b = { kind: 'visit', createdAt: '2026-10-01T12:00:00.000Z', note: 'Saw X\r\nthen Y',
    refs: [{ descriptor: { label: 'Y' }, index: { byteStart: 12, byteEnd: 13 } }],
    links: [{ uri: 'https://x.org', title: 'Title ' }],
    images: [{ image: { ref: { $link: 'c' } }, alt: 'x ' }, { image: { ref: { $link: 'd' } }, alt: '' }] };
  // what the browser's textarea gives back: LF only
  const f = formFrom(b, LON);
  assert.equal(f.note, 'Saw X\nthen Y');
  const r = applyEdit(b, f, { tz: LON });
  assert.equal(r.changed, false);
  const k = applyEdit(b, { ...f, kind: 'dwell' }, { tz: LON });
  assert.deepEqual({ ...k.record, kind: 'visit' }, b);
  // and a real note edit re-anchors against what was stored
  const e = applyEdit(b, { ...f, note: 'Saw X, then Y.' }, { tz: LON }).record;
  assert.equal(new TextDecoder().decode(new TextEncoder().encode(e.note).slice(e.refs[0].index.byteStart, e.refs[0].index.byteEnd)), 'Y');
});

test('removing the location also clears coordinates kept on the place', () => {
  const b = { kind: 'visit', createdAt: '2026-10-01T12:00:00.000Z',
    subject: { name: 'Hayward', geo: { lat: 1, lng: 2, precision: 'exact' } } };
  const r = applyEdit(b, { ...formFrom(b, LON), removeGeo: true }, { tz: LON }).record;
  assert.deepEqual(r.subject, { name: 'Hayward' });
  assert.deepEqual(b.subject.geo, { lat: 1, lng: 2, precision: 'exact' });
});
