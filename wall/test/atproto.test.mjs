import { test } from 'node:test';
import assert from 'node:assert/strict';
import { MAX_PAGES, PAGE_LIMIT, fetchAllStrands, resolveActor } from '../lib/atproto.js';

const PLC_DOC = { service: [{ id: '#atproto_pds', type: 'AtprotoPersonalDataServer', serviceEndpoint: 'https://pds.example' }] };

function stub(routes) {
  return async (url) => {
    for (const [match, body] of routes) {
      if (url.includes(match)) return { ok: true, status: 200, json: async () => body };
    }
    return { ok: false, status: 404, json: async () => ({}), text: async () => 'not found' };
  };
}

const strand = (rkey, createdAt) => ({
  uri: `at://did:plc:abc/com.cultureblocs.strand/${rkey}`,
  cid: `bafy${rkey}`,
  value: { $type: 'com.cultureblocs.strand', createdAt, title: `strand ${rkey}` },
});

test('resolveActor resolves a handle through resolveHandle and plc.directory', async () => {
  const fetchFn = stub([['resolveHandle', { did: 'did:plc:abc' }], ['plc.directory', PLC_DOC]]);
  assert.deepEqual(await resolveActor('geocontrol.bsky.social', { fetchFn }),
    { did: 'did:plc:abc', pds: 'https://pds.example' });
});

test('a handle that does not resolve is told apart from a resolver that is down', async () => {
  const missing = async () => ({ ok: false, status: 400, json: async () => ({}), text: async () => 'bad handle' });
  await assert.rejects(resolveActor('nope.example', { fetchFn: missing }),
    (e) => e.status === 400 && /could not resolve/.test(e.message));

  const down = async () => ({ ok: false, status: 503, json: async () => ({}), text: async () => 'upstream' });
  await assert.rejects(resolveActor('geocontrol.bsky.social', { fetchFn: down }),
    (e) => e.status === 503 && !/could not resolve/.test(e.message));
});

test('a DID needs no handle resolution', async () => {
  let asked = false;
  const fetchFn = async (url) => {
    if (url.includes('resolveHandle')) asked = true;
    return { ok: true, status: 200, json: async () => PLC_DOC };
  };
  assert.deepEqual(await resolveActor('did:plc:abc', { fetchFn }),
    { did: 'did:plc:abc', pds: 'https://pds.example' });
  assert.equal(asked, false);
});

test('fetchAllStrands threads every cursor, and asks for none on the first request', async () => {
  const seen = [];
  const pages = [
    { records: [strand('a', '2026-07-19T09:21:18Z')], cursor: 'c1' },
    { records: [strand('b', '2026-08-08T09:01:53Z')], cursor: 'c2' },
    { records: [strand('c', '2026-09-18T12:52:57Z')] },
  ];
  const fetchFn = async (url) => {
    seen.push(url);
    return { ok: true, status: 200, json: async () => pages[seen.length - 1] };
  };
  const out = await fetchAllStrands('https://pds.example', 'did:plc:abc', { fetchFn });

  assert.equal(seen.length, 3);
  assert.ok(!seen[0].includes('cursor='), seen[0]);
  assert.ok(seen[1].includes('cursor=c1'));
  assert.ok(seen[2].includes('cursor=c2'));
  assert.ok(seen[0].includes(`limit=${PAGE_LIMIT}`));
  assert.ok(seen[0].includes('collection=com.cultureblocs.strand'));
  assert.equal(out.length, 3);
});

/* The reason this function exists rather than one listRecords call: a strand
 * is published under its String record id, a uuid4, so the order the PDS
 * returns is unrelated to date. These are the real rkeys and dates of
 * geocontrol.bsky.social's seven strands, in the order the PDS gives them. */
test('the result is newest-first by createdAt, however the repository orders its keys', async () => {
  const real = [
    ['e328d978-28db-40d7-9d5b-b29a9383a3fe', '2026-09-18T12:52:57Z'],
    ['b1a54fc5-3559-40a5-bd12-af7842ae8aa6', '2026-08-04T20:11:03Z'],
    ['7dff6f65-e976-4a26-94f1-a1907989c88b', '2026-07-23T09:54:07Z'],
    ['6d84e6d9-6bc1-49ba-b619-c6f4b2140cdd', '2026-09-15T18:10:45Z'],
    ['2abe80b9-2761-4a10-8072-c4a6cc4a11fe', '2026-08-02T21:38:54Z'],
    ['15b73353-20e6-49c6-9083-ea4345d8a850', '2026-07-19T09:21:18Z'],
    ['006c05f1-01e0-4329-a8b9-8b346ad0e75e', '2026-08-08T09:01:53Z'],
  ].map(([rkey, at]) => strand(rkey, at));
  const fetchFn = stub([['listRecords', { records: real }]]);

  const out = await fetchAllStrands('https://pds.example', 'did:plc:abc', { fetchFn });

  assert.deepEqual(out.map((r) => r.value.createdAt.slice(0, 10)), [
    '2026-09-18', '2026-09-15', '2026-08-08', '2026-08-04',
    '2026-08-02', '2026-07-23', '2026-07-19',
  ]);
  assert.equal(out[0].uri.endsWith('e328d978-28db-40d7-9d5b-b29a9383a3fe'), true,
    'each record keeps its uri — the permalink is built from it');
  assert.ok(out[0].cid, 'and its cid');
});

test('a repeated cursor stops the walk instead of spinning the browser', async () => {
  let calls = 0;
  const fetchFn = async () => {
    calls += 1;
    return { ok: true, status: 200,
      json: async () => ({ records: [strand(`r${calls}`, '2026-09-01T00:00:00Z')], cursor: 'stuck' }) };
  };
  const out = await fetchAllStrands('https://pds.example', 'did:plc:abc', { fetchFn });
  assert.equal(calls, 2, 'the second answer repeats the cursor, so it stops there');
  assert.equal(out.length, 1, 'and the repeated page is not accumulated');
});

test('more strands than the cap throws rather than showing a silent half', async () => {
  const fetchFn = async () => ({ ok: true, status: 200,
    json: async () => ({ records: [strand('x', '2026-09-01T00:00:00Z')], cursor: `c${Math.random()}` }) });
  await assert.rejects(fetchAllStrands('https://pds.example', 'did:plc:abc', { fetchFn }),
    (e) => new RegExp(String(MAX_PAGES * PAGE_LIMIT)).test(e.message));
});

test('a repository with no strands is an empty list, not a failure', async () => {
  const fetchFn = stub([['listRecords', { records: [] }]]);
  assert.deepEqual(await fetchAllStrands('https://pds.example', 'did:plc:abc', { fetchFn }), []);
});
