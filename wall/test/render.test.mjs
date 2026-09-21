import { test } from 'node:test';
import assert from 'node:assert/strict';
import { blocksHtml, esc } from '../lib/embed.js';
import { PAGE_SIZE, paging, renderWall, renderStrand, strandSummary } from '../lib/render.js';

const ACTOR = 'geocontrol.bsky.social';
const rec = (rkey, over = {}) => ({
  uri: `at://did:plc:abc/com.cultureblocs.strand/${rkey}`,
  cid: 'bafy1',
  value: {
    $type: 'com.cultureblocs.strand',
    createdAt: '2026-09-18T12:52:57Z',
    day: '2026-09-18T00:00:00Z',
    title: 'At the National Gallery',
    narrative: 'A slow afternoon.\n\nThen a coffee.',
    items: [{ uri: 'at://did:plc:abc/com.cultureblocs.bead/b1' },
            { uri: 'at://did:plc:abc/com.cultureblocs.bead/b2' }],
    ...over,
  },
});

test('a summary comes from the strand record alone', () => {
  const m = strandSummary(rec('r1'), { actor: ACTOR });
  assert.equal(m.title, 'At the National Gallery');
  assert.equal(m.day, '2026-09-18');
  assert.equal(m.beads, 2);
  assert.equal(m.href, `/wall/${ACTOR}/r1`);
  assert.match(m.opening, /A slow afternoon/);
});

test('a strand with no title is named by its day, not left blank', () => {
  const m = strandSummary(rec('r1', { title: '' }), { actor: ACTOR });
  assert.equal(m.title, '18 September 2026');
});

test('a strand with no narrative has no opening, and says nothing about it', () => {
  const m = strandSummary(rec('r1', { narrative: '' }), { actor: ACTOR });
  assert.equal(m.opening, '');
});

test('the opening is trimmed to a readable length, on a word boundary', () => {
  const long = `${'word '.repeat(80)}end`;
  const m = strandSummary(rec('r1', { narrative: long }), { actor: ACTOR });
  assert.ok(m.opening.length <= 240, m.opening.length);
  assert.ok(m.opening.endsWith('…'));
  assert.ok(!/word wor…$/.test(m.opening), 'no word is cut in half');
});

test('a summary escapes what came off the network', () => {
  const m = strandSummary(rec('r1', { title: '<script>alert(1)</script>' }), { actor: ACTOR });
  const html = renderWall({ actor: ACTOR, records: [rec('r1', { title: '<script>alert(1)</script>' })], page: 1 });
  assert.ok(!html.includes('<script>alert(1)'), html.slice(0, 400));
  assert.ok(html.includes('&lt;script&gt;'));
  assert.equal(m.title, '<script>alert(1)</script>', 'the model holds the raw value; escaping happens in the markup');
});

test('paging slices ten and reports where you are', () => {
  const p = paging(23, 1, { actor: ACTOR });
  assert.deepEqual([p.page, p.pages, p.from, p.to], [1, 3, 0, 10]);
  assert.equal(p.prevHref, null);
  assert.ok(p.nextHref.includes('page=2'));

  const mid = paging(23, 2, { actor: ACTOR });
  assert.deepEqual([mid.from, mid.to], [10, 20]);
  assert.ok(mid.prevHref && mid.nextHref);

  const last = paging(23, 3, { actor: ACTOR });
  assert.deepEqual([last.from, last.to], [20, 23]);
  assert.equal(last.nextHref, null);
});

test('a page beyond the end lands on the last page, not on nothing', () => {
  assert.equal(paging(23, 99, { actor: ACTOR }).page, 3);
  assert.equal(paging(0, 5, { actor: ACTOR }).page, 1);
  assert.equal(paging(0, 5, { actor: ACTOR }).pages, 1);
});

test('without an actor there are no hrefs to build, and paging says so', () => {
  const p = paging(23, 2);
  assert.equal(p.prevHref, null);
  assert.equal(p.nextHref, null);
  assert.deepEqual([p.page, p.pages], [2, 3]);
});

test('the wall renders ten summaries and its paging', () => {
  const records = Array.from({ length: 12 }, (_, i) =>
    rec(`r${i}`, { title: `strand ${i}`, createdAt: `2026-09-${String(i + 1).padStart(2, '0')}T10:00:00Z` }));
  const html = renderWall({ actor: ACTOR, records, page: 1 });
  assert.equal((html.match(/class="strand"/g) || []).length, PAGE_SIZE);
  assert.ok(html.includes('page=2'));
  assert.ok(html.includes(`/wall/${ACTOR}/r11`), 'newest record r11 on page 1');
});

test('an actor with nothing published says so, and is not an error', () => {
  const html = renderWall({ actor: ACTOR, records: [], page: 1 });
  assert.match(html, /Nothing published yet/);
  assert.ok(!html.includes('class="strand"'));
});

/* The narrative of the strand published on 2026-09-15 ("Liminal
 * Explorations"), which once rendered as one undifferentiated run of text.
 * The formatter is copied from the canonical embed; this pins that the copy
 * behaves the same. */
const PUBLISHED_NARRATIVE = [
  'Tales of liminal space and time are most definitely part of my reading and watching this year.',
  '',
  'I think over the year so far :',
  '* Rewatched Sapphire & Steel online',
  '* Saw Exit 8',
  '',
  'I dont think liminality is going to end over the coming months either',
].join('\n');

test('blocksHtml makes paragraphs and bullets, exactly as the embed does', () => {
  const html = blocksHtml(PUBLISHED_NARRATIVE);
  assert.equal((html.match(/<p>/g) || []).length, 3);
  assert.equal((html.match(/<ul class="bullets">/g) || []).length, 1);
  assert.equal((html.match(/<li>/g) || []).length, 2);
  assert.ok(html.includes('Sapphire &amp; Steel'), 'and escapes as it goes');
});

test('esc escapes the four characters that matter in markup', () => {
  assert.equal(esc('<a href="x">&</a>'), '&lt;a href=&quot;x&quot;&gt;&amp;&lt;/a&gt;');
  assert.equal(esc(undefined), '');
});

const BLOB = 'https://pds.example/xrpc/com.atproto.sync.getBlob?did=did%3Aplc%3Aabc&cid=';
const bead = (over = {}) => ({
  uri: 'at://did:plc:abc/com.cultureblocs.bead/b1',
  value: { $type: 'com.cultureblocs.bead', kind: 'visit', createdAt: '2026-09-18T10:00:00Z', note: 'Room 32.', ...over },
});

test('the strand page renders the narrative as blocks and every bead in order', () => {
  const html = renderStrand({
    strand: rec('r1'), actor: ACTOR, blobBase: BLOB,
    beads: [bead(), bead({ createdAt: '2026-09-18T11:00:00Z', note: 'Then the café.' })],
  });
  assert.ok(html.includes('<div class="narrative">'));
  assert.equal((html.match(/class="bead[ "]/g) || []).length, 2);
  assert.ok(html.includes('Room 32.'));
  assert.ok(html.includes(`href="/wall/${ACTOR}/"`), 'and a way back to the wall');
  assert.ok(html.includes('class="bead bead-visit"'), 'each bead carries its kind class');
});

test('a bead photo renders through getBlob, with its alt and dimensions', () => {
  const withImage = bead({ images: [{
    image: { $type: 'blob', ref: { $link: 'bafkreiA' }, mimeType: 'image/jpeg', size: 1 },
    alt: 'The bar at closing time.',
    aspectRatio: { width: 1200, height: 900 },
  }] });
  const html = renderStrand({ strand: rec('r1'), actor: ACTOR, blobBase: BLOB, beads: [withImage] });
  assert.ok(html.includes('com.atproto.sync.getBlob'), html);
  assert.ok(html.includes('cid=bafkreiA'), 'the cid hangs off the getBlob prefix');
  assert.ok(html.includes('&amp;cid='), 'and the query is escaped for markup');
  assert.ok(html.includes('alt="The bar at closing time."'));
  assert.ok(html.includes('width="1200"'));
  assert.ok(html.includes('loading="lazy"'));
});

test('a missing bead is said out loud', () => {
  const html = renderStrand({
    strand: rec('r1'), actor: ACTOR, blobBase: BLOB,
    beads: [bead(), { uri: 'at://did:plc:abc/com.cultureblocs.bead/gone', missing: true }],
  });
  assert.match(html, /a bead could not be loaded/i);
  assert.ok(html.includes('class="bead bead-missing"'), 'the stylesheet depends on the missing class');
});

test('a strand with no beads still renders, rather than looking broken', () => {
  const html = renderStrand({ strand: rec('r1', { items: [] }), actor: ACTOR, blobBase: BLOB, beads: [] });
  assert.ok(html.includes('At the National Gallery'));
  assert.ok(!/class="bead[ "]/.test(html), 'no bead elements in the output');
});

test('records whose day order differs from createdAt order come out in day order', () => {
  // Three strands: created in order A, B, C but about days C, A, B
  const records = [
    rec('r1', { createdAt: '2026-09-16T10:00:00Z', day: '2026-09-18T00:00:00Z', title: 'TitleA' }),
    rec('r2', { createdAt: '2026-09-17T10:00:00Z', day: '2026-09-16T00:00:00Z', title: 'TitleB' }),
    rec('r3', { createdAt: '2026-09-18T10:00:00Z', day: '2026-09-17T00:00:00Z', title: 'TitleC' }),
  ];
  const html = renderWall({ actor: ACTOR, records, page: 1 });
  // Extract title order from the HTML
  const aIdx = html.indexOf('TitleA');
  const bIdx = html.indexOf('TitleB');
  const cIdx = html.indexOf('TitleC');
  assert.ok(aIdx < cIdx && cIdx < bIdx, 'sorted by day (18, 17, 16), newest first');
});

test('two strands sharing a day fall back to createdAt', () => {
  const records = [
    rec('r1', { day: '2026-09-18T00:00:00Z', createdAt: '2026-09-18T08:00:00Z', title: 'TitleFirst' }),
    rec('r2', { day: '2026-09-18T00:00:00Z', createdAt: '2026-09-18T10:00:00Z', title: 'TitleSecond' }),
  ];
  const html = renderWall({ actor: ACTOR, records, page: 1 });
  // Second has createdAt 10:00, First has 08:00, so Second should come first (newer)
  assert.ok(html.indexOf('TitleSecond') < html.indexOf('TitleFirst'), 'same day, sorted by createdAt, newest first');
});

test('a strand with no day still sorts by createdAt', () => {
  const records = [
    rec('r1', { day: null, createdAt: '2026-09-16T10:00:00Z', title: 'Old' }),
    rec('r2', { day: '2026-09-17T00:00:00Z', createdAt: '2026-09-18T10:00:00Z', title: 'New' }),
  ];
  const html = renderWall({ actor: ACTOR, records, page: 1 });
  // When day is null, dayOf falls back to createdAt
  const hasOld = html.includes('Old');
  const hasNew = html.includes('New');
  assert.ok(hasOld && hasNew, 'both strands rendered');
  // New (day 2026-09-17) should come before Old (createdAt 2026-09-16)
  assert.ok(html.indexOf('New') < html.indexOf('Old'), 'sorted correctly');
});

test('bullet markers do not leak into the summary', () => {
  const narrative = 'First para.\n\n* Bullet one\n* Bullet two\n\nLast para.';
  const m = strandSummary(rec('r1', { narrative }), { actor: ACTOR });
  assert.ok(!m.opening.includes('*'), `no * in opening: "${m.opening}"`);
  assert.match(m.opening, /First para/, 'opening starts with first paragraph');
});

test('a leading minus is prose, not a bullet marker, and survives intact', () => {
  const m = strandSummary(rec('r1', { narrative: '-5 degrees outside, and still we went.' }),
    { actor: ACTOR });
  assert.match(m.opening, /^-5 degrees outside/, `leading minus preserved: "${m.opening}"`);
});

test('a numeric title does not take the page down, and the day stands in for it', () => {
  const records = [rec('r1', { title: 2026 })];
  assert.doesNotThrow(() => renderWall({ actor: ACTOR, records, page: 1 }));
  const html = renderWall({ actor: ACTOR, records, page: 1 });
  assert.ok(!html.includes('>2026<'), `numeric title absent, not rendered raw: ${html}`);
  assert.ok(html.includes('18 September 2026'), 'falls back to the day, like an empty title does');
});

test('an object title does not take a strand page down, and the day stands in for it', () => {
  assert.doesNotThrow(() => renderStrand({ strand: rec('r1', { title: {} }), actor: ACTOR, blobBase: BLOB, beads: [] }));
  const html = renderStrand({ strand: rec('r1', { title: {} }), actor: ACTOR, blobBase: BLOB, beads: [] });
  assert.ok(!html.includes('[object Object]'), html);
  assert.ok(html.includes('18 September 2026'), 'falls back to the day');
});

test('an object narrative does not take a strand page down, and is simply absent', () => {
  assert.doesNotThrow(() => renderStrand({ strand: rec('r1', { narrative: {} }), actor: ACTOR, blobBase: BLOB, beads: [] }));
  const html = renderStrand({ strand: rec('r1', { narrative: {} }), actor: ACTOR, blobBase: BLOB, beads: [] });
  assert.ok(!html.includes('class="narrative"'), 'a non-string narrative reads as absent, not thrown');
});

test('an object place name does not take the page down, and is simply absent', () => {
  const strand = rec('r1', { place: { name: {} } });
  assert.doesNotThrow(() => renderStrand({ strand, actor: ACTOR, blobBase: BLOB, beads: [] }));
  const html = renderStrand({ strand, actor: ACTOR, blobBase: BLOB, beads: [] });
  assert.ok(!html.includes('[object Object]'), html);
});
