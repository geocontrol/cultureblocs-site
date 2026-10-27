import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  encodeInvite, decodeInvite, slug, domainOf, suggestHandles, clean, linksFrom,
  profileRecord, workRecord, venueRecord, eventRecord, beadRecord, localToIso, parseAtUri,
} from '../lib/records.js';

const now = '2026-10-27T12:00:00.000Z';

test('invites round-trip, including non-ASCII', () => {
  const link = encodeInvite({ name: 'Zoë', path: 'venue', message: 'Hi — try this', from: 'Mark' });
  assert.deepEqual(decodeInvite(link), { name: 'Zoë', path: 'venue', message: 'Hi — try this', from: 'Mark' });
});

test('bad invites decode to null, unknown paths are dropped', () => {
  assert.equal(decodeInvite('not-base64!!'), null);
  assert.equal(decodeInvite(''), null);
  assert.equal(decodeInvite(encodeInvite({ name: 'A', path: 'hack' })).path, '');
});

test('slug folds accents and punctuation into a handle segment', () => {
  assert.equal(slug('Zoë Ångström'), 'zoe-angstrom');
  assert.equal(slug('  The Ivy House & Co. '), 'the-ivy-house-and-co');
  assert.equal(slug('---'), '');
});

test('domainOf strips scheme, www and paths', () => {
  assert.equal(domainOf('https://www.ivyhouse.london/about'), 'ivyhouse.london');
  assert.equal(domainOf('gallery.co.uk'), 'gallery.co.uk');
  assert.equal(domainOf('not a domain'), '');
});

test('organisations with a domain get it suggested first', () => {
  const s = suggestHandles({ name: 'Ivy House', domain: 'ivyhouse.london', kind: 'venue' });
  assert.equal(s[0].handle, 'ivyhouse.london');
  assert.deepEqual(s.slice(1).map(x => x.handle),
    ['ivy-house.bsky.social', 'ivy-house.blacksky.app', 'ivy-house.eurosky.social']);
});

test('clean drops empties but keeps blob refs whole', () => {
  const blob = { $type: 'blob', ref: { $link: 'bafy' }, mimeType: 'image/jpeg', size: 10 };
  assert.deepEqual(clean({ a: '', b: [], c: { d: null }, e: 0, f: [{ image: blob }] }),
    { e: 0, f: [{ image: blob }] });
});

test('links get a scheme and are capped at eight', () => {
  assert.deepEqual(linksFrom('example.com, https://a.org'), [{ uri: 'https://example.com' }, { uri: 'https://a.org' }]);
  assert.equal(linksFrom(Array.from({ length: 12 }, (_, i) => `a${i}.com`)).length, 8);
});

test('profile: based town published at city precision', () => {
  const r = profileRecord({ name: 'Ada', disciplines: 'sculpture, sound', based: 'Margate',
    basedLat: '51.38912', basedLng: '1.38611' }, { now });
  assert.equal(r.$type, 'com.cultureblocs.creative.profile');
  assert.deepEqual(r.disciplines, ['sculpture', 'sound']);
  assert.deepEqual(r.based, { name: 'Margate', geo: { lat: 51.4, lng: 1.4, precision: 'city' } });
  assert.equal(r.createdAt, now);
});

test('profile keeps the original createdAt on edit', () => {
  assert.equal(profileRecord({ name: 'Ada' }, { now, createdAt: '2025-01-01T00:00:00Z' }).createdAt,
    '2025-01-01T00:00:00Z');
});

test('work: title, freeform date, image', () => {
  const image = { image: { $type: 'blob', ref: { $link: 'x' }, mimeType: 'image/png', size: 1 }, alt: 'A red cube' };
  const r = workRecord({ title: 'Red Cube', completionDate: '2024', tags: 'sculpture' }, { now, image });
  assert.equal(r.title, 'Red Cube');
  assert.equal(r.completionDate, '2024');
  assert.equal(r.images[0].alt, 'A red cube');
});

test('venue: public space has exact geo and the shared address object', () => {
  const r = venueRecord({ kind: 'venue', name: 'Ivy House', street: '40 Stuart Road',
    locality: 'London', postalCode: 'SE15 3BE', lat: '51.4628', lng: '-0.0582', capacity: '250' }, { now });
  assert.deepEqual(r.location, { $type: 'community.lexicon.location.address', name: 'Ivy House',
    street: '40 Stuart Road', locality: 'London', postalCode: 'SE15 3BE', country: 'GB' });
  assert.deepEqual(r.place, { name: 'Ivy House', geo: { lat: 51.4628, lng: -0.0582, precision: 'exact' } });
  assert.equal(r.address, '40 Stuart Road, London, SE15 3BE');
  assert.equal(r.capacity, 250);
  assert.deepEqual(r.tags, ['venue']);
});

test('venue: an organisation without a space publishes only its town', () => {
  const r = venueRecord({ kind: 'org', name: 'Arts Co', street: '1 Home Lane', locality: 'Leeds',
    lat: '53.80076', lng: '-1.54908', capacity: '20' }, { now });
  assert.equal(r.location.street, undefined);
  assert.equal(r.location.locality, 'Leeds');
  assert.equal(r.place.geo.precision, 'city');
  assert.equal(r.capacity, undefined);
  assert.deepEqual(r.tags, ['organisation']);
});

test('localToIso writes the local offset', () => {
  assert.equal(localToIso('2026-11-14T19:30', 0), '2026-11-14T19:30:00+00:00');
  assert.equal(localToIso('2026-06-14T19:30', -60), '2026-06-14T19:30:00+01:00');
  assert.equal(localToIso('2026-06-14T19:30', 300), '2026-06-14T19:30:00-05:00');
  assert.equal(localToIso('nope', 0), '');
});

test('event: in person carries address and string coordinates', () => {
  const r = eventRecord({ name: 'Late opening', venueName: 'Ivy House', street: '40 Stuart Road',
    locality: 'London', lat: '51.4628', lng: '-0.0582', links: 'ivyhouse.london/late' },
  { now, startsAt: '2026-11-14T19:30:00+00:00' });
  assert.equal(r.$type, 'community.lexicon.calendar.event');
  assert.equal(r.mode, 'community.lexicon.calendar.event#inperson');
  assert.equal(r.status, 'community.lexicon.calendar.event#scheduled');
  assert.equal(r.locations[0].$type, 'community.lexicon.location.address');
  assert.deepEqual(r.locations[1], { $type: 'community.lexicon.location.geo',
    latitude: '51.4628', longitude: '-0.0582', name: 'Ivy House' });
  assert.deepEqual(r.uris, [{ uri: 'https://ivyhouse.london/late' }]);
});

test('event: online has a join link and no address', () => {
  const r = eventRecord({ name: 'Talk', mode: 'virtual', street: 'x', locality: 'y',
    links: 'https://zoom.example/1' }, { now, startsAt: '2026-11-14T19:30:00+00:00' });
  assert.deepEqual(r.locations, [{ $type: 'community.lexicon.calendar.event#uri',
    uri: 'https://zoom.example/1', name: 'Join online' }]);
});

test('bead: kind is checked, date sets the moment', () => {
  const r = beadRecord({ kind: 'watch', note: 'Saw the new Spielberg.', when: '2026-10-20' }, { now });
  assert.equal(r.kind, 'watch');
  assert.ok(r.createdAt.startsWith('2026-10-20'));
  assert.equal(beadRecord({ kind: 'bogus' }, { now }).kind, 'note');
});

test('parseAtUri', () => {
  assert.deepEqual(parseAtUri('at://did:plc:abc/com.cultureblocs.bead/3k'),
    { did: 'did:plc:abc', collection: 'com.cultureblocs.bead', rkey: '3k' });
  assert.equal(parseAtUri('nope'), null);
});
