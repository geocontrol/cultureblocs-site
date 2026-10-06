import { test } from 'node:test';
import assert from 'node:assert/strict';
import { beadLinks, hider, makeReader, peopleIn, pool, readBeads, tidTime } from '../lib/went.js';
import { beadItem, countLabel } from '../lib/whowent.js';

const EV = 'at://did:plc:pub/community.lexicon.calendar.event/3mx5noap4v2bn';
const json = (body, status = 200) => ({ ok: status < 400, status, json: async () => body });

/* A small network: Constellation, PLC, two PDSs, Bluesky profiles. */
function net({ backlinks, beads = {}, profiles = [] }) {
  const calls = [];
  const fetchFn = async (url) => {
    calls.push(url);
    const u = new URL(url);
    if (u.host === 'constellation.microcosm.blue') {
      const page = u.searchParams.get('cursor') || 'first';
      return json(backlinks[page]);
    }
    if (u.host === 'plc.directory') {
      const did = decodeURIComponent(u.pathname.slice(1));
      return json({ alsoKnownAs: [`at://${did.slice(8)}.test`],
        service: [{ id: '#atproto_pds', serviceEndpoint: `https://${did.slice(8)}.pds.test` }] });
    }
    if (u.pathname.endsWith('getRecord')) {
      const key = `${u.searchParams.get('repo')}/${u.searchParams.get('rkey')}`;
      return beads[key] ? json({ value: beads[key] }) : json({ error: 'RecordNotFound' }, 400);
    }
    if (u.pathname.endsWith('getProfiles')) return json({ profiles });
    return json({}, 404);
  };
  return { fetchFn, calls };
}

test('TID record keys carry their creation time; other keys give null', () => {
  const t = tidTime('3mx7wuprobg2l');
  assert.ok(t > Date.UTC(2026, 9, 1) && t < Date.UTC(2026, 9, 31), new Date(t).toISOString());
  assert.equal(tidTime('5a1f0c3e-uuid'), null);
  assert.equal(tidTime('self'), null);
});

test('backlinks are paged and become bead URIs', async () => {
  const { fetchFn, calls } = net({ backlinks: {
    first: { records: [{ did: 'did:plc:a', collection: 'com.cultureblocs.bead', rkey: '3mx7wuprobg2l' }], cursor: 'p2' },
    p2: { records: [{ did: 'did:plc:b', collection: 'com.cultureblocs.bead', rkey: '3mx7wuprobg3l' }], cursor: null },
  } });
  const links = await beadLinks(EV, { fetchFn });
  assert.deepEqual(links.map(l => l.uri), [
    'at://did:plc:a/com.cultureblocs.bead/3mx7wuprobg2l', 'at://did:plc:b/com.cultureblocs.bead/3mx7wuprobg3l']);
  assert.match(calls[0], /source=com\.cultureblocs\.bead%3Asubject\.uri/);
  assert.match(calls[0], new RegExp(`subject=${encodeURIComponent(EV)}`));
});

test('people are counted once, and hidden ones not at all', () => {
  const links = [{ did: 'a', uri: 'x1' }, { did: 'a', uri: 'x2' }, { did: 'b', uri: 'x3' }, { did: 'c', uri: 'x4' }];
  assert.equal(peopleIn(links), 3);
  assert.equal(peopleIn(links, hider({ dids: ['c'], beads: ['x3'] })), 1);
});

test('beads are read from their own repositories, newest day first, gone and hidden ones dropped', async () => {
  const { fetchFn } = net({
    backlinks: {},
    beads: {
      'did:plc:a/3mx7wuprobg2l': { createdAt: '2026-10-15T12:00:00.000Z', note: 'The horses', subject: { uri: EV } },
      'did:plc:b/3mx7wuprobg3l': { createdAt: '2026-10-16T12:00:00.000Z', subject: { uri: EV } },
      'did:plc:c/3mx7wuprobg4l': { createdAt: '2026-10-17T12:00:00.000Z', subject: { uri: 'at://elsewhere' } },
    },
    profiles: [{ did: 'did:plc:a', handle: 'a.test', displayName: 'Ada', avatar: 'https://cdn.example/a.jpg' }],
  });
  const links = ['a/3mx7wuprobg2l', 'b/3mx7wuprobg3l', 'c/3mx7wuprobg4l', 'd/3mx7wuprobg5l', 'e/3mx7wuprobg6l']
    .map(s => { const [d, rkey] = s.split('/'); return { did: `did:plc:${d}`, rkey, uri: `at://did:plc:${d}/com.cultureblocs.bead/${rkey}` }; });
  const out = await readBeads(links, {
    reader: makeReader({ fetchFn }),
    hidden: hider({ dids: ['did:plc:e'] }),
    eventUris: new Set([EV]),
  });
  // c was edited to point elsewhere, d is deleted, e is hidden
  assert.deepEqual(out.map(b => b.did), ['did:plc:b', 'did:plc:a']);
  assert.equal(out[1].profile.displayName, 'Ada');
  assert.equal(out[0].handle, 'b.test');
});

test('a bead line escapes other people\'s words and only links real avatars', () => {
  const html = beadItem({
    did: 'did:plc:x', rkey: 'k', handle: 'x.test',
    profile: { handle: 'x.test', displayName: '<b>X</b>', avatar: 'javascript:alert(1)' },
    value: { createdAt: '2026-10-15T12:00:00.000Z', note: '<script>alert(1)</script>' },
  }, { event: { name: 'PAD', href: '/events/x/pad/' } });
  assert.ok(!html.includes('<script>') && !html.includes('<b>X</b>') && !html.includes('javascript:'));
  assert.ok(html.includes('Thu 15 Oct'));
  assert.ok(html.includes('went to <a href="/events/x/pad/">PAD</a>'));
  assert.equal(countLabel(0), '');
  assert.equal(countLabel(3), '3 went');
});

test('pool keeps order and survives a failing task', async () => {
  const out = await pool([1, 2, 3, 4], 2, async (n) => { if (n === 3) throw new Error('x'); return n * 10; });
  assert.deepEqual(out.map(x => x?.error ? 'err' : x), [10, 20, 'err', 40]);
});
