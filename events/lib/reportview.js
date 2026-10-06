/* HTML for the report. Pure. Charts are plain HTML bars in one colour —
 * magnitude only; what a bar is comes from its text label, never its hue. */
import { esc } from './render.js';
import { beadList } from './whowent.js';

const KIND = { fair: 'Fair', talk: 'Talk', talks: 'Talks', screening: 'Film', exhibition: 'Exhibition',
  commission: 'Commission', 'gallery-day': 'Gallery day', party: 'Night', performance: 'Performance' };
const n = (v) => (v === null || v === undefined ? '—' : String(v));
const plural = (k, one, many) => `${k} ${k === 1 ? one : many}`;

export function tiles(s) {
  const t = [
    ['People', s.people, 'said they went'],
    ['Beads', s.beads, 'visits recorded'],
    ['Events', `${s.eventsReached}<small>/${s.eventsTotal}</small>`, 'with someone there'],
    ['Notes', s.notes, 'in their own words'],
    ['Strands', n(s.strands), 'weeks published'],
    ['Posts', n(s.posts), 'in the Bluesky feed'],
  ];
  return `<div class="rp-tiles">${t.map(([label, value, sub]) => `
    <div class="rp-tile"><p class="rp-label">${label}</p><p class="rp-value">${typeof value === 'string' && value.includes('<small>') ? value : esc(value)}</p><p class="rp-sub">${sub}</p></div>`).join('')}</div>`;
}

export function eventBars(perEvent, dir) {
  const rows = perEvent.filter(r => r.people > 0);
  const quiet = perEvent.length - rows.length;
  if (!rows.length) return '<p class="ev-intro">No one has recorded an event yet.</p>';
  const max = Math.max(...rows.map(r => r.people));
  const bars = rows.map(r => {
    const pct = Math.max(2, Math.round((r.people / max) * 100));
    const tip = `${r.name}: ${plural(r.people, 'person', 'people')}, ${plural(r.beads, 'bead', 'beads')}`;
    return `<li class="rp-row" title="${esc(tip)}">
      <div class="rp-name"><a href="/events/${esc(dir)}/${esc(r.slug)}/">${esc(r.name)}</a><span>${esc(KIND[r.category] || '')}</span></div>
      <div class="rp-track"><span class="rp-bar" style="width:${pct}%"></span><b class="rp-num">${r.people}</b></div>
    </li>`;
  }).join('');
  return `<ul class="rp-bars" aria-label="People per event">${bars}</ul>
  ${quiet ? `<p class="rp-note">${plural(quiet, 'other event', 'other events')} with no one recorded yet.</p>` : ''}`;
}

export function dayColumns(perDay) {
  const max = Math.max(1, ...perDay.map(d => d.beads));
  const cols = perDay.map(d => {
    const h = d.beads ? Math.max(4, Math.round((d.beads / max) * 100)) : 0;
    const tip = `${d.label}: ${plural(d.beads, 'bead', 'beads')} from ${plural(d.people, 'person', 'people')}`;
    return `<li class="rp-col" title="${esc(tip)}">
      <b class="rp-num">${d.beads || ''}</b>
      <span class="rp-colbar" style="height:${h}%"></span>
      <span class="rp-day">${esc(d.label.replace(' Oct', ''))}</span>
    </li>`;
  }).join('');
  return `<ol class="rp-cols" aria-label="Beads per day">${cols}</ol>`;
}

export function pairList(pairs, dir) {
  if (!pairs.length) return '<p class="ev-intro">Once someone records two events, the combinations show here.</p>';
  return `<ul class="rp-pairs">${pairs.map(p => `<li>
    <a href="/events/${esc(dir)}/${esc(p.a.slug)}/">${esc(p.a.record.name)}</a> <span>+</span>
    <a href="/events/${esc(dir)}/${esc(p.b.slug)}/">${esc(p.b.record.name)}</a>
    <b>${plural(p.people, 'person', 'people')}</b></li>`).join('')}</ul>`;
}

export function notes(beads, listing, dir) {
  const withNotes = beads.filter(b => String(b.value?.note || '').trim());
  if (!withNotes.length) return '<p class="ev-intro">No notes yet.</p>';
  const byUri = new Map(listing.records.map(e => [e.atUri, e]));
  return beadList(withNotes, (b) => {
    const e = byUri.get(b.value.subject.uri);
    return { event: e ? { name: e.record.name, href: `/events/${dir}/${e.slug}/` } : null, noteMax: 600 };
  });
}

/* The same figures as a table, for screen readers and for copying. */
export function table(s) {
  const rows = s.perEvent.map(r => `<tr><td>${esc(r.name)}</td><td>${esc(KIND[r.category] || '')}</td><td class="num">${r.people}</td><td class="num">${r.beads}</td></tr>`).join('');
  const days = s.perDay.map(d => `<tr><td>${esc(d.label)}</td><td class="num">${d.people}</td><td class="num">${d.beads}</td></tr>`).join('');
  return `<details class="rp-table"><summary>The figures as tables</summary>
    <table><thead><tr><th>Event</th><th>Kind</th><th class="num">People</th><th class="num">Beads</th></tr></thead><tbody>${rows}</tbody></table>
    <table><thead><tr><th>Day</th><th class="num">People</th><th class="num">Beads</th></tr></thead><tbody>${days}</tbody></table>
  </details>`;
}
