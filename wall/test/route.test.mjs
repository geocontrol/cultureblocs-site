import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parse, strandHref, wallHref } from '../lib/route.js';

const HANDLE = 'geocontrol.bsky.social';
const RKEY = 'e328d978-28db-40d7-9d5b-b29a9383a3fe';

test('the wall of one actor, page one', () => {
  assert.deepEqual(parse(`/wall/${HANDLE}/`, ''), { actor: HANDLE, rkey: null, page: 1 });
  assert.deepEqual(parse(`/wall/${HANDLE}`, ''), { actor: HANDLE, rkey: null, page: 1 });
});

test('a later page comes off the query string', () => {
  assert.deepEqual(parse(`/wall/${HANDLE}/`, '?page=3'), { actor: HANDLE, rkey: null, page: 3 });
});

test('one strand', () => {
  assert.deepEqual(parse(`/wall/${HANDLE}/${RKEY}`, ''), { actor: HANDLE, rkey: RKEY, page: 1 });
});

test('a nonsense page number reads as page one, not as an error', () => {
  for (const search of ['?page=0', '?page=-2', '?page=abc', '?page=', '?page=1.5']) {
    assert.equal(parse(`/wall/${HANDLE}/`, search).page, 1, search);
  }
});

test('no actor at all', () => {
  assert.deepEqual(parse('/wall/', ''), { actor: null, rkey: null, page: 1 });
});

test('the query form still parses, because catalogue taught people that shape', () => {
  assert.deepEqual(parse('/wall/', `?actor=${HANDLE}`), { actor: HANDLE, rkey: null, page: 1 });
  assert.deepEqual(parse('/wall/', `?actor=${HANDLE}&strand=${RKEY}&page=2`),
    { actor: HANDLE, rkey: RKEY, page: 2 });
});

test('a did actor survives the path', () => {
  const did = 'did:plc:diptbrfpxsowq6hp4bgxjftd';
  const href = strandHref(did, RKEY);
  assert.deepEqual(parse(new URL(href, 'https://cultureblocs.com').pathname, ''),
    { actor: did, rkey: RKEY, page: 1 });
});

test('links are built as paths, and round-trip to what built them', () => {
  assert.equal(wallHref(HANDLE), `/wall/${HANDLE}/`);
  assert.equal(wallHref(HANDLE, 1), `/wall/${HANDLE}/`);
  assert.equal(wallHref(HANDLE, 4), `/wall/${HANDLE}/?page=4`);
  assert.equal(strandHref(HANDLE, RKEY), `/wall/${HANDLE}/${RKEY}`);

  const href = strandHref(HANDLE, RKEY);
  const url = new URL(href, 'https://cultureblocs.com');
  assert.deepEqual(parse(url.pathname, url.search), { actor: HANDLE, rkey: RKEY, page: 1 });

  const paged = new URL(wallHref(HANDLE, 2), 'https://cultureblocs.com');
  assert.deepEqual(parse(paged.pathname, paged.search), { actor: HANDLE, rkey: null, page: 2 });
});
