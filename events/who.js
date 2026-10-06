/* "Who went" on an event's own page. The page names its event:
 *   <section id="who-went" data-event="at://…" data-went="/went/?…">
 * Beads are found through Constellation and read from their authors' own
 * repositories (see lib/went.js). Nothing here can break the page: if the
 * index is unreachable, the section says so and the rest stands. */
import { beadLinks, hider, makeReader, readBeads } from './lib/went.js';
import { beadList } from './lib/whowent.js';
import { esc } from './lib/render.js';

const section = document.getElementById('who-went');
const items = document.getElementById('who-items');

async function hiddenList() {
  try {
    const r = await fetch('/events/hidden.json', { cache: 'no-cache' });
    return hider(r.ok ? await r.json() : null);
  } catch {
    return hider(null);
  }
}

async function main() {
  const uri = section.dataset.event;
  const went = section.dataset.went;
  const firstOne = `<p class="ev-intro">No one has said they went yet.${went
    ? ` Been? <a href="${esc(went)}">Be the first →</a>` : ''}</p>`;
  try {
    const [hidden, links] = await Promise.all([hiddenList(), beadLinks(uri)]);
    const beads = await readBeads(links, { reader: makeReader(), hidden, eventUris: new Set([uri]) });
    if (!beads.length) { items.innerHTML = firstOne; return; }
    const people = new Set(beads.map(b => b.did)).size;
    items.innerHTML = `<p class="ev-intro">${people} ${people === 1 ? 'person' : 'people'} so far, newest first.</p>`
      + beadList(beads, () => ({ noteMax: 3000 }));
  } catch {
    items.innerHTML = '<p class="ev-intro">Who went couldn’t be loaded just now — the open index may be busy. Try again later.</p>';
  }
}

if (section && items) main();
