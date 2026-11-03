import { test } from 'node:test';
import assert from 'node:assert/strict';
import { BOARDS, boardPost, boardText, cardOf, cleanLink, feedUri, privateBits, roomLeft, POST_MAX }
  from '../lib/board.js';

const kinds = (s) => privateBits(s).map(f => f.kind);

test('privateBits finds contact details and home addresses', () => {
  assert.deepEqual(kinds('Email me at ada.l@example.co.uk'), ['email']);
  assert.deepEqual(kinds('call 07700 900123'), ['phone']);
  assert.deepEqual(kinds('ring +44 7700 900123 after six'), ['phone']);
  assert.deepEqual(kinds('020 7946 0018'), ['phone']);
  assert.deepEqual(kinds('near E15 4QS'), ['postcode']);
  assert.deepEqual(kinds('come to 14 Romford Road'), ['address']);
  assert.deepEqual(kinds('Flat 3, top bell'), ['flat']);
});

test('privateBits leaves ordinary offers alone', () => {
  assert.deepEqual(privateBits('Studio free on Monday evenings, up to 15 people. Reply here.'), []);
  assert.deepEqual(privateBits('Need a 40 m² room near Stratford in 2027'), []);
  assert.deepEqual(privateBits('Looking for E15 area spaces'), []);  // an outward code alone is fine
});

test('boardText labels, keeps the hashtag and link, and fits a post', () => {
  const t = boardText({ board: 'offer', category: 'space', text: 'Free room on Mondays', link: 'ivyhouse.london/hire' });
  assert.equal(t, 'Offer · Space: Free room on Mondays https://ivyhouse.london/hire #CreativeNewhamOffer');
  const long = boardText({ board: 'need', category: 'other', text: 'x '.repeat(400) });
  assert.ok([...long].length <= POST_MAX);
  assert.ok(long.startsWith('Need: '));
  assert.ok(long.endsWith(' #CreativeNewhamNeed'));
});

test('roomLeft shrinks with the label and link', () => {
  const bare = roomLeft({ board: 'need', category: 'other' });
  const withLink = roomLeft({ board: 'need', category: 'other', link: 'https://example.org' });
  assert.ok(bare > withLink);
  assert.equal(bare, POST_MAX - 'Need: '.length - ' #CreativeNewhamNeed'.length);
});

test('boardPost is a Bluesky post with tags and byte-accurate facets', () => {
  const now = new Date('2026-11-03T16:00:00Z');
  const p = boardPost({ board: 'need', category: 'funding', text: 'Match funding for a mural — 2027', link: 'https://example.org/mural', now });
  assert.equal(p.$type, 'app.bsky.feed.post');
  assert.deepEqual(p.tags, ['cultureblocs', 'creativenewhamneed', 'creative-spaces-symposium-2026', 'cn-funding']);
  const bytes = new TextEncoder().encode(p.text);
  const slice = (f) => new TextDecoder().decode(bytes.slice(f.index.byteStart, f.index.byteEnd));
  const link = p.facets.find(f => f.features[0].$type.endsWith('#link'));
  const tag = p.facets.find(f => f.features[0].$type.endsWith('#tag'));
  assert.equal(slice(link), 'https://example.org/mural');
  assert.equal(slice(tag), '#CreativeNewhamNeed');
  assert.equal(tag.features[0].tag, 'CreativeNewhamNeed');
  assert.equal(p.createdAt, now.toISOString());
});

test('boardPost refuses an empty or over-long post', () => {
  assert.throws(() => boardPost({ board: 'offer', text: '  ' }), /Write a line/);
  assert.throws(() => boardPost({ board: 'offer', text: 'a'.repeat(400) }), /longer/);
  assert.throws(() => boardPost({ board: 'nope', text: 'hi' }), /board/);
});

test('cleanLink adds https and drops junk', () => {
  assert.equal(cleanLink('bowarts.org'), 'https://bowarts.org/');
  assert.equal(cleanLink('not a link'), '');
  assert.equal(cleanLink(''), '');
});

test('cardOf strips the label and hashtag for display', () => {
  const c = cardOf({ uri: 'at://did:plc:x/app.bsky.feed.post/3abc', author: { did: 'did:plc:x', handle: 'ada.bsky.social' },
    record: { text: 'Offer · Space: Free room on Mondays #CreativeNewhamOffer', createdAt: '2026-11-03T16:00:00Z' } });
  assert.equal(c.category, 'Space');
  assert.equal(c.body, 'Free room on Mondays');
  assert.equal(c.rkey, '3abc');
  assert.equal(c.name, 'ada.bsky.social');
});

test('each board has a feed served from feeds.json', async () => {
  const { readFileSync } = await import('node:fs');
  const cfg = JSON.parse(readFileSync(new URL('../../../feeds/feeds.json', import.meta.url), 'utf8'));
  for (const b of Object.values(BOARDS)) {
    const f = cfg.feeds.find(x => x.rkey === b.feed);
    assert.ok(f, `feed ${b.feed}`);
    assert.ok(f.sources.tags.includes(b.hashtag.slice(1).toLowerCase()));
    assert.ok(feedUri(b.id).startsWith(`at://${cfg.publisher}/`));
  }
});
