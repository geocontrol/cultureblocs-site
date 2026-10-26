import { test } from 'node:test';
import assert from 'node:assert/strict';
import { NSID, formFrom, normaliseUrl, parseDisciplines, toRecord, unchanged, validate } from '../lib/profile.js';

const studioRecord = () => ({
  $type: NSID,
  name: 'Ada Ferrous',
  bio: 'Sound and installation.',
  disciplines: ['sound', 'installation'],
  based: { name: 'Glasgow', did: 'did:web:glasgow.example' },
  links: [{ uri: 'https://ada.example/', title: 'Portfolio' }, { uri: 'https://shop.example/' }],
  externalIds: [{ scheme: 'isni', id: '0000000000000001' }],
  createdAt: '2026-10-01T10:00:00.000Z',
});

test('a new persona needs only a name', () => {
  assert.deepEqual(validate({ name: 'Ada' }), []);
  const r = toRecord({ name: '  Ada  ' }, null, '2026-10-26T18:00:00.000Z');
  assert.deepEqual(r, { $type: NSID, name: 'Ada', createdAt: '2026-10-26T18:00:00.000Z' });
});

test('an empty name is refused, with a message for the field', () => {
  assert.deepEqual(validate({ name: '   ' }).map((e) => e.field), ['name']);
});

test('lexicon limits are enforced', () => {
  assert.equal(validate({ name: 'x'.repeat(301) })[0].field, 'name');
  assert.equal(validate({ name: 'A', bio: 'x'.repeat(2001) })[0].field, 'bio');
  assert.equal(validate({ name: 'A', disciplines: 'a,b,c,d,e,f,g,h,i' })[0].field, 'disciplines');
  assert.equal(validate({ name: 'A', disciplines: 'x'.repeat(65) })[0].field, 'disciplines');
  assert.equal(validate({ name: 'A', website: 'not a url at all' })[0].field, 'website');
  assert.deepEqual(validate({ name: 'A', bio: '🎨'.repeat(2000) }), []); // graphemes, not bytes
});

test('disciplines: commas or lines, trimmed, no repeats', () => {
  assert.deepEqual(parseDisciplines(' sculpture, Sound design ,\nsculpture,, '), ['sculpture', 'Sound design']);
});

test('web addresses get https:// when typed bare', () => {
  assert.equal(normaliseUrl('ada.example'), 'https://ada.example/');
  assert.equal(normaliseUrl('javascript:alert(1)'), '');
});

test('editing keeps everything the form does not show, and createdAt', () => {
  const before = studioRecord();
  const form = { ...formFrom(before), bio: 'Sound, light and installation.' };
  const r = toRecord(form, before, '2030-01-01T00:00:00.000Z');
  assert.equal(r.createdAt, before.createdAt);
  assert.equal(r.bio, 'Sound, light and installation.');
  assert.deepEqual(r.externalIds, before.externalIds);
  assert.deepEqual(r.based, before.based);
  assert.deepEqual(r.links, before.links); // first link kept whole, title included
});

test('round trip with no edits changes nothing', () => {
  const before = studioRecord();
  assert.equal(unchanged(formFrom(before), before), true);
  assert.equal(unchanged({ ...formFrom(before), name: 'Ada F.' }, before), false);
});

test('clearing fields removes them but keeps a place DID', () => {
  const r = toRecord({ name: 'Ada', bio: '', disciplines: '', based: '', website: '' }, studioRecord());
  assert.equal(r.bio, undefined);
  assert.equal(r.disciplines, undefined);
  assert.deepEqual(r.based, { did: 'did:web:glasgow.example' });
  assert.deepEqual(r.links, [{ uri: 'https://shop.example/' }]);
});

test('a new website replaces the first link only', () => {
  const r = toRecord({ ...formFrom(studioRecord()), website: 'new.example' }, studioRecord());
  assert.deepEqual(r.links, [{ uri: 'https://new.example/' }, { uri: 'https://shop.example/' }]);
});
