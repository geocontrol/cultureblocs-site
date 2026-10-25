import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { esc, renderDirectory, safeHref, sourceLine } from '../lib/render.js';
import { merge } from '../lib/schedule.js';

const listing = JSON.parse(readFileSync(
  new URL('../frieze-week-london/events.json', import.meta.url), 'utf8'));

test('record text is escaped and only http(s) links are kept', () => {
  assert.equal(esc('<b onclick="x">'), '&lt;b onclick=&quot;x&quot;&gt;');
  assert.equal(safeHref('javascript:alert(1)'), null);
  assert.equal(safeHref('https://frieze.com/'), 'https://frieze.com/');
  const evil = merge([{ slug: 's', category: 'talk', rkey: 'k', atUri: 'at://h/c/k', record: {
    name: '<script>x</script>', startsAt: '2026-10-15T12:00:00+01:00',
    uris: [{ uri: 'javascript:alert(1)', name: 'bad' }, { uri: 'https://ok.example/', name: 'ok' }],
  } }]);
  const html = renderDirectory({ events: evil });
  assert.ok(!html.includes('<script>'));
  assert.ok(!html.includes('javascript:'));
  assert.ok(html.includes('https://ok.example/'));
});

test('the Frieze page renders every day, the running section, and filters that exist', () => {
  const html = renderDirectory({ events: merge(listing.records), today: '2026-10-15' });
  assert.ok(html.includes('id="d-2026-10-15"'));
  assert.ok(html.includes('id="running"'));
  assert.ok(html.includes('aria-current="date"'));
  for (const f of ['all', 'fairs', 'talks', 'exhibitions', 'galleries', 'nights']) {
    assert.ok(html.includes(`data-filter="${f}"`), f);
  }
  assert.ok(html.includes('Closes Sun 18 Oct'));        // Kapoor ends in the week
  assert.ok(!html.includes('Frieze Week London 2026</h3>')); // umbrella not listed
});

test('the source line says honestly where the events came from', () => {
  assert.match(sourceLine({ actor: 'cultureblocs.com', live: 30, total: 30 }), /all 30 events/);
  assert.match(sourceLine({ actor: 'cultureblocs.com', live: 3, total: 30 }), /3 of 30/);
  assert.match(sourceLine({ actor: 'cultureblocs.com', live: 0, total: 30 }), /not yet published/);
  assert.match(sourceLine({ actor: 'cultureblocs.com', live: 0, total: 30, error: true }), /couldn’t be reached/);
});

import { actorPath } from '../lib/render.js';
import { beadItem } from '../lib/whowent.js';

test('profile links keep a DID readable — bsky.app cannot open did%3Aplc%3A…', () => {
  assert.equal(actorPath('did:plc:7agixx6qbaedfeyszn3lfboo'), 'did:plc:7agixx6qbaedfeyszn3lfboo');
  assert.equal(actorPath('did:web:www.cultureblocs.com'), 'did:web:www.cultureblocs.com');
  assert.equal(actorPath('Iain.bsky.social'), 'iain.bsky.social');
  assert.equal(actorPath('../x?y'), '..%2Fx%3Fy');
  const html = beadItem({ did: 'did:plc:7agixx6qbaedfeyszn3lfboo', rkey: '3mxh7gss6j42s',
    profile: { handle: 'iaindodsworth.bsky.social' }, value: { createdAt: '2026-10-09T12:00:00.000Z' } });
  assert.ok(html.includes('href="https://bsky.app/profile/did:plc:7agixx6qbaedfeyszn3lfboo"'));
  assert.ok(!html.includes('%3A'));
});

/* ---------- Peckham Digital: a festival with workshops ---------- */
import { arrange, tzOf } from '../lib/schedule.js';
import { kindFor } from '../../went/lib/compose.js';

const peckham = JSON.parse(readFileSync(
  new URL('../peckham-digital/events.json', import.meta.url), 'utf8'));

test('Peckham Digital arranges into its four days, Sunday after the clock change', () => {
  const events = merge(peckham.records);
  const { days } = arrange(events, tzOf(peckham));
  assert.deepEqual(days.map(d => d.date), ['2026-10-22', '2026-10-23', '2026-10-24', '2026-10-25']);
  const sun = days.find(d => d.date === '2026-10-25');
  const pd = sun.timed.find(x => x.ev.slug === 'intro-to-pure-data');
  assert.ok(pd.when.startsWith('10:00'), pd.when);   // GMT on the 25th, still 10:00 on the door
  // the exhibition runs alongside every day
  for (const d of days) assert.ok(d.open.some(x => x.ev.slug === 'exhibition-2026'), d.date);
});

test('Workshops get their own chip, but only where a listing has workshops', () => {
  const html = renderDirectory({ events: merge(peckham.records), tz: tzOf(peckham) });
  for (const f of ['all', 'workshops', 'talks', 'exhibitions', 'nights']) {
    assert.ok(html.includes(`data-filter="${f}"`), f);
  }
  assert.ok(!html.includes('data-filter="fairs"'));
  const frieze = renderDirectory({ events: merge(listing.records) });
  assert.ok(!frieze.includes('data-filter="workshops"'));
  assert.equal(kindFor('workshop'), 'visit');
  assert.equal(kindFor('talk'), 'performance');
});

/* ---------- Games Transformed: a programme without times ---------- */
const gt = JSON.parse(readFileSync(
  new URL('../games-transformed/events.json', import.meta.url), 'utf8'));
const gtSource = readFileSync(
  new URL('../../tools/events/games_transformed_2026_source.txt', import.meta.url), 'utf8')
  .split('\n').filter(l => l.trim() && !l.startsWith('#')).map(l => l.split('\t')[2].replace(/\s+/g, ' ').trim());

test('Games Transformed lists every programme item, titles as the festival gives them', () => {
  const names = new Set(gt.records.map(r => r.record.name));
  assert.equal(gtSource.length, 63);
  for (const t of gtSource) assert.ok(names.has(t), t);
  assert.equal(gt.records.length, 68);   // + umbrella, symposium, costumes, afterparty, youth programme
});

test('Games Transformed sessions show Time tbc under their day; games run both days', () => {
  const { days } = arrange(merge(gt.records), tzOf(gt));
  assert.deepEqual(days.map(d => d.date), ['2026-10-30', '2026-10-31', '2026-11-01']);
  const [fri, sat, sun] = days;
  assert.ok(fri.timed.some(x => x.ev.slug === 'games-against-borders' && x.when === '18:30–23:00'));
  const panel = sat.open.find(x => x.ev.slug === 'technofascism-and-the-potential-of-gameful-resistance');
  assert.equal(panel.when, 'Time tbc');
  assert.ok(sat.timed.some(x => x.ev.slug === 'motherlode-afterparty' && x.when === 'From 20:00'));
  assert.equal(sat.open.filter(x => x.ev.slug === 'venba').length, 1);
  assert.equal(sun.open.find(x => x.ev.slug === 'venba').when, 'Final day · until 19:30');
  // undated sessions come before the games that run all weekend
  const idx = (d, slug) => d.open.findIndex(x => x.ev.slug === slug);
  assert.ok(idx(sat, 'technofascism-and-the-potential-of-gameful-resistance') < idx(sat, 'venba'));
  for (const r of gt.records) {
    assert.ok(r.record.startsAt.endsWith('+00:00'), r.slug);       // GMT after the clock change
    assert.equal(r.record.locations[0].name,
      'Proposition, Pelican House or Three Colts Tavern, Bethnal Green');
  }
});

test('Games get their own chip only where a listing has games; panels are talks', () => {
  const html = renderDirectory({ events: merge(gt.records), tz: tzOf(gt) });
  for (const f of ['all', 'workshops', 'talks', 'games', 'nights']) {
    assert.ok(html.includes(`data-filter="${f}"`), f);
  }
  assert.ok(!html.includes('data-filter="exhibitions"'));
  assert.ok(!renderDirectory({ events: merge(peckham.records), tz: tzOf(peckham) })
    .includes('data-filter="games"'));
  assert.equal(kindFor('panel'), 'performance');
  assert.equal(kindFor('videogame'), 'dwell');
  assert.equal(kindFor('game-session'), 'visit');
});
