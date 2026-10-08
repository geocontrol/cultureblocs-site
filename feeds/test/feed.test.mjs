import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  describe, didDocument, feedUri, findFeed, gather, hide, linksToDirectory, pageUrls, skeleton,
} from '../lib/feed.js';

const cfg = JSON.parse(readFileSync(new URL('../feeds.json', import.meta.url), 'utf8'));
const listing = JSON.parse(readFileSync(new URL('../../events/frieze-week-london/events.json', import.meta.url), 'utf8'));
const feed = cfg.feeds[0];
const EVENTS = listing.records.filter(e => e.category !== 'umbrella').length; // event pages
const json = (body, status = 200) => ({ ok: status < 400, status, json: async () => body });

test('the feed is found by its at:// URI, with the publisher DID or handle', () => {
  const uri = feedUri(cfg, feed);
  assert.equal(uri, 'at://did:plc:l3726um33xesakwqhjkkpoet/app.bsky.feed.generator/frieze-week');
  assert.equal(findFeed(cfg, uri), feed);
  assert.equal(findFeed(cfg, 'at://cultureblocs.com/app.bsky.feed.generator/frieze-week'), feed);
  assert.equal(findFeed(cfg, 'at://did:plc:someoneelse/app.bsky.feed.generator/frieze-week'), null);
  assert.equal(findFeed(cfg, 'at://did:plc:l3726um33xesakwqhjkkpoet/app.bsky.feed.generator/nope'), null);
  assert.equal(findFeed(cfg, null), null);
  assert.deepEqual(describe(cfg), { did: 'did:web:www.cultureblocs.com', feeds: [{ uri }] });
});

test('the committed DID document matches the config', () => {
  const onDisk = JSON.parse(readFileSync(new URL('../../.well-known/did.json', import.meta.url), 'utf8'));
  assert.deepEqual(onDisk, didDocument(cfg));
});

test('page URLs cover the week page and every event, not the umbrella', () => {
  const urls = pageUrls(listing, 'frieze-week-london');
  assert.equal(urls[0], 'https://www.cultureblocs.com/events/frieze-week-london/');
  assert.equal(urls.length, EVENTS + 1);
  assert.ok(urls.includes('https://www.cultureblocs.com/events/frieze-week-london/british-museum-bayeux-tapestry/'));
});

test('a post links to the directory by card, in-text link or short link — not elsewhere on the site', () => {
  const card = (uri) => ({ embed: { external: { uri } } });
  assert.ok(linksToDirectory(card('https://www.cultureblocs.com/events/frieze-week-london/pad-london-2026/'), 'frieze-week-london', 'fwl'));
  assert.ok(linksToDirectory(card('https://cultureblocs.com/w/fwl/3mx5noaov32bn'), 'frieze-week-london', 'fwl'));
  assert.ok(linksToDirectory({ facets: [{ features: [{ uri: 'https://cultureblocs.com/events/frieze-week-london/' }] }] }, 'frieze-week-london', 'fwl'));
  assert.ok(!linksToDirectory(card('https://www.cultureblocs.com/apps.html'), 'frieze-week-london', 'fwl'));
  assert.ok(!linksToDirectory(card('https://evil.example/events/frieze-week-london/'), 'frieze-week-london', 'fwl'));
  assert.ok(!linksToDirectory({}, 'frieze-week-london', 'fwl'));
});

test('sources are merged and de-duplicated, and one failing source is survivable', async () => {
  const calls = [];
  const fetchFn = async (url) => {
    calls.push(url);
    const u = new URL(url);
    if (u.host === 'constellation.microcosm.blue') {
      return u.searchParams.get('subject').endsWith('/british-museum-bayeux-tapestry/')
        ? json({ records: [{ did: 'did:plc:me', collection: 'app.bsky.feed.post', rkey: '3mx7xnxroos26' }] })
        : json({ records: [] });
    }
    if (u.searchParams.get('tag')) return json({}, 503);   // search for the tag is down
    if (u.searchParams.get('domain')) {
      return json({ posts: [
        { uri: 'at://did:plc:me/app.bsky.feed.post/3mx7xnxroos26', author: { did: 'did:plc:me' },
          record: { embed: { external: { uri: 'https://www.cultureblocs.com/events/frieze-week-london/british-museum-bayeux-tapestry/' } } } },
        { uri: 'at://did:plc:x/app.bsky.feed.post/3mabcdefghij2', author: { did: 'did:plc:x' },
          record: { embed: { external: { uri: 'https://www.cultureblocs.com/apps.html' } } } },
      ] });
    }
    return json({ posts: [{ uri: 'at://did:plc:y/app.bsky.feed.post/3mx7aaaaaaaa2', author: { did: 'did:plc:y' }, indexedAt: '2026-10-15T10:00:00Z' }] });
  };
  const items = await gather(feed, { listing, fetchFn });
  assert.deepEqual(items.map(i => i.uri).sort(), [
    'at://did:plc:me/app.bsky.feed.post/3mx7xnxroos26',
    'at://did:plc:y/app.bsky.feed.post/3mx7aaaaaaaa2',
  ]);
  assert.equal(calls.filter(c => c.includes('constellation')).length, EVENTS + 1);
  assert.ok(calls.some(c => c.includes('q=%23CultureBlocs+frieze')));
});

test('all sources down is an error, so the service can serve its last good list', async () => {
  await assert.rejects(gather(feed, { listing, fetchFn: async () => json({}, 503) }), /unavailable/);
});

test('hidden people and posts are left out', () => {
  const items = [{ uri: 'at://a/p/1', author: 'did:a', t: 1 }, { uri: 'at://b/p/2', author: 'did:b', t: 2 }, { uri: 'at://c/p/3', author: 'did:c', t: 3 }];
  assert.deepEqual(hide(items, { dids: ['did:a'], posts: ['at://c/p/3'] }).map(i => i.author), ['did:b']);
  assert.equal(hide(items, {}).length, 3);
});

test('newest first, paged with a cursor that never repeats or skips', () => {
  const items = Array.from({ length: 7 }, (_, i) => ({ uri: `at://d/p/${i}`, author: 'd', t: i % 3 === 0 ? 100 : 100 + i }));
  const seen = [];
  let cursor;
  for (let guard = 0; guard < 10; guard++) {
    const page = skeleton(items, { limit: 3, cursor });
    seen.push(...page.feed.map(f => f.post));
    if (!page.cursor) break;
    cursor = page.cursor;
  }
  assert.equal(seen.length, 7);
  assert.equal(new Set(seen).size, 7);
  assert.equal(seen[0], 'at://d/p/5');              // t=105, newest
  assert.deepEqual(skeleton([], {}), { feed: [] });
  assert.equal(skeleton(items, { limit: 999 }).feed.length, 7);
  assert.equal(skeleton(items, { cursor: 'garbage' }).feed.length, 0);
});
