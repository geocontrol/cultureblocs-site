/* My beads — the only impure module: sign-in, the person's repository,
 * the page. Decisions live in lib/model.js (tested in node).
 *
 * Routes (the hash): ''  every bead
 *                    #new  a new bead
 *                    #b/<rkey>  one bead, open to edit
 *
 * Reads are public (beads are public records), so the list comes straight
 * from the person's own server. Writes go through OAuth with permission to
 * make, change and delete beads and to upload pictures — nothing else.
 */
import * as oauth from '../went/lib/oauth.js';
import { getRecord, identify, profileCard } from '../went/lib/repo.js';
import { graphemes, truncate } from '../went/lib/compose.js';
import { esc } from '../events/lib/render.js';
import {
  ALT_MAX, BEAD_NSID, EVENT_NSID, FORMATS, IMAGE_BYTES_MAX, IMAGES_MAX, KINDS, NOTE_MAX, STRAND_NSID,
  applyEdit, blobUrl, cidOf, exportJson, fitWithin, formFrom, groupByDay, kindCounts, kindLabel,
  longDay, matches, newBead, parseAtUri, rkeyOf, strandsHolding, toItem, validate,
} from './lib/model.js';

const $ = (id) => document.getElementById(id);
const show = (el, on = true) => { if (el) el.hidden = !on; };
const TZ = Intl.DateTimeFormat().resolvedOptions().timeZone || 'Europe/London';
const SCOPE = `atproto repo:${BEAD_NSID}?action=create&action=update&action=delete blob:image/*`;
const GENERIC = 'atproto transition:generic';
const DRAFT = 'beads:draft';
const RETRIED = 'beads:retried';

const st = {
  me: null,            // { did, handle, pds, profile }
  items: [],           // toItem() of every bead
  names: new Map(),    // subject uri -> { name, href }
  events: [],          // pickable events from the site's directories
  route: location.hash.replace(/^#/, ''),
  signingIn: false,
  editing: null,       // the item being edited, or null for a new bead
  before: null,        // formFrom() of the stored record
  form: null,          // the live form
  newImages: [],       // [{ file, url, alt }]
};

/* ---------- status ---------- */
function say(html) { $('status').innerHTML = html; show($('status'), Boolean(html)); }
function flash(text) {
  const f = $('flash');
  f.textContent = text; show(f, Boolean(text));
  if (text) setTimeout(() => { if (f.textContent === text) show(f, false); }, 6000);
}
function fail(el, msg) { el.textContent = msg || ''; show(el, Boolean(msg)); }

/* ---------- permissions ---------- */
function canWrite(scope) {
  const s = new Set(String(scope || '').split(/\s+/));
  if (s.has('transition:generic')) return true;
  // Any grant that names beads (or every collection) is worth trying: the
  // server has the last word, and a refusal leads back to sign-in.
  return [...s].some(x => x === 'repo:*' || x.startsWith('repo:*?')
    || x.startsWith(`repo:${BEAD_NSID}`) || (x.startsWith('repo?') && x.includes(`collection=${BEAD_NSID}`)));
}
const scopeProblem = (err) => err?.status === 403
  || /scope|forbidden|insufficient/i.test(`${err?.code} ${err?.message}`);

/* ---------- sign in ---------- */
/* Returns an error message, or never returns (the page goes to sign in). */
async function signIn(handle, scope = SCOPE) {
  const h = String(handle || '').trim();
  if (!h) return 'Enter your handle — it looks like name.bsky.social.';
  st.signingIn = true;
  sessionStorage.setItem('beads:route', st.route || '');
  try {
    await oauth.startLogin(h, scope);
    return null;
  } catch (e) {
    st.signingIn = false;
    return `Couldn’t start sign-in: ${e.message}`;
  }
}
async function signInFromForm() {
  fail($('signin-error'), '');
  $('go').disabled = true; $('go').textContent = 'Opening your sign-in…';
  const err = await signIn($('handle').value);
  if (err) {
    fail($('signin-error'), err);
    $('go').disabled = false; $('go').textContent = 'Sign in';
  }
}
$('go').addEventListener('click', signInFromForm);
$('handle').addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); signInFromForm(); } });

$('sign-out').addEventListener('click', async () => {
  if (!leaving()) return;
  st.form = null;
  await oauth.signOut();
  st.me = null; st.items = [];
  location.hash = '';
  showSignIn();
});

function showSignIn(msg) {
  show($('app'), false); show($('hero'));
  say(msg ? `<p>${esc(msg)}</p>` : '');
  show($('signin'));
  $('go').disabled = false; $('go').textContent = 'Sign in';
  $('handle').focus();
}

/* ---------- loading ---------- */
async function listAll(pds, did, collection) {
  const out = [];
  let cursor = '';
  for (let i = 0; i < 100; i++) {
    const r = await fetch(`${pds}/xrpc/com.atproto.repo.listRecords?repo=${encodeURIComponent(did)}`
      + `&collection=${encodeURIComponent(collection)}&limit=100${cursor ? `&cursor=${encodeURIComponent(cursor)}` : ''}`);
    if (r.status === 400 || r.status === 404) return out;
    if (!r.ok) throw new Error(`your server answered ${r.status}`);
    const body = await r.json();
    out.push(...(body.records || []));
    if (!body.cursor || body.cursor === cursor) break;
    cursor = body.cursor;
  }
  return out;
}

async function loadBeads() {
  const recs = await listAll(st.me.pds, st.me.did, BEAD_NSID);
  st.items = recs.map(r => toItem(r, TZ));
}

/* Events people can point a bead at: every directory on the site. */
async function loadEvents() {
  let dirs = ['frieze-week-london', 'paris-art-week', 'london-film-festival', 'peckham-digital'];
  try {
    const html = await (await fetch('/events/', { cache: 'no-cache' })).text();
    const found = [...html.matchAll(/href="\/events\/([a-z0-9-]+)\/"/g)].map(m => m[1]);
    if (found.length) dirs = [...new Set(found)];
  } catch { /* use the list above */ }
  const lists = await Promise.all(dirs.map(async d => {
    try {
      const j = await (await fetch(`/events/${d}/events.json`, { cache: 'no-cache' })).json();
      return (j.records || []).filter(e => e.category !== 'umbrella').map(e => ({
        name: e.record?.name || e.slug, uri: e.atUri, cid: e.cid || '', rkey: e.rkey,
        dir: d, dirName: j.meta?.name || d, href: `/events/${d}/${e.slug}/`,
        start: String(e.record?.startsAt || '').slice(0, 10),
        end: String(e.record?.endsAt || e.record?.startsAt || '').slice(0, 10),
      }));
    } catch { return []; }
  }));
  st.events = lists.flat();
  for (const e of st.events) st.names.set(`${EVENT_NSID}/${e.rkey}`, { name: e.name, href: e.href, dir: e.dirName });
}

/* A subject's name: from the site's listings, else from the record itself. */
const nameKey = (uri) => { const p = parseAtUri(uri); return p ? `${p.collection}/${p.rkey}` : uri; };
const nameOf = (item) => {
  if (item.subject?.kind === 'place') return item.subject.name;
  if (item.subject?.kind === 'record') return st.names.get(nameKey(item.subject.uri))?.name || '';
  return '';
};
async function resolveNames() {
  const todo = [...new Set(st.items.filter(i => i.subject?.kind === 'record')
    .map(i => i.subject.uri).filter(u => !st.names.has(nameKey(u))))].slice(0, 60);
  const who = new Map();
  await Promise.all(todo.map(async uri => {
    const p = parseAtUri(uri);
    if (!p) return;
    try {
      if (!who.has(p.authority)) who.set(p.authority, identify(p.authority));
      const id = await who.get(p.authority);
      const rec = await getRecord(id.pds, id.did, p.collection, p.rkey);
      const v = rec?.value || {};
      const name = v.name || v.title || v.descriptor?.label || '';
      if (name) st.names.set(nameKey(uri), { name, href: null });
    } catch { /* leave unnamed */ }
  }));
}

/* ---------- the list ---------- */
const KIND_VAR = { bloc: 'bloc', visit: 'visit', dwell: 'dwell', encounter: 'encounter', read: 'read',
  listen: 'listen', watch: 'watch', screening: 'watch', performance: 'performance', note: 'faint' };

function thumb(item) {
  const first = item.value.images?.[0];
  const cid = cidOf(first);
  if (!cid) return '';
  return `<img class="bd-thumb" loading="lazy" alt="${esc(first.alt || '')}" src="${esc(blobUrl(st.me.pds, st.me.did, cid))}">`;
}

function card(item) {
  const name = nameOf(item);
  const sub = item.subject?.kind === 'record' ? st.names.get(nameKey(item.subject.uri)) : null;
  const note = item.note.length > 280 ? `${item.note.slice(0, 279).trimEnd()}…` : item.note;
  return `<a class="bd-card ev" href="#b/${esc(item.rkey)}" data-kind="${esc(item.kind)}"${item.proposal ? ' data-proposal' : ''}
    style="--k:var(--${KIND_VAR[item.kind] || 'bloc'})" data-q="">
  <div class="ev-when">${item.time ? esc(item.time) : ''}<span class="bd-kind">${esc(kindLabel(item.kind))}</span></div>
  <div class="ev-body">
    ${name ? `<h3>${esc(name)}</h3>` : ''}
    ${sub?.dir ? `<p class="ev-where">${esc(sub.dir)}</p>` : ''}
    ${note ? `<p class="bd-note">${esc(note)}</p>` : (name ? '' : '<p class="bd-note bd-empty">No note</p>')}
    ${item.tags.length ? `<p class="bd-tags">${item.tags.map(t => `<span>#${esc(t)}</span>`).join(' ')}</p>` : ''}
    ${item.proposal || (item.app && item.app !== 'cultureblocs-beads') ? `<p class="bd-app">${item.proposal ? '<span class="bd-prop">proposal</span> ' : ''}${item.app && item.app !== 'cultureblocs-beads' ? `from ${esc(item.app)}` : ''}</p>` : ''}
  </div>
  ${thumb(item)}
</a>`;
}

function renderList() {
  const q = $('q').value;
  const kind = $('kind-filter').value;
  const shown = st.items.filter(i => matches(i, q, { kind, subjectName: nameOf(i) }));
  const days = groupByDay(shown);
  $('count').textContent = st.items.length
    ? `${shown.length === st.items.length ? '' : `${shown.length} of `}${st.items.length} ${st.items.length === 1 ? 'bead' : 'beads'}`
    : '';
  $('list').innerHTML = !st.items.length
    ? `<div class="bd-empty-state"><h2>No beads yet.</h2>
       <p>Make your first with <b>New bead</b> — or press <b>I went</b> on anything in the
       <a href="/events/">events</a>, and it will show up here.</p></div>`
    : !shown.length ? '<p class="ev-intro">Nothing matches that.</p>'
      : days.map(d => `<section class="day"><h2 class="sec">${esc(d.date ? longDay(d.date) : 'Undated')}</h2>
          ${d.items.map(card).join('\n')}</section>`).join('\n');
}

function fillKindFilter() {
  const counts = kindCounts(st.items);
  const sel = $('kind-filter');
  const was = sel.value;
  sel.innerHTML = '<option value="">Every kind</option>' + [...counts.entries()]
    .sort((a, b) => b[1] - a[1])
    .map(([k, n]) => `<option value="${esc(k)}">${esc(kindLabel(k))} (${n})</option>`).join('');
  sel.value = counts.has(was) ? was : '';
}

$('q').addEventListener('input', renderList);
$('kind-filter').addEventListener('change', renderList);

/* ---------- the editor ---------- */
const ui = {
  kind: $('f-kind'), date: $('f-date'), time: $('f-time'), note: $('f-note'), tags: $('f-tags'),
  format: $('f-format'), place: $('f-place'), eventQ: $('f-event-q'),
};

ui.kind.innerHTML = KINDS.map(([v, l]) => `<option value="${v}">${esc(l)}</option>`).join('');
ui.format.innerHTML = '<option value="">—</option>' + FORMATS.map(f => `<option>${esc(f)}</option>`).join('');
$('f-tz').textContent = `Times are in your time zone, ${TZ.replace(/_/g, ' ')}. Leave the time empty to keep just the day.`;

function readForm() {
  return {
    ...st.form,
    kind: ui.kind.value, date: ui.date.value, time: ui.time.value,
    note: ui.note.value, tags: ui.tags.value, format: ui.format.value,
    place: ui.place.value,
    links: [...$('f-links').querySelectorAll('.bd-link')].map(r => ({
      uri: r.querySelector('[name=uri]').value, title: r.querySelector('[name=title]').value })),
    images: [...$('f-images').querySelectorAll('.bd-img[data-keep]')].map(r => ({
      keep: Number(r.dataset.keep), alt: r.querySelector('textarea').value })),
    newImages: st.newImages.map((n, i) => ({ alt: $('f-images').querySelector(`.bd-img[data-new="${i}"] textarea`)?.value || '' })),
    removeGeo: $('f-geo').checked,
  };
}

function setSubject(v) {
  st.form.subject = v;
  $('f-subject').querySelectorAll('.chip').forEach(c => c.setAttribute('aria-checked', String(c.dataset.v === v)));
  show($('f-event'), v === 'event');
  show($('f-place-row'), v === 'place');
  const keepChip = $('f-subject').querySelector('[data-v=keep]');
  show(keepChip, Boolean(st.editing?.value?.subject));
  const now = $('f-subject-now');
  if (v === 'keep' && st.editing) {
    const name = nameOf(st.editing);
    now.textContent = name || (st.editing.subject?.kind === 'record' ? st.editing.subject.uri : 'Unnamed');
  } else if (v === 'event' && st.form.eventUri) {
    const hit = st.events.find(e => e.uri === st.form.eventUri);
    now.innerHTML = `Chosen: <b>${esc(hit ? `${hit.name} · ${hit.dirName}` : st.form.eventUri)}</b>`;
  } else now.textContent = '';
  if (v === 'event') renderPicks();
}
$('f-subject').addEventListener('click', (e) => {
  const c = e.target.closest('.chip');
  if (!c) return;
  setSubject(c.dataset.v);
  if (c.dataset.v === 'event') ui.eventQ.focus();
  if (c.dataset.v === 'place') ui.place.focus();
});

const foldS = (s) => String(s || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');
function renderPicks() {
  const q = ui.eventQ.value.trim();
  const box = $('f-event-results');
  if (/^at:\/\//.test(q)) {
    box.innerHTML = parseAtUri(q)
      ? `<li><button type="button" data-uri="${esc(q)}" data-cid="">Use this address</button></li>`
      : '<li class="hint">That isn’t a complete at:// address.</li>';
    return;
  }
  const words = foldS(q).split(/\s+/).filter(Boolean);
  if (!words.length) { box.innerHTML = ''; return; }
  const hits = st.events.filter(e => words.every(w => foldS(`${e.name} ${e.dirName}`).includes(w))).slice(0, 8);
  box.innerHTML = hits.length
    ? hits.map(e => `<li><button type="button" data-uri="${esc(e.uri)}" data-cid="${esc(e.cid)}" data-start="${esc(e.start)}" data-end="${esc(e.end)}">
        <b>${esc(e.name)}</b> <span>${esc(e.dirName)}</span></button></li>`).join('')
    : '<li class="hint">No event by that name.</li>';
}
ui.eventQ.addEventListener('input', renderPicks);
$('f-event-results').addEventListener('click', (e) => {
  const b = e.target.closest('button[data-uri]');
  if (!b) return;
  st.form.eventUri = b.dataset.uri;
  st.form.eventCid = b.dataset.cid;
  // If the day hasn't been chosen yet and it falls outside the event,
  // move it into the event: its last day if that's past, else its first.
  const { start, end } = b.dataset;
  if (!st.dateTouched && start && (ui.date.value < start || ui.date.value > end)) {
    const today = new Date().toLocaleDateString('en-CA', { timeZone: TZ });
    ui.date.value = end && end < today ? end : start;
    $('f-tz').textContent = 'The day was moved into the event’s dates — change it to the day you went.';
  }
  ui.eventQ.value = '';
  $('f-event-results').innerHTML = '';
  setSubject('event');
  refresh();
});

function linkRow(l = { uri: '', title: '' }) {
  const d = document.createElement('div');
  d.className = 'bd-link';
  d.innerHTML = `<input type="url" name="uri" placeholder="https://…" value="${esc(l.uri)}" aria-label="Link address">
    <input type="text" name="title" placeholder="What it is" value="${esc(l.title)}" aria-label="Link title">
    <button type="button" class="link" aria-label="Remove this link">Remove</button>`;
  d.querySelector('button').addEventListener('click', () => { d.remove(); refresh(); });
  return d;
}
$('f-add-link').addEventListener('click', () => {
  $('f-links').append(linkRow());
  $('f-links').lastElementChild.querySelector('input').focus();
});

function renderImages() {
  const box = $('f-images');
  const old = st.editing?.value?.images || [];
  const kept = st.form.images;
  box.innerHTML = kept.map(k => {
    const im = old[k.keep];
    const cid = cidOf(im);
    return `<div class="bd-img" data-keep="${k.keep}">
      ${cid ? `<img alt="" src="${esc(blobUrl(st.me.pds, st.me.did, cid))}">` : '<div class="bd-noimg">?</div>'}
      <label><span class="sr">Description</span><textarea rows="2" maxlength="${ALT_MAX * 2}" placeholder="Describe the picture">${esc(k.alt)}</textarea></label>
      <button type="button" class="link" data-drop-keep="${k.keep}">Remove</button></div>`;
  }).join('') + st.newImages.map((n, i) => `<div class="bd-img bd-new" data-new="${i}">
      <img alt="" src="${esc(n.url)}">
      <label><span class="sr">Description</span><textarea rows="2" placeholder="Describe the picture">${esc(n.alt)}</textarea></label>
      <button type="button" class="link" data-drop-new="${i}">Remove</button></div>`).join('');
  const total = kept.length + st.newImages.length;
  show($('f-file').closest('.bd-add'), total < IMAGES_MAX);
}
$('f-images').addEventListener('click', (e) => {
  const k = e.target.closest('[data-drop-keep]');
  const n = e.target.closest('[data-drop-new]');
  if (!k && !n) return;
  st.form = readForm();
  if (k) st.form.images = st.form.images.filter(x => String(x.keep) !== k.dataset.dropKeep);
  if (n) {
    const i = Number(n.dataset.dropNew);
    st.newImages.forEach((x, j) => { x.alt = st.form.newImages[j]?.alt || ''; });
    URL.revokeObjectURL(st.newImages[i].url);
    st.newImages.splice(i, 1);
  }
  renderImages();
  refresh();
});
$('f-images').addEventListener('input', refresh);
$('f-file').addEventListener('change', (e) => {
  st.form = readForm();
  st.newImages.forEach((x, j) => { x.alt = st.form.newImages[j]?.alt || ''; });
  const room = IMAGES_MAX - st.form.images.length - st.newImages.length;
  for (const f of [...e.target.files].slice(0, room)) {
    if (!/^image\//.test(f.type)) continue;
    st.newImages.push({ file: f, url: URL.createObjectURL(f), alt: '' });
  }
  e.target.value = '';
  renderImages();
  refresh();
});

function details(item) {
  const v = item?.value || {};
  const rows = [];
  const arr = (x) => (Array.isArray(x) ? x : []);
  const refs = arr(v.refs).map(r => r?.descriptor?.label).filter(l => typeof l === 'string');
  if (refs.length) rows.push(['About', refs.join(' · ')]);
  const geo = v.geo || v.subject?.geo;
  if (geo) rows.push(['Location', `Kept at ${String(geo.precision || 'unknown')} precision`]);
  if (arr(v.media).length) rows.push(['Local media', `${v.media.length} item${v.media.length === 1 ? '' : 's'} not published from the device that made it`]);
  if (v.prev?.uri) rows.push(['Follows', 'the bead before it in that day’s chain']);
  if (v.presentation?.venueRef || v.presentation?.eventRef) rows.push(['Seen at', [v.presentation.venueRef, v.presentation.eventRef].map(r => r?.descriptor?.label).filter(l => typeof l === 'string').join(' · ') || 'recorded']);
  if (v.state === 'proposal') rows.push(['State', 'a proposal, suggested by a machine — keep or release it in Loom']);
  const p = v.provenance && typeof v.provenance === 'object' ? v.provenance : {};
  if (p.app) rows.push(['Made by', `${String(p.app)}${p.device ? ` on ${String(p.device)}` : ''}${p.mutualMint ? ', a mutual mint' : ''}`]);
  const minted = p.mintedAt ? new Date(p.mintedAt) : null;
  if (minted && !Number.isNaN(minted.getTime())) rows.push(['Minted', minted.toLocaleString('en-GB', { timeZone: TZ })]);
  if (p.timeAnchored === false && item.time) rows.push(['Time', 'a best guess — the device didn’t know the full time']);
  rows.push(['Record', `<a href="https://pdsls.dev/at/${esc(st.me.did)}/${BEAD_NSID}/${esc(item.rkey)}" rel="noopener">${esc(item.rkey)} →</a>`]);
  $('f-details').innerHTML = rows.map(([k, val]) => `<dt>${esc(k)}</dt><dd>${k === 'Record' ? val : esc(val)}</dd>`).join('');
  show($('f-geo-row'), Boolean(geo));
  $('f-geo').checked = false;
}

function refresh() {
  if (!st.form) return;
  const f = readForm();
  const n = graphemes(f.note);
  const c = $('f-note-count');
  c.textContent = n ? `${n} / ${NOTE_MAX}` : '';
  c.classList.toggle('over', n > NOTE_MAX);
  const errs = validate(f, { tz: TZ, original: st.editing?.value });
  fail($('ed-error'), errs.map(e => e[1]).filter((m, i, a) => a.indexOf(m) === i).join(' '));
  let dirty = true;
  if (st.editing) {
    dirty = applyEdit(st.editing.value, f, { tz: TZ, before: st.before }).changed || st.newImages.length > 0;
  }
  $('save').disabled = Boolean(errs.length) || !dirty;
  $('save').textContent = st.editing ? (dirty ? 'Save changes' : 'No changes') : 'Make this bead';
  saveDraft();
}
for (const el of Object.values(ui)) el.addEventListener('input', refresh);
ui.date.addEventListener('input', () => { st.dateTouched = true; });
$('f-links').addEventListener('input', refresh);
$('f-geo').addEventListener('change', refresh);

function openEditor(item) {
  st.editing = item;
  st.dateTouched = Boolean(item);
  $('f-tz').textContent = `Times are in your time zone, ${TZ.replace(/_/g, ' ')}. Leave the time empty to keep just the day.`;
  st.newImages.forEach(n => URL.revokeObjectURL(n.url));
  st.newImages = [];
  st.before = item ? formFrom(item.value, TZ) : null;
  st.form = item ? structuredClone(st.before) : { ...formFrom(null, TZ), date: new Date().toLocaleDateString('en-CA', { timeZone: TZ }) };
  restoreDraftInto(item);
  const f = st.form;
  document.querySelectorAll('#editor option[data-extra]').forEach(o => o.remove());
  if (!KINDS.some(k => k[0] === f.kind)) ui.kind.insertAdjacentHTML('beforeend', `<option data-extra value="${esc(f.kind)}">${esc(f.kind)}</option>`);
  ui.kind.value = f.kind;
  ui.date.value = f.date; ui.time.value = f.time; ui.note.value = f.note; ui.tags.value = f.tags;
  if (f.format && !FORMATS.includes(f.format)) ui.format.insertAdjacentHTML('beforeend', `<option data-extra>${esc(f.format)}</option>`);
  ui.format.value = f.format; ui.place.value = f.place; ui.eventQ.value = '';
  $('f-event-results').innerHTML = '';
  $('f-links').replaceChildren(...f.links.map(linkRow));
  $('ed-title').textContent = item
    ? `${kindLabel(item.kind)}${nameOf(item) ? ` · ${nameOf(item)}` : ''}`
    : 'A new bead';
  $('ed-sub').textContent = item ? (item.date ? longDay(item.date) + (item.time ? `, ${item.time}` : '') : '') : 'Made here, kept in your account.';
  setSubject(f.subject);
  renderImages();
  if (item) details(item); else $('f-details').innerHTML = '';
  show($('f-more'), Boolean(item));
  show($('danger'), Boolean(item));
  show($('del-confirm'), false); show($('del'));
  $('del-warn').innerHTML = '';
  fail($('ed-error'), '');
  show($('list-view'), false); show($('editor')); show($('hero'), false);
  window.scrollTo(0, 0);
  refresh();
  if (item) warnStrands(item);
}

/* ---------- drafts: kept across a sign-in round trip ---------- */
function saveDraft() {
  if (!st.form) return;
  try {
    const f = readForm();
    delete f.newImages;
    sessionStorage.setItem(DRAFT, JSON.stringify({ route: st.route, cid: st.editing?.cid || null, form: f }));
  } catch { /* storage full or blocked: drafts are a nicety */ }
}
function restoreDraftInto(item) {
  let d = null;
  try { d = JSON.parse(sessionStorage.getItem(DRAFT) || 'null'); } catch { /* ignore */ }
  const wanted = sessionStorage.getItem(`${DRAFT}:restore`) === '1';
  sessionStorage.removeItem(`${DRAFT}:restore`);
  show($('restored'), false);
  if (!wanted || !d || d.route !== st.route) return;
  if (item && d.cid !== item.cid) {
    flash('This bead changed somewhere else while you were signing in, so your unsaved edits weren’t applied. Here is the latest version.');
    return;
  }
  st.form = { ...st.form, ...d.form };
  show($('restored'));
}

/* ---------- saving ---------- */
async function shrink(file) {
  const bmp = await createImageBitmap(file, { imageOrientation: 'from-image' });
  let edge = 2000;
  for (let attempt = 0; attempt < 6; attempt++) {
    const { width, height } = fitWithin(bmp.width, bmp.height, edge);
    const c = document.createElement('canvas');
    c.width = width; c.height = height;
    const g = c.getContext('2d');
    g.fillStyle = '#ffffff';            // JPEG has no transparency: white, not black
    g.fillRect(0, 0, width, height);
    g.drawImage(bmp, 0, 0, width, height);
    for (const q of [0.88, 0.8, 0.7, 0.6]) {
      const blob = await new Promise(r => c.toBlob(r, 'image/jpeg', q));
      if (blob && blob.size <= IMAGE_BYTES_MAX) return { blob, width, height };
    }
    edge = Math.round(edge * 0.75);
  }
  throw new Error('a picture couldn’t be made small enough');
}

async function uploadNew(alts) {
  const out = [];
  for (let i = 0; i < st.newImages.length; i++) {
    $('save').textContent = `Uploading picture ${i + 1} of ${st.newImages.length}…`;
    const { blob, width, height } = await shrink(st.newImages[i].file);
    const ref = await oauth.uploadBlob(blob);
    const im = { image: ref, aspectRatio: { width, height } };
    const alt = (alts[i]?.alt || '').trim();
    if (alt) im.alt = truncate(alt, ALT_MAX);
    out.push(im);
  }
  return out;
}

async function needsSignIn(why) {
  saveDraft();
  sessionStorage.setItem(`${DRAFT}:restore`, '1');
  const s = oauth.session();
  fail($('ed-error'), why);
  $('save').disabled = true; $('save').textContent = 'Opening your sign-in…';
  await oauth.signOut();
  const err = await signIn(s?.handle || st.me.handle, sessionStorage.getItem(RETRIED) ? GENERIC : SCOPE);
  if (err) {
    sessionStorage.removeItem(`${DRAFT}:restore`);
    fail($('ed-error'), `${err}. Your changes are still here — try Save again in a moment.`);
    refresh();
  }
}

$('editor').addEventListener('submit', (e) => e.preventDefault());
$('editor').addEventListener('keydown', (e) => {
  if (e.key !== 'Enter' || e.target.tagName !== 'INPUT') return;
  e.preventDefault();
  // Enter in the event search takes the first match
  if (e.target === ui.eventQ) $('f-event-results').querySelector('button[data-uri]')?.click();
});
$('save').addEventListener('click', async () => {
  if ($('save').disabled) return;
  const f = readForm();
  if (validate(f, { tz: TZ, original: st.editing?.value }).length) return refresh();
  const s = oauth.session();
  if (!s || s.did !== st.me.did) return needsSignIn('Your sign-in has ended. Sign in again to save — your changes are kept.');
  if (!canWrite(s.scope)) return needsSignIn('This needs your permission to change beads. Sign in again to give it — your changes are kept.');
  $('save').disabled = true;
  try {
    const uploaded = await uploadNew(f.newImages);
    $('save').textContent = 'Saving…';
    if (st.editing) {
      const { record, notes } = applyEdit(st.editing.value, f, { tz: TZ, uploaded, before: st.before });
      const res = await oauth.putRecord(BEAD_NSID, st.editing.rkey, record, st.editing.cid);
      replaceItem({ uri: res.uri, cid: res.cid, value: record });
      done(['Saved.', ...notes].join(' '));
    } else {
      const record = newBead(f, { tz: TZ, uploaded });
      const res = await oauth.createRecord(BEAD_NSID, record);
      replaceItem({ uri: res.uri, cid: res.cid, value: record });
      done('Your new bead is in your account.');
    }
  } catch (err) {
    if (err?.code === 'InvalidSwap' || /swap/i.test(err?.message || '')) {
      fail($('ed-error'), 'This bead was changed somewhere else since you opened it, so nothing was saved. Reload it to see the latest, then make your change again.');
      $('save').textContent = 'Not saved';
      return;
    }
    if (/not signed in|session expired/i.test(err?.message || '')) {
      return needsSignIn('Your sign-in has ended. Sign in again to save — your changes are kept.');
    }
    if (scopeProblem(err) && !sessionStorage.getItem(RETRIED)) {
      // Try general access for this one sign-in; don't make it the default.
      sessionStorage.setItem(RETRIED, '1');
      return needsSignIn('Your server needs a broader permission for this. Sign in again — your changes are kept.');
    }
    fail($('ed-error'), `Not saved: ${err.message || err}. Nothing has changed in your account — try again.`);
    refresh();
  }
});

function replaceItem(rec) {
  const item = toItem(rec, TZ);
  const i = st.items.findIndex(x => x.rkey === item.rkey);
  if (i >= 0) st.items[i] = item; else st.items.push(item);
}

function done(msg) {
  sessionStorage.removeItem(DRAFT);
  sessionStorage.removeItem(RETRIED);
  st.newImages.forEach(n => URL.revokeObjectURL(n.url));
  st.newImages = [];
  st.form = null;
  history.pushState(null, '', location.pathname);
  route();
  flash(msg);
}

/* ---------- deleting ---------- */
async function warnStrands(item) {
  try {
    const strands = await listAll(st.me.pds, st.me.did, STRAND_NSID);
    if (st.editing !== item) return;
    const hold = strandsHolding(strands, item.uri, st.me.did);
    if (hold.length) {
      $('del-warn').innerHTML = `<p class="went-error">It’s in ${hold.length === 1 ? 'a strand' : `${hold.length} strands`} of yours:
        ${hold.map(h => `<b>${esc(h.value?.title || h.value?.day?.slice(0, 10) || rkeyOf(h.uri))}</b>`).join(', ')}.
        ${hold.length === 1 ? 'That strand' : 'Those strands'} will keep a gap where it was.</p>`;
    }
  } catch { /* the warning is a courtesy */ }
}
$('del').addEventListener('click', () => { show($('del'), false); show($('del-confirm')); $('del-no').focus(); });
$('del-no').addEventListener('click', () => { show($('del-confirm'), false); show($('del')); });
$('del-yes').addEventListener('click', async () => {
  const item = st.editing;
  const s = oauth.session();
  if (!s || s.did !== st.me.did || !canWrite(s.scope)) return needsSignIn('Sign in again to delete beads.');
  $('del-yes').disabled = true; $('del-yes').textContent = 'Deleting…';
  try {
    await oauth.deleteRecord(BEAD_NSID, item.rkey, item.cid);
    st.items = st.items.filter(x => x.rkey !== item.rkey);
    done('Deleted.');
  } catch (err) {
    fail($('ed-error'), err?.code === 'InvalidSwap'
      ? 'This bead was changed somewhere else since you opened it, so it wasn’t deleted. Reload and look again first.'
      : `Not deleted: ${err.message || err}.`);
  } finally {
    $('del-yes').disabled = false; $('del-yes').textContent = 'Yes, delete';
  }
});

/* ---------- export ---------- */
$('export').addEventListener('click', () => {
  const blob = new Blob([exportJson(st.items, { did: st.me.did, handle: st.me.handle })], { type: 'application/json' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = `beads-${st.me.handle}-${new Date().toISOString().slice(0, 10)}.json`;
  document.body.append(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
});

/* ---------- routing ---------- */
const leaving = () => !isDirty() || window.confirm('Leave without saving your changes?');

function route() {
  const h = location.hash.replace(/^#/, '');
  st.route = h;
  shownRoute = h;
  if (h === 'new') return openEditor(null);
  const m = /^b\/(.+)$/.exec(h);
  if (m) {
    const item = st.items.find(i => i.rkey === decodeURIComponent(m[1]));
    if (item) return openEditor(item);
    flash('That bead isn’t in your account any more.');
  }
  st.editing = null; st.form = null;
  show($('editor'), false); show($('list-view')); show($('hero'));
  fillKindFilter();
  renderList();
}
let shownRoute = location.hash.replace(/^#/, '');
window.addEventListener('hashchange', () => {
  const next = location.hash.replace(/^#/, '');
  if (next !== shownRoute && st.form && !$('editor').hidden && !leaving()) {
    history.replaceState(null, '', `${location.pathname}${shownRoute ? `#${shownRoute}` : ''}`);
    return;
  }
  route();
});
for (const id of ['back', 'cancel']) {
  $(id).addEventListener('click', (e) => {
    e.preventDefault();
    if (!leaving()) return;
    sessionStorage.removeItem(DRAFT);
    st.form = null;
    history.pushState(null, '', location.pathname);
    route();
  });
}
function isDirty() {
  if (!st.form || $('editor').hidden) return false;
  if (st.newImages.length) return true;
  return st.editing
    ? applyEdit(st.editing.value, readForm(), { tz: TZ, before: st.before }).changed
    : Boolean(ui.note.value.trim() || st.form.subject !== 'none' || ui.tags.value.trim());
}
window.addEventListener('beforeunload', (e) => {
  // A sign-in round trip keeps the draft, so it needn't ask.
  if (!st.signingIn && isDirty()) { e.preventDefault(); e.returnValue = ''; }
});

/* ---------- start ---------- */
async function boot() {
  let s = oauth.session();
  if (oauth.pendingCallback()) {
    say('<p>Finishing sign-in…</p>');
    try {
      s = await oauth.completeLogin();
      const back = sessionStorage.getItem('beads:route');
      if (back) history.replaceState(null, '', `${location.pathname}${back ? `#${back}` : ''}`);
    } catch (e) {
      return showSignIn(`Sign-in didn’t finish: ${e.message}`);
    }
  }
  if (!s) return showSignIn();

  say('<p>Fetching your beads…</p>');
  try {
    const who = await identify(s.did);
    st.me = { did: s.did, handle: who.handle || s.handle, pds: who.pds || s.pds };
    const [profile] = await Promise.all([profileCard(s.did), loadBeads(), loadEvents()]);
    st.me.profile = profile;
  } catch (e) {
    return showSignIn(`Your beads couldn’t be fetched: ${e.message}. Check your connection and sign in again.`);
  }
  $('me-handle').textContent = `@${st.me.handle}`;
  if (st.me.profile?.avatar) { $('me-avatar').src = st.me.profile.avatar; show($('me-avatar')); }
  say('');
  show($('signin'), false);
  show($('app'));
  route();
  resolveNames().then(() => { if ($('editor').hidden) renderList(); }).catch(() => {});
}


if ('serviceWorker' in navigator) {
  navigator.serviceWorker.register('/beads/sw.js', { scope: '/beads/' }).catch(() => {});
}

boot();
