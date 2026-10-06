import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildStrand, coversStrand, defaultWeekPost, findExistingStrand, strandScopes } from '../lib/strand.js';

const WEEK = 'https://www.cultureblocs.com/events/frieze-week-london/';
const b = (rkey, day, cid = `c-${rkey}`) => ({ uri: `at://did:plc:me/com.cultureblocs.bead/${rkey}`, cid, value: { createdAt: `${day}T12:00:00.000Z` } });

test('the strand orders beads by day, references them strongly and links the week', () => {
  const s = buildStrand({ beads: [b('z', '2026-10-17'), b('a', '2026-10-15')], title: '  My Frieze Week ',
    narrative: 'Two fairs and a film.', weekUrl: WEEK, dirName: 'Frieze Week London 2026', now: new Date('2026-10-19T09:00:00Z') });
  assert.deepEqual(s, {
    $type: 'com.cultureblocs.strand', createdAt: '2026-10-19T09:00:00.000Z', title: 'My Frieze Week',
    items: [
      { $type: 'com.cultureblocs.defs#strongRef', uri: 'at://did:plc:me/com.cultureblocs.bead/a', cid: 'c-a' },
      { $type: 'com.cultureblocs.defs#strongRef', uri: 'at://did:plc:me/com.cultureblocs.bead/z', cid: 'c-z' },
    ],
    links: [{ uri: WEEK, title: 'Frieze Week London 2026' }],
    narrative: 'Two fairs and a film.',
  });
  const bare = buildStrand({ beads: [b('a', '2026-10-15', null)], title: '', weekUrl: WEEK, createdAt: '2026-10-18T00:00:00.000Z' });
  assert.equal(bare.title, 'My week');
  assert.equal(bare.createdAt, '2026-10-18T00:00:00.000Z');   // an update keeps its original date
  assert.ok(!('narrative' in bare) && !('cid' in bare.items[0]));
});

test('an earlier strand for the same week is found by its link, others are not', () => {
  const strands = [
    { uri: 'at://did:plc:me/com.cultureblocs.strand/old', value: { links: [{ uri: 'https://elsewhere/' }] } },
    { uri: 'at://did:plc:me/com.cultureblocs.strand/fw', value: { links: [{ uri: WEEK }] } },
  ];
  assert.equal(findExistingStrand(strands, WEEK).rkey, 'fw');
  assert.equal(findExistingStrand(strands.slice(0, 1), WEEK), null);
  assert.equal(findExistingStrand([{ uri: 'x', value: { links: 'nope' } }], WEEK), null);
});

test('post text and scopes', () => {
  assert.equal(defaultWeekPost({ dirName: 'Frieze Week London', events: 3, days: 2 }), 'My Frieze Week London: 3 events over 2 days #CultureBlocs');
  assert.equal(defaultWeekPost({ dirName: 'Frieze Week London', events: 1, days: 1 }), 'My Frieze Week London: 1 event #CultureBlocs');
  assert.equal(strandScopes({ post: false }), 'atproto repo:com.cultureblocs.strand?action=create&action=update');
  assert.ok(coversStrand(strandScopes({ post: true }), { post: true }));
  assert.ok(!coversStrand(strandScopes({ post: false }), { post: true }));
  assert.ok(!coversStrand('atproto repo:com.cultureblocs.bead?action=create&action=update', { post: false }));
  assert.ok(coversStrand('atproto transition:generic', { post: true }));
});
