import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { placeOf, renderGallery } from '../lib/gallery.js';
import { merge } from '../lib/schedule.js';

const listing = JSON.parse(readFileSync(
  new URL('../serpentine-galleries/events.json', import.meta.url), 'utf8'));
const events = merge(listing.records);
const bySlug = (s) => events.find(e => e.slug === s);
const where = (slug, today) => placeOf(bySlug(slug), today, 'Europe/London');

test('the listing is a gallery with a home outside /events/', () => {
  assert.equal(listing.meta.layout, 'gallery');
  assert.equal(listing.meta.home, '/gallery/london/serpentine/');
  for (const e of listing.records) {
    assert.ok(listing.meta.venues[e.venue], `${e.slug} venue`);
    assert.ok(e.beadKind, `${e.slug} beadKind`);
    if (e.about) assert.ok(bySlug(e.about), `${e.slug} about`);
  }
});

test('on 7 October: Kanwar and the Pavilion are on, Caguiat is opening, talks are dated', () => {
  const t = '2026-10-07';
  assert.equal(where('amar-kanwar', t).part, 'now');
  assert.equal(where('amar-kanwar', t).when, 'Until 31 Jan 2027');
  assert.equal(where('serpentine-pavilion-2026-lanza-atelier', t).when, 'Closes Sun 25 Oct');
  assert.equal(where('justin-caguiat-change-ringing', t).part, 'soon');
  assert.equal(where('justin-caguiat-change-ringing', t).when, 'Opens Thu 8 Oct');
  assert.equal(where('saturday-talk-alexa-chow-caguiat', t).part, 'dated');
  assert.equal(where('saturday-talk-alexa-chow-caguiat', t).when, '11:00');
  assert.equal(where('park-nights-2026-shala-miller-02-oct', t).part, 'recent');
});

test('after the Pavilion closes it moves to Recently, then drops off', () => {
  assert.equal(where('serpentine-pavilion-2026-lanza-atelier', '2026-10-25').when, 'Final day');
  assert.equal(where('serpentine-pavilion-2026-lanza-atelier', '2026-11-01').part, 'recent');
  assert.equal(where('serpentine-pavilion-2026-lanza-atelier', '2027-01-15'), null);
});

test('the page renders each part in order, with I went links into the directory', () => {
  const html = renderGallery({ events, today: '2026-10-07', dir: 'serpentine-galleries', tz: 'Europe/London' });
  const order = ['id="now"', 'id="soon"', 'id="dated"', 'id="recent"'].map(s => html.indexOf(s));
  assert.ok(order.every(i => i >= 0), 'all four parts');
  assert.deepEqual([...order].sort((a, b) => a - b), order);
  assert.ok(html.includes('/went/?dir=serpentine-galleries&amp;event='));
  assert.ok(html.includes('/events/serpentine-galleries/amar-kanwar/'));
  assert.ok(html.indexOf('Sat 10 Oct') < html.indexOf('Sat 31 Oct'));
});
