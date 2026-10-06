import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  HASHTAG, POST_MAX, buildBead, buildPost, covers, dayOptions, defaultPostText,
  findExisting, graphemes, hashtagFacets, kindFor, parseAtUri, scopesFor, validDirectory,
} from '../lib/compose.js';

const EV = 'at://did:plc:pub/community.lexicon.calendar.event/3mx5noaocjcbn';
const fair = { name: 'Frieze London 2026', startsAt: '2026-10-14T11:00:00+01:00', endsAt: '2026-10-18T18:00:00+01:00' };

test('at:// URIs parse; anything else does not', () => {
  assert.deepEqual(parseAtUri(EV), { authority: 'did:plc:pub', collection: 'community.lexicon.calendar.event', rkey: '3mx5noaocjcbn' });
  assert.equal(parseAtUri('https://example.com/x'), null);
  assert.equal(parseAtUri('at://did:plc:x/coll'), null);
  assert.ok(validDirectory('frieze-week-london'));
  assert.ok(!validDirectory('../etc'));
  assert.ok(!validDirectory('Frieze'));
});

test('days: never the future, chips for a short fair, a picker for a long run', () => {
  assert.deepEqual(dayOptions(fair, '2026-10-06'), { status: 'future', opens: '2026-10-14' });
  const mid = dayOptions(fair, '2026-10-16');
  assert.equal(mid.mode, 'chips');
  assert.deepEqual(mid.days.map(d => d.date), ['2026-10-14', '2026-10-15', '2026-10-16']);
  assert.equal(mid.initial, '2026-10-16');
  const after = dayOptions(fair, '2026-11-02');
  assert.equal(after.days.length, 5);
  assert.equal(after.initial, '2026-10-18');
  assert.ok(after.ended);
  const bayeux = { name: 'Bayeux', startsAt: '2026-09-10T00:00:00+01:00', endsAt: '2027-07-11T23:59:00+01:00' };
  assert.deepEqual(dayOptions(bayeux, '2026-10-06'),
    { status: 'ok', mode: 'picker', min: '2026-09-10', max: '2026-10-06', ended: false, initial: '2026-10-06' });
});

test('the bead points at the event, holds the day not the moment, and no location', () => {
  const bead = buildBead({
    event: { uri: EV, cid: 'bafyrei-event', value: fair }, day: '2026-10-15',
    note: '  The Code Universe section.  ', kind: 'visit', tags: ['frieze-week-london-2026'],
    eventUrl: 'https://www.cultureblocs.com/events/frieze-week-london/frieze-london-2026/',
    now: new Date('2026-10-15T19:03:00Z'),
  });
  assert.deepEqual(bead, {
    $type: 'com.cultureblocs.bead', kind: 'visit', createdAt: '2026-10-15T12:00:00.000Z',
    subject: { $type: 'com.cultureblocs.defs#strongRef', uri: EV, cid: 'bafyrei-event' },
    note: 'The Code Universe section.', tags: ['frieze-week-london-2026'],
    links: [{ uri: 'https://www.cultureblocs.com/events/frieze-week-london/frieze-london-2026/', title: 'Frieze London 2026' }],
    provenance: { app: 'cultureblocs-went', mintedAt: '2026-10-15T19:03:00.000Z', timeAnchored: false },
  });
  assert.ok(!('geo' in bead));
  const bare = buildBead({ event: { uri: EV, value: fair }, day: '2026-10-15', note: '' });
  assert.ok(!('note' in bare) && !('tags' in bare) && !('links' in bare) && !('cid' in bare.subject));
});

test('a second bead for the same event and day is found, whichever authority it used', () => {
  const beads = [
    { uri: 'at://did:plc:me/com.cultureblocs.bead/a', value: { createdAt: '2026-10-14T12:00:00.000Z', subject: { uri: EV } } },
    { uri: 'at://did:plc:me/com.cultureblocs.bead/b', value: { createdAt: '2026-10-15T12:00:00.000Z',
      subject: { uri: 'at://cultureblocs.com/community.lexicon.calendar.event/3mx5noaocjcbn' } } },
  ];
  assert.equal(findExisting(beads, EV, '2026-10-15', ['did:plc:pub', 'cultureblocs.com']).rkey, 'b');
  assert.equal(findExisting(beads, EV, '2026-10-15', ['did:plc:pub']), null);
  assert.equal(findExisting(beads, EV, '2026-10-16', ['cultureblocs.com']), null);
  assert.equal(findExisting(beads, EV, '2026-10-14').rkey, 'a');
});

test('post text: the hashtag always survives, the note gives way', () => {
  assert.equal(defaultPostText({ name: 'PAD London 2026', note: '' }), `I went to PAD London 2026 ${HASHTAG}`);
  assert.equal(defaultPostText({ name: 'PAD', note: 'Great\n\nchairs' }), `I went to PAD — Great chairs ${HASHTAG}`);
  const long = defaultPostText({ name: 'Frieze Masters 2026', note: 'x'.repeat(500) });
  assert.equal(graphemes(long), POST_MAX);
  assert.ok(long.endsWith(` ${HASHTAG}`));
  assert.ok(long.includes('…'));
});

test('hashtag facets use UTF-8 byte offsets', () => {
  const text = 'Café — wow #CultureBlocs';
  const [f] = hashtagFacets(text);
  const bytes = new TextEncoder().encode(text);
  assert.equal(new TextDecoder().decode(bytes.slice(f.index.byteStart, f.index.byteEnd)), '#CultureBlocs');
  assert.equal(f.features[0].tag, 'CultureBlocs');
  assert.deepEqual(hashtagFacets('no tags, and #1 is not one'), []);
});

test('the post carries hidden tags and a link card', () => {
  const thumb = { $type: 'blob', ref: { $link: 'bafkrei' }, mimeType: 'image/png', size: 9 };
  const post = buildPost({ text: `I went to PAD ${HASHTAG}`, eventUrl: 'https://www.cultureblocs.com/events/x/pad/',
    title: 'PAD London 2026', description: 'Tue 13 Oct – Sun 18 Oct', thumb, tags: ['frieze-week-london-2026'],
    now: new Date('2026-10-15T19:00:00Z') });
  assert.equal(post.$type, 'app.bsky.feed.post');
  assert.deepEqual(post.tags, ['cultureblocs', 'frieze-week-london-2026']);
  assert.equal(post.embed.$type, 'app.bsky.embed.external');
  assert.equal(post.embed.external.thumb, thumb);
  assert.equal(post.facets.length, 1);
});

test('scopes: ask only for what this publish needs; generic covers all', () => {
  assert.equal(scopesFor({ post: false }), 'atproto repo:com.cultureblocs.bead?action=create&action=update');
  assert.match(scopesFor({ post: true }), /repo:app\.bsky\.feed\.post\?action=create blob:image\/\*$/);
  assert.ok(covers('atproto transition:generic', { post: true }));
  assert.ok(covers(scopesFor({ post: false }), { post: false }));
  assert.ok(!covers(scopesFor({ post: false }), { post: true }));
  assert.ok(!covers('atproto', { post: false }));
});

test('default kinds follow the directory category', () => {
  assert.equal(kindFor('fair'), 'visit');
  assert.equal(kindFor('talk'), 'performance');
  assert.equal(kindFor('screening'), 'screening');
  assert.equal(kindFor(undefined), 'visit');
});
