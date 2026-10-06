/* The report page: collect, summarise, render. Reads data-dir from
 * <main id="report" data-dir="…">. Also offers the data as a JSON file. */
import { collect } from './lib/collect.js';
import { summarise } from './lib/report.js';
import { dayColumns, eventBars, notes, pairList, table, tiles } from './lib/reportview.js';
import { esc } from './lib/render.js';

const root = document.getElementById('report');
const dir = root.dataset.dir;
const $ = (id) => document.getElementById(id);

function stamp() {
  return new Intl.DateTimeFormat('en-GB', { timeZone: 'Europe/London', dateStyle: 'medium', timeStyle: 'short' })
    .format(new Date());
}

function download(data, s) {
  const out = {
    directory: dir,
    generatedAt: new Date().toISOString(),
    method: 'Beads (com.cultureblocs.bead) whose subject is one of this directory\'s community.lexicon.calendar.event records, found via Constellation and read from each author\'s repository; hidden entries excluded.',
    totals: { people: s.people, beads: s.beads, notes: s.notes, eventsReached: s.eventsReached, eventsTotal: s.eventsTotal, strands: s.strands, posts: s.posts },
    perEvent: s.perEvent.map(({ slug, name, category, people, beads }) => ({ slug, name, category, people, beads })),
    perDay: s.perDay,
    pairs: s.pairs.map(p => ({ a: p.a.slug, b: p.b.slug, people: p.people })),
    beads: data.beads.map(b => ({ uri: b.uri, author: b.did, handle: b.profile?.handle || b.handle, event: b.value.subject.uri,
      day: String(b.value.createdAt).slice(0, 10), kind: b.value.kind, note: b.value.note || null })),
  };
  const url = URL.createObjectURL(new Blob([JSON.stringify(out, null, 2)], { type: 'application/json' }));
  const a = $('rp-download');
  a.href = url;
  a.download = `${dir}-report.json`;
  a.hidden = false;
}

async function main() {
  try {
    const data = await collect(dir);
    const s = summarise({
      listing: data.listing, beads: data.beads,
      strands: data.strands ? data.strands.count : null,
      posts: data.posts ? data.posts.count : null,
    });
    $('rp-status').innerHTML = `Live from the network · ${esc(stamp())}${data.partial ? ' · some events could not be checked just now' : ''}`;
    $('rp-tiles').innerHTML = tiles(s);
    $('rp-events').innerHTML = eventBars(s.perEvent, dir);
    $('rp-days').innerHTML = dayColumns(s.perDay);
    $('rp-pairs').innerHTML = pairList(s.pairs, dir)
      + (s.widest > 1 ? `<p class="rp-note">The fullest week so far: one person recorded ${s.widest} different events.</p>` : '');
    $('rp-notes').innerHTML = notes(data.beads, data.listing, dir);
    $('rp-tables').innerHTML = table(s);
    if (data.posts?.rkey) {
      $('rp-feed').href = `https://bsky.app/profile/${encodeURIComponent(data.posts.publisher)}/feed/${encodeURIComponent(data.posts.rkey)}`;
    }
    download(data, s);
    root.classList.add('ready');
  } catch (err) {
    $('rp-status').textContent = `The report couldn’t be put together just now (${err.message}). Try again shortly.`;
  }
}

main();
