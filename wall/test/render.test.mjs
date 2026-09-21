import { test } from 'node:test';
import assert from 'node:assert/strict';
import { blocksHtml, esc } from '../lib/embed.js';
import { PAGE_SIZE, paging, renderWall, strandSummary } from '../lib/render.js';

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
  assert.ok(html.includes(`/wall/${ACTOR}/r0`));
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
