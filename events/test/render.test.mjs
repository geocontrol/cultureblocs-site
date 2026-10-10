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
