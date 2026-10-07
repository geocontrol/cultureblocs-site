import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { byTitle, creditLine, daySlots, letterOf, renderFilms, screeningsOf, sectionsOf, sortTitle } from '../lib/films.js';
import { merge } from '../lib/schedule.js';
import { WENT, countWord, said, verbOf, youSaid } from '../lib/verb.js';
import { kindFor, defaultPostText } from '../../went/lib/compose.js';

const lff = JSON.parse(readFileSync(
  new URL('../london-film-festival/events.json', import.meta.url), 'utf8'));
const frieze = JSON.parse(readFileSync(
  new URL('../frieze-week-london/events.json', import.meta.url), 'utf8'));
const films = merge(lff.records).filter(e => e.category === 'film');
const find = (name) => films.find(e => e.record.name === name);

/* ---------- the verb ---------- */
test('a festival says "I saw"; every other directory still says "I went"', () => {
  const v = verbOf(lff);
  assert.deepEqual(v, { button: 'I saw', past: 'saw', to: false });
  assert.equal(said(v, 'Fjord'), 'I saw Fjord');
  assert.equal(youSaid(v, 'Fjord'), 'You saw Fjord');
  assert.equal(countWord(v, 3), '3 saw');
  assert.equal(countWord(v, 0), '');
  assert.equal(verbOf(frieze), WENT);
  assert.equal(said(WENT, 'Frieze London'), 'I went to Frieze London');
  assert.equal(verbOf({ meta: { verb: { button: 'I saw' } } }), WENT);   // half a verb is no verb
  assert.equal(verbOf({ meta: { verb: 'saw' } }), WENT);
});

test('the default post and the bead kind follow the festival', () => {
  assert.equal(defaultPostText({ name: 'Fjord', note: '', verb: verbOf(lff) }), 'I saw Fjord #CultureBlocs');
  assert.equal(defaultPostText({ name: 'Frieze London', note: '' }), 'I went to Frieze London #CultureBlocs');
  assert.equal(kindFor('film'), 'screening');
});

/* ---------- the listing ---------- */
test('every A–Z entry is one record, with the screenings kept beside it', () => {
  assert.equal(lff.meta.layout, 'films');
  assert.equal(films.length, 258);
  const fjord = find('Fjord');
  assert.equal(fjord.screenings.length, 2);
  assert.equal(fjord.film.directors[0], 'Cristian Mungiu');
  assert.equal(fjord.record.startsAt, '2026-10-17T14:00:00+01:00');
  assert.ok(fjord.record.endsAt > '2026-10-18T17:50:00+01:00');
  // what goes to the network is a plain calendar record — no sidecar fields
  for (const e of lff.records) {
    assert.ok(!('film' in e.record) && !('screenings' in e.record), e.slug);
    assert.ok(e.record.description.length <= 3000, e.slug);
  }
});

test('a short carries its programme and the programme’s screenings', () => {
  const agnes = find('Agnes');
  assert.equal(agnes.film.programme, 'As the Years Roll By');
  assert.deepEqual(agnes.screenings.map(s => s.start),
    ['2026-10-10T15:20:00+01:00', '2026-10-14T15:35:00+01:00']);
  assert.equal(creditLine(agnes.film), 'Dir. Leah Vlemmiks · UK-Canada 2026 · 11min');
});

test('screenings are read in London time, in order', () => {
  const s = screeningsOf(find('The Beloved'));
  assert.deepEqual(s.map(x => `${x.at.date} ${x.at.time}`),
    ['2026-10-08 17:45', '2026-10-11 14:00', '2026-10-15 12:15']);
});

/* ---------- A–Z ---------- */
test('titles file under their first real word', () => {
  assert.equal(sortTitle('The Animals'), 'Animals');
  assert.equal(letterOf('The Animals'), 'A');
  assert.equal(letterOf('A Bit of Light'), 'B');
  assert.equal(letterOf('La Dérive'), 'D');
  assert.equal(letterOf('14th'), '#');
  assert.equal(letterOf('(Failing to Make) A Documentary About My Sudanese Family'), 'F');
  assert.equal(letterOf('Ánimo'), 'A');
  const order = [find('Agnes'), find('The Animals'), find('14th')].sort(byTitle).map(e => e.record.name);
  assert.deepEqual(order, ['14th', 'Agnes', 'The Animals']);
});

/* ---------- by day ---------- */
test('a shorts programme is one line in the day view, not one per short', () => {
  const days = daySlots(films);
  const sat10 = days.find(d => d.date === '2026-10-10');
  const years = sat10.slots.filter(x => x.ev.film?.programme === 'As the Years Roll By');
  assert.equal(years.length, 1);
  // every day of the festival has screenings, and they are in time order
  assert.equal(days[0].date, '2026-10-07');
  assert.equal(days[days.length - 1].date, '2026-10-18');
  for (const d of days) {
    const mins = d.slots.map(x => x.s.at.mins);
    assert.deepEqual(mins, [...mins].sort((a, b) => a - b), d.date);
  }
});

/* ---------- the page ---------- */
test('the festival page renders both views, the sections and the verb', () => {
  const html = renderFilms({ events: merge(lff.records), today: '2026-10-10', dir: 'london-film-festival', verb: verbOf(lff) });
  assert.ok(html.includes('data-view="az"') && html.includes('data-view="days"'));
  assert.ok(html.includes('id="l-A"') && html.includes('id="l-num"'));
  assert.ok(html.includes('id="d-2026-10-10"'));
  assert.ok(html.includes('>I saw</a>'));
  assert.ok(!html.includes('>I went</a>'));
  assert.ok(html.includes('/went/?dir=london-film-festival&amp;event='));
  for (const s of ['Galas', 'Official Competition', 'Shorts', 'Expanded']) assert.ok(sectionsOf(films).includes(s), s);
  assert.equal((html.match(/class="ev ev-films film"/g) || []).length, 258);
});

test('film text is escaped like any other record', () => {
  const evil = merge([{ slug: 'x', category: 'film', rkey: 'k', atUri: 'at://h/c/k',
    record: { name: '<img src=x onerror=alert(1)>', startsAt: '2026-10-10T12:00:00+01:00' },
    film: { title: 't', directors: ['<script>'], section: '"><b>', bfi: 'javascript:alert(1)' },
    screenings: [{ start: '2026-10-10T12:00:00+01:00', venue: '<i>v</i>' }] }]);
  const html = renderFilms({ events: evil, dir: 'd' });
  assert.ok(!/<img|<script>|<i>v|javascript:/.test(html));
});
