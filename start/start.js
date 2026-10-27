/* Start — the CultureBlocs onboarding journey.
 *
 * One page, hash-routed so every step is bookmarkable and the browser's
 * back and forward buttons move between steps:
 *
 *   #welcome #idea        what CultureBlocs is
 *   #account              sign in, or pick a network and a handle
 *   #make                 the hub: choose what to make, in any order
 *   #person #venue        forms that write records to the person's own
 *   #event  #note         repository (each also works as a standalone tool)
 *   #tools                bookmarkable links to everything
 *
 * An invite (?i=…, see invite.html) personalises the welcome and suggests a
 * path. It is kept in localStorage so it survives the OAuth round trip.
 * Nothing is sent anywhere except to the person's own PDS, and to
 * OpenStreetMap's Nominatim when they press "Find on map".
 */
import * as auth from './lib/oauth.js';
import {
  NSID, NETWORKS, BEAD_KINDS, decodeInvite, suggestHandles, domainOf,
  profileRecord, workRecord, venueRecord, eventRecord, beadRecord,
  localToIso,
} from './lib/records.js';

const SCOPE = 'atproto ' + [NSID.profile, NSID.work, NSID.venue, NSID.event, NSID.bead]
  .map(n => `repo:${n}`).join(' ') + ' blob:image/*';
const SITE = 'https://www.cultureblocs.com';
const KEY = 'start:journey';
const STAGE = { welcome: 'welcome', idea: 'welcome', account: 'account', make: 'make',
  person: 'make', venue: 'make', event: 'make', note: 'make', tools: 'tools' };
const ROUTES = Object.keys(STAGE);
const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;

/* ---------- small helpers ---------- */
const $ = (s, el = document) => el.querySelector(s);
const $$ = (s, el = document) => [...el.querySelectorAll(s)];
const esc = (s) => String(s ?? '').replace(/[&<>"']/g,
  c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
const nowIso = () => new Date().toISOString();
const formData = (form) => Object.fromEntries(new FormData(form).entries());
const viewer = (uri) => `https://pdsls.dev/${uri}`;

/* ---------- journey state (this browser only) ---------- */
function load() {
  try { return JSON.parse(localStorage.getItem(KEY) || '{}'); } catch { return {}; }
}
const state = Object.assign({ invite: null, kind: '', made: [] }, load());
const save = () => {
  try { localStorage.setItem(KEY, JSON.stringify({ invite: state.invite, kind: state.kind, made: state.made })); }
  catch { /* private mode: the journey still works, it just forgets */ }
};
let account = null;     // { did, handle, pds, displayName, avatar }
let existing = {};      // { profile: {value, cid}, venue: {value, cid} }
let justMade = null;    // uri of the record to animate onto the string

/* ---------- public reads from the person's own PDS ---------- */
async function getRecord(collection, rkey) {
  const r = await fetch(`${account.pds}/xrpc/com.atproto.repo.getRecord?repo=${encodeURIComponent(account.did)}` +
    `&collection=${encodeURIComponent(collection)}&rkey=${encodeURIComponent(rkey)}`);
  if (!r.ok) return null;
  return r.json();
}

async function loadAccount() {
  const s = auth.session();
  if (!s) { account = null; existing = {}; return; }
  account = { did: s.did, handle: s.handle, pds: s.pds };
  try {
    const p = await fetch(`https://public.api.bsky.app/xrpc/app.bsky.actor.getProfile?actor=${encodeURIComponent(s.did)}`);
    if (p.ok) { const j = await p.json(); account.displayName = j.displayName || ''; account.avatar = j.avatar || ''; account.handle = j.handle || s.handle; }
  } catch { /* the avatar is a nicety */ }
  const [profile, venue] = await Promise.all([
    getRecord(NSID.profile, 'self').catch(() => null),
    getRecord(NSID.venue, 'self').catch(() => null),
  ]);
  existing = { profile, venue };
}

/* ---------- the shell: rail, who, view transitions ---------- */
function paintRail(route) {
  const order = ['welcome', 'account', 'make', 'tools'];
  const at = order.indexOf(STAGE[route]);
  $$('#rail li').forEach((li, i) => {
    li.classList.toggle('done', i < at);
    li.classList.toggle('here', i === at);
    li.querySelector('a').toggleAttribute('aria-current', i === at);
  });
  $('#rail').style.setProperty('--p', String(at / (order.length - 1)));
}

function paintWho() {
  const el = $('#who');
  if (!account) { el.hidden = true; return; }
  el.hidden = false;
  el.innerHTML = `${account.avatar ? `<img src="${esc(account.avatar)}" alt="">` : '<span class="dot"></span>'}
    <span>Signed in as <b>@${esc(account.handle)}</b></span>
    <button type="button" class="linkish" id="signout">Sign out</button>`;
  $('#signout').onclick = async () => { await auth.signOut(); account = null; existing = {}; paintWho(); go('account'); };
}

function show(route) {
  const view = $('#view');
  let drawn = false;
  const draw = () => {
    if (drawn) return;
    drawn = true;
    view.innerHTML = (PAGES[route] || PAGES.welcome)();
    view.dataset.route = route;
    paintRail(route);
    (BIND[route] || (() => {}))(view);
    document.title = `${TITLES[route] || 'Start'} — CultureBlocs`;
  };
  if (document.startViewTransition && !reduced) {
    const t = document.startViewTransition(draw);
    t.ready.catch(() => {}); t.finished.catch(() => {});
    // A page that isn't being painted never gets the frame the transition
    // waits for; draw anyway rather than leave the step blank.
    setTimeout(() => { if (!drawn) { t.skipTransition(); draw(); } }, 250);
  } else draw();
  window.scrollTo({ top: 0, behavior: reduced ? 'auto' : 'smooth' });
  $('#main').focus({ preventScroll: true });
}

const current = () => {
  const r = location.hash.replace(/^#\/?/, '');
  return ROUTES.includes(r) ? r : '';
};
function go(route) {
  if (location.hash === `#${route}`) show(route);
  else location.hash = route;
}
addEventListener('hashchange', () => show(current() || 'welcome'));

const TITLES = { welcome: 'Welcome', idea: 'How it works', account: 'Your account', make: 'Make something',
  person: 'Creative profile', venue: 'Venue or organisation', event: 'Event', note: 'Quick note', tools: 'Your tools' };

/* ---------- reusable bits of page ---------- */
const nav = (back, next, nextLabel = 'Next') => `<div class="nav-row">
  ${back ? `<a class="btn ghost" href="#${back}">Back</a>` : '<span></span>'}
  ${next ? `<a class="btn" href="#${next}">${esc(nextLabel)}</a>` : ''}</div>`;

const signIn = (returnTo, lead = 'Sign in with your handle') => `
  <form class="signin card" data-return="${esc(returnTo)}">
    <label for="handle">${esc(lead)}</label>
    <div class="row">
      <input id="handle" name="handle" autocomplete="username" autocapitalize="none" spellcheck="false"
        placeholder="yourname.bsky.social" required>
      <button class="btn" type="submit">Sign in</button>
    </div>
    <p class="hint">Your network's own page opens to approve access. CultureBlocs never sees your password.</p>
    <p class="err" role="alert" hidden></p>
  </form>`;

function bindSignIn(view) {
  for (const form of $$('form.signin', view)) {
    form.onsubmit = async (e) => {
      e.preventDefault();
      const err = $('.err', form);
      const btn = $('button', form);
      err.hidden = true;
      btn.disabled = true; btn.textContent = 'Opening…';
      try {
        sessionStorage.setItem('start:return', form.dataset.return || 'make');
        await auth.startLogin(form.handle.value, SCOPE);
      } catch (x) {
        err.textContent = x.message || String(x);
        err.hidden = false;
        btn.disabled = false; btn.textContent = 'Sign in';
      }
    };
  }
}

/* A form page needs an account; without one it shows the sign-in card.
 * body is a function so the form is only built when there is an account. */
const needAccount = (route, body) => account ? body() : `
  <p class="lede">To save this to your account, sign in first.</p>
  ${signIn(route)}
  <p class="hint">No account yet? <a href="#account">Set one up</a>.</p>`;

const preview = () => `<details class="preview"><summary>See the record</summary>
  <p class="hint">This is exactly what will be published. Every field is public.</p>
  <pre><code></code></pre></details>`;

function livePreview(form, build) {
  const code = $('.preview code', form.closest('.view') || document);
  const update = () => {
    try { code.textContent = JSON.stringify(build(), null, 2); }
    catch { code.textContent = ''; }
  };
  form.addEventListener('input', update);
  form.addEventListener('change', update);
  update();
  return update;
}

function setBusy(form, busy, label) {
  const btn = $('button[type=submit]', form);
  btn.disabled = busy;
  if (label) btn.textContent = label;
}

function formError(form, x) {
  const el = $('.err', form);
  let msg = x?.message || String(x);
  if (x?.code === 'InvalidSwap') msg = 'This record was changed somewhere else since you opened it. Reload the page to get the latest version.';
  if (/scope|forbidden|insufficient/i.test(msg)) msg += ' — try signing out and in again.';
  el.textContent = msg;
  el.hidden = false;
}

function remember(kind, uri, label) {
  state.made = state.made.filter(m => m.uri !== uri);
  state.made.push({ kind, uri, label, at: nowIso() });
  justMade = uri;
  save();
}

const done = (title, uri, extra = '') => `
  <div class="done-card" role="status">
    <svg class="tick" viewBox="0 0 52 52" aria-hidden="true"><circle cx="26" cy="26" r="24"/><path d="M15 27l7 7 15-16"/></svg>
    <div><h3>${esc(title)}</h3>
    <p>Saved to your account. <a href="${esc(viewer(uri))}" target="_blank" rel="noopener">View the raw record</a>${extra}</p></div>
  </div>`;

/* ---------- places: geocoding and a small map ---------- */
async function geocode(q, { city = false } = {}) {
  const url = 'https://nominatim.openstreetmap.org/search?format=jsonv2&limit=1&addressdetails=0' +
    `&q=${encodeURIComponent(q)}` + (city ? '&featureType=settlement' : '');
  const r = await fetch(url, { headers: { 'Accept-Language': navigator.language || 'en' } });
  if (!r.ok) throw new Error('The map search is busy. Try again in a moment, or type the coordinates.');
  const [hit] = await r.json();
  if (!hit) throw new Error('No match. Check the address, or add the postcode.');
  return { lat: Number(hit.lat), lng: Number(hit.lon), label: hit.display_name };
}

/* Three by three OpenStreetMap tiles, clipped to a window centred on the
 * point, with a pin that drops in. */
function mapHtml(lat, lng, zoom = 16) {
  const W = 360, H = 200, n = 2 ** zoom;
  const px = (lng + 180) / 360 * n * 256;
  const r = lat * Math.PI / 180;
  const py = (1 - Math.log(Math.tan(r) + 1 / Math.cos(r)) / Math.PI) / 2 * n * 256;
  const x0 = Math.floor((px - W / 2) / 256), x1 = Math.floor((px + W / 2) / 256);
  const y0 = Math.floor((py - H / 2) / 256), y1 = Math.floor((py + H / 2) / 256);
  let tiles = '';
  for (let x = x0; x <= x1; x++) for (let y = y0; y <= y1; y++) {
    tiles += `<img src="https://tile.openstreetmap.org/${zoom}/${((x % n) + n) % n}/${y}.png" alt=""
      style="left:${Math.round(x * 256 - (px - W / 2))}px;top:${Math.round(y * 256 - (py - H / 2))}px">`;
  }
  return `<div class="map" style="width:${W}px;height:${H}px" role="img" aria-label="Map of the location">${tiles}
    <span class="pin"></span><span class="osm">© OpenStreetMap contributors</span></div>`;
}

function bindFind(form, { city = false, query, after }) {
  const btn = $('.find', form);
  if (!btn) return;
  const out = $('.found', form);
  const paint = () => {
    const lat = Number(form.lat?.value), lng = Number(form.lng?.value);
    out.innerHTML = (form.lat?.value && form.lng?.value && Number.isFinite(lat) && Number.isFinite(lng))
      ? mapHtml(lat, lng, city ? 11 : 16) : '';
  };
  btn.onclick = async () => {
    const q = query();
    if (!q.trim()) { out.innerHTML = '<p class="err">Fill in the address first.</p>'; return; }
    btn.disabled = true; btn.textContent = 'Looking…';
    try {
      const hit = await geocode(q, { city });
      form.lat.value = hit.lat.toFixed(6);
      form.lng.value = hit.lng.toFixed(6);
      paint();
      out.insertAdjacentHTML('beforeend', `<p class="hint">Found: ${esc(hit.label)}. If the pin is wrong, edit the coordinates.</p>`);
      form.dispatchEvent(new Event('input'));
      after?.();
    } catch (x) {
      out.innerHTML = `<p class="err">${esc(x.message)}</p>`;
    } finally {
      btn.disabled = false; btn.textContent = 'Find on map';
    }
  };
  form.lat?.addEventListener('change', paint);
  form.lng?.addEventListener('change', paint);
  paint();
}

/* ---------- images: shrink to fit the 2 MB blob limit ---------- */
async function prepareImage(file) {
  const bmp = await createImageBitmap(file);
  const aspectRatio = { width: bmp.width, height: bmp.height };
  if (file.size <= 1_900_000 && /^image\/(jpeg|png|webp|gif)$/.test(file.type)) return { blob: file, aspectRatio };
  const scale = Math.min(1, 2000 / Math.max(bmp.width, bmp.height));
  const c = document.createElement('canvas');
  c.width = Math.round(bmp.width * scale); c.height = Math.round(bmp.height * scale);
  c.getContext('2d').drawImage(bmp, 0, 0, c.width, c.height);
  let q = 0.86, blob;
  do { blob = await new Promise(r => c.toBlob(r, 'image/jpeg', q)); q -= 0.12; } while (blob.size > 1_900_000 && q > 0.3);
  return { blob, aspectRatio: { width: c.width, height: c.height } };
}

/* ===================================================== pages */
const PAGES = {};
const BIND = {};

/* ---------- welcome ---------- */
PAGES.welcome = () => {
  const inv = state.invite;
  return `
  <section class="hero step-in">
    <h1>${inv?.name ? `Hello, ${esc(inv.name)}.` : 'Welcome to CultureBlocs.'}</h1>
    <svg class="thread" viewBox="0 0 600 24" aria-hidden="true" preserveAspectRatio="none">
      <path d="M0 12 C 80 2, 160 22, 240 12 S 400 2, 480 12 S 560 20, 600 12"/>
      <circle cx="120" cy="10" r="6" class="b1"/><circle cx="300" cy="11" r="6" class="b2"/><circle cx="470" cy="12" r="6" class="b3"/>
    </svg>
    ${inv?.message ? `<blockquote class="invite-note"><p>${esc(inv.message)}</p>${inv.from ? `<cite>${esc(inv.from)}</cite>` : ''}</blockquote>` : ''}
    <p class="lede">CultureBlocs is an open, shared record of cultural activity: artists and
    their work, venues, events, and the people who go to them.</p>
    <p>Each record is kept in the account of the person or organisation who made it. The records are public
    and use shared formats, so any app can read them. A venue's events, an artist's work and an audience's
    notes connect, and no single company owns the data.</p>
    <h2 class="sec">In about ten minutes you will</h2>
    <ol class="plan">
      <li><span>1</span>Sign in with a Bluesky, Blacksky or Eurosky account, or create one.</li>
      <li><span>2</span>Publish your first records: a profile, a venue, an event or a note.</li>
      <li><span>3</span>Get a set of web tools you can keep using.</li>
    </ol>
  </section>
  ${nav(null, 'idea', 'Start')}`;
};

/* ---------- how it works ---------- */
PAGES.idea = () => `
  <section class="step-in">
    <h1 class="h">How it works</h1>
    <figure class="flow" aria-hidden="true">
      <svg viewBox="0 0 640 150">
        <path class="wire" d="M120 75 H 270"/><path class="wire" d="M370 75 H 520"/>
        <circle class="pulse p1" r="5" cx="120" cy="75"/><circle class="pulse p2" r="5" cx="370" cy="75"/>
        <g class="node n1"><rect x="20" y="35" width="100" height="80" rx="14"/><text x="70" y="80">Your account</text></g>
        <g class="node n2"><rect x="270" y="35" width="100" height="80" rx="14"/><text x="320" y="80">Records</text></g>
        <g class="node n3"><rect x="520" y="35" width="100" height="80" rx="14"/><text x="570" y="80">Apps</text></g>
      </svg>
    </figure>
    <div class="three">
      <div><h2>You have an account</h2><p>A Bluesky, Blacksky or Eurosky account is also a personal data store.
        CultureBlocs records are kept in it alongside your posts. They do not show up as posts.</p></div>
      <div><h2>You publish records</h2><p>A creative profile, a work, a venue, an event, or a note about something you
        saw. Each one is small. You can edit or delete it later.</p></div>
      <div><h2>Apps read them</h2><p>Catalogues, event listings, maps and calendars read the same records. If an app
        closes, your records stay in your account.</p></div>
    </div>
    <p class="note">Records are public. Only add what you would put on a website.</p>
  </section>
  ${nav('welcome', 'account', 'Next: your account')}`;

/* ---------- account ---------- */
PAGES.account = () => {
  if (account) {
    return `<section class="step-in">
      <h1 class="h">You're signed in</h1>
      <div class="card signed">
        ${account.avatar ? `<img class="avatar" src="${esc(account.avatar)}" alt="">` : '<span class="avatar dot"></span>'}
        <div><b>${esc(account.displayName || account.handle)}</b><br><span class="faint">@${esc(account.handle)}</span></div>
      </div>
      <p>Records you make next will be saved to this account. To use a different one, sign out at the top of the page.</p>
    </section>${nav('idea', 'make', 'Next: make something')}`;
  }
  const kind = state.kind || ({ venue: 'venue', event: 'venue' })[state.invite?.path] || 'person';
  return `<section class="step-in">
    <h1 class="h">Your account</h1>
    <p class="lede">CultureBlocs uses the same accounts as Bluesky and the other networks built on the
    AT Protocol. One account works everywhere.</p>
    <div class="choice" role="tablist">
      <button type="button" role="tab" class="opt" data-pick="have" aria-selected="true">I have an account</button>
      <button type="button" role="tab" class="opt" data-pick="need" aria-selected="false">I need one</button>
    </div>

    <div data-panel="have">
      ${signIn('make')}
      <p class="hint">Your handle looks like <code>name.bsky.social</code>, <code>name.blacksky.app</code>,
      <code>name.eurosky.social</code>, or a domain such as <code>yourgallery.com</code>.</p>
    </div>

    <div data-panel="need" hidden>
      <h2 class="sec">1. Choose a handle</h2>
      <p>Your handle is your public name on the network. Tell us a little and we'll suggest some.</p>
      <form class="card suggest" autocomplete="off">
        <fieldset class="kinds"><legend>This account is for</legend>
          ${[['person', 'Me, as an artist or person'], ['venue', 'A venue or gallery'], ['org', 'An organisation']].map(([v, l]) =>
            `<label><input type="radio" name="kind" value="${v}" ${kind === v ? 'checked' : ''}> ${l}</label>`).join('')}
        </fieldset>
        <label>Name <input name="name" value="${esc(state.invite?.name || '')}" placeholder="Ada Lovelace, The Ivy House"></label>
        <label>Website <span class="faint">(optional)</span> <input name="domain" placeholder="ivyhouse.london" inputmode="url"></label>
      </form>
      <ul class="handles" id="handles"></ul>

      <h2 class="sec">2. Sign up with a network</h2>
      <p>All three work with CultureBlocs. Pick the one that suits you; you can move your account later.</p>
      <div class="networks">
        ${NETWORKS.map(n => `<article class="net" data-net="${n.id}">
          <h3>${esc(n.name)}</h3><p>${esc(n.about)}</p>
          <p class="sugg">Suggested handle: <code data-for="${n.id}">name.${esc(n.suffix)}</code></p>
          <a class="btn" href="${esc(n.signup)}" target="_blank" rel="noopener">Sign up on ${esc(n.name)}</a>
        </article>`).join('')}
      </div>

      <details class="domain" ${kind !== 'person' ? 'open' : ''}>
        <summary>Using your website domain as your handle</summary>
        <p>Venues, galleries and organisations should use their domain, for example <code>ivyhouse.london</code>.
        It shows people the account is really yours, and it stays the same if you change network.</p>
        <ol>
          <li>Sign up with a network handle first, for example <code>ivy-house.bsky.social</code>.</li>
          <li>In the Bluesky app (it works with Blacksky and Eurosky accounts too) go to
            <b>Settings → Account → Handle</b> and choose <b>I have my own domain</b>.</li>
          <li>Enter your domain. The app shows a DNS record: name <code>_atproto</code>, type TXT,
            value starting <code>did=did:plc:</code>.</li>
          <li>Add that record where you manage your domain (your registrar or web host), then press <b>Verify</b>.</li>
        </ol>
        <p class="hint">DNS changes can take a few minutes to an hour. You can carry on with the network handle and switch later.
        Records you have already made stay with the account.</p>
      </details>

      <h2 class="sec">3. Come back and sign in</h2>
      ${signIn('make', 'Signed up? Enter your new handle')}
    </div>
  </section>
  ${nav('idea', null)}`;
};

BIND.account = (view) => {
  bindSignIn(view);
  const tabs = $$('[data-pick]', view);
  const pick = (which) => {
    tabs.forEach(t => t.setAttribute('aria-selected', String(t.dataset.pick === which)));
    $$('[data-panel]', view).forEach(p => { p.hidden = p.dataset.panel !== which; });
  };
  tabs.forEach(t => { t.onclick = () => pick(t.dataset.pick); });
  if (sessionStorage.getItem('start:need') === '1') pick('need');

  const form = $('form.suggest', view);
  if (!form) return;
  const paint = () => {
    const f = formData(form);
    state.kind = f.kind; save();
    sessionStorage.setItem('start:need', '1');
    const list = suggestHandles(f);
    $('#handles').innerHTML = list.length ? list.map((s, i) => `
      <li style="--i:${i}"><code>${esc(s.handle)}</code><span>${esc(s.why)}</span>
      <button type="button" class="linkish" data-copy="${esc(s.handle)}">Copy</button></li>`).join('')
      : '<li class="faint">Type a name to see suggestions.</li>';
    for (const n of NETWORKS) {
      const s = list.find(x => x.network === n.id);
      $(`[data-for="${n.id}"]`).textContent = s ? s.handle : `name.${n.suffix}`;
    }
    $('details.domain').open = Boolean(domainOf(f.domain)) || f.kind !== 'person';
  };
  form.addEventListener('input', paint);
  $('#handles').addEventListener('click', async (e) => {
    const b = e.target.closest('[data-copy]');
    if (!b) return;
    try { await navigator.clipboard.writeText(b.dataset.copy); b.textContent = 'Copied'; }
    catch { b.textContent = 'Select and copy'; }
    setTimeout(() => { b.textContent = 'Copy'; }, 1600);
  });
  paint();
  sessionStorage.removeItem('start:need');
};

/* ---------- the hub ---------- */
const CARDS = [
  { route: 'person', kinds: ['person', 'work'], title: 'A creative profile',
    text: 'Your name, what you do and where you are based. Then add a work or two.' },
  { route: 'venue', kinds: ['venue'], title: 'A venue, gallery or organisation',
    text: 'Name, address and map location, so events and visits can point at it.' },
  { route: 'event', kinds: ['event'], title: 'An event',
    text: 'An exhibition, gig, screening or talk, in the shared calendar format.' },
  { route: 'note', kinds: ['note'], title: 'A quick note',
    text: 'Something you saw, heard or read. "I went to see the new Spielberg."' },
];
const KIND_LABEL = { person: 'Profile', work: 'Work', venue: 'Venue', event: 'Event', note: 'Note' };

const stringOf = () => {
  if (!state.made.length) return '<p class="faint empty-string">Your records will appear here as you make them.</p>';
  return `<ol class="made-string">${state.made.map(m => `
    <li class="k-${m.kind}${m.uri === justMade ? ' new' : ''}">
      <a href="${esc(viewer(m.uri))}" target="_blank" rel="noopener" title="${esc(m.label)}">
        <span class="bead"></span><span class="lbl">${esc(KIND_LABEL[m.kind] || m.kind)}</span></a></li>`).join('')}</ol>`;
};

PAGES.make = () => {
  const suggested = { person: 'person', venue: 'venue', event: 'event', note: 'note' }[state.invite?.path];
  return `<section class="step-in">
    <h1 class="h">What would you like to add?</h1>
    <p class="lede">Do these in any order. Come back here between them; you can make as many as you like.</p>
    ${account ? '' : `<p class="note">You're not signed in yet. <a href="#account">Set up your account</a> first, or pick one to see what it involves.</p>`}
    <div class="cards">
      ${CARDS.map((c, i) => {
        const n = state.made.filter(m => c.kinds.includes(m.kind)).length;
        return `<a class="pick${c.route === suggested ? ' suggested' : ''}" href="#${c.route}" style="--i:${i}">
          ${c.route === suggested ? '<span class="tag">Suggested for you</span>' : ''}
          <span class="ico ico-${c.route}" aria-hidden="true"></span>
          <h2>${esc(c.title)}</h2><p>${esc(c.text)}</p>
          ${n ? `<span class="count">${n} made</span>` : ''}</a>`;
      }).join('')}
    </div>
    <h2 class="sec">Made so far</h2>
    ${stringOf()}
  </section>
  ${nav('account', 'tools', state.made.length ? "I'm done: show my tools" : 'Skip to your tools')}`;
};
BIND.make = () => { justMade = null; };

/* ---------- creative profile + works ---------- */
PAGES.person = () => {
  const p = existing.profile?.value || {};
  const based = p.based || {};
  return `<section class="step-in">
    <p class="crumb"><a href="#make">← All options</a></p>
    <h1 class="h">Creative profile</h1>
    ${needAccount('person', () => `
    <p class="lede">The basics: who you are and what you do. ${p.name ? 'You already have a profile; changes here update it.' : ''}</p>
    <form id="f-person" class="form card" novalidate>
      <label>Name to be credited under <input name="name" required value="${esc(p.name || account.displayName || '')}"></label>
      <label>About you <textarea name="bio" rows="3" placeholder="Two or three sentences.">${esc(p.bio || '')}</textarea></label>
      <label>What you do <span class="faint">(separate with commas)</span>
        <input name="disciplines" value="${esc((p.disciplines || []).join(', '))}" placeholder="painting, printmaking, sound"></label>
      <div class="pair">
        <label>Where you are based <span class="faint">(a town is enough)</span>
          <input name="based" value="${esc(based.name || '')}" placeholder="Margate"></label>
        <button type="button" class="btn ghost find">Find on map</button>
      </div>
      <input type="hidden" name="lat" value="${esc(based.geo?.lat ?? '')}"><input type="hidden" name="lng" value="${esc(based.geo?.lng ?? '')}">
      <div class="found"></div>
      <p class="hint">Only the town is published, rounded to about 10 km.</p>
      <label>Links <span class="faint">(website, portfolio, socials; one per line)</span>
        <textarea name="links" rows="2">${esc((p.links || []).map(l => l.uri).join('\n'))}</textarea></label>
      <p class="err" role="alert" hidden></p>
      <button class="btn" type="submit">${p.name ? 'Update profile' : 'Save profile'}</button>
    </form>
    <div id="person-done"></div>

    <section id="works" ${p.name ? '' : 'hidden'}>
      <h2 class="sec">Add a work</h2>
      <p>A piece you made: an artwork, a record, a performance, a book. A title is enough; the rest is optional.</p>
      <form id="f-work" class="form card" novalidate>
        <label>Title <input name="title" required></label>
        <label>When <span class="faint">(e.g. 2024, Spring 2019, ongoing)</span> <input name="completionDate"></label>
        <label>Description <textarea name="description" rows="2"></textarea></label>
        <label>Where it lives online <input name="referenceUrl" inputmode="url" placeholder="https://"></label>
        <label>Tags <span class="faint">(commas)</span> <input name="tags" placeholder="sculpture, bronze"></label>
        <label>Image <span class="faint">(optional)</span> <input type="file" name="image" accept="image/*"></label>
        <label class="alt" hidden>Describe the image for people who can't see it <textarea name="alt" rows="2"></textarea></label>
        <p class="err" role="alert" hidden></p>
        <button class="btn" type="submit">Add work</button>
      </form>
      <ul class="works-made"></ul>
      <p class="hint">For more images, dimensions and editing works later, use <a href="/easel/">Easel</a>.</p>
    </section>
    ${preview()}`)}
  </section>
  ${nav('make', 'make', 'Back to options')}`;
};

BIND.person = (view) => {
  bindSignIn(view);
  const form = $('#f-person', view);
  if (!form) return;
  const build = () => profileRecord({ ...formData(form), basedLat: form.lat.value, basedLng: form.lng.value },
    { createdAt: existing.profile?.value?.createdAt, now: nowIso() });
  livePreview(form, build);
  bindFind(form, { city: true, query: () => form.based.value });
  form.based.addEventListener('change', () => { form.lat.value = ''; form.lng.value = ''; $('.found', form).innerHTML = ''; });
  form.onsubmit = async (e) => {
    e.preventDefault();
    if (!form.name.value.trim()) { formError(form, new Error('Add a name.')); return; }
    $('.err', form).hidden = true;
    setBusy(form, true, 'Saving…');
    try {
      const rec = build();
      const res = await auth.putRecord(NSID.profile, 'self', rec, existing.profile?.cid);
      existing.profile = { uri: res.uri, cid: res.cid, value: rec };
      remember('person', res.uri, rec.name);
      $('#person-done').innerHTML = done('Profile saved', res.uri,
        ` · <a href="/catalogue/?actor=${encodeURIComponent(account.handle)}" target="_blank" rel="noopener">See your catalogue</a>`);
      $('#works').hidden = false;
      setBusy(form, false, 'Update profile');
    } catch (x) { formError(form, x); setBusy(form, false, 'Save profile'); }
  };

  const wf = $('#f-work', view);
  wf.image.onchange = () => { $('.alt', wf).hidden = !wf.image.files.length; };
  const madeWorks = () => {
    $('.works-made', view).innerHTML = state.made.filter(m => m.kind === 'work').map(m =>
      `<li><a href="${esc(viewer(m.uri))}" target="_blank" rel="noopener">${esc(m.label)}</a></li>`).join('');
  };
  madeWorks();
  wf.onsubmit = async (e) => {
    e.preventDefault();
    if (!wf.title.value.trim()) { formError(wf, new Error('Add a title.')); return; }
    $('.err', wf).hidden = true;
    setBusy(wf, true, 'Saving…');
    try {
      let image;
      const file = wf.image.files[0];
      if (file) {
        setBusy(wf, true, 'Uploading image…');
        const { blob, aspectRatio } = await prepareImage(file);
        image = { image: await auth.uploadBlob(blob), alt: wf.alt.value.trim(), aspectRatio };
      }
      const rec = workRecord(formData(wf), { now: nowIso(), image });
      const res = await auth.createRecord(NSID.work, rec);
      remember('work', res.uri, rec.title);
      wf.reset(); $('.alt', wf).hidden = true;
      madeWorks();
      $('.works-made li:last-child', view)?.classList.add('new');
    } catch (x) { formError(wf, x); }
    setBusy(wf, false, 'Add another work');
  };
};

/* ---------- venue, gallery or organisation ---------- */
PAGES.venue = () => {
  const v = existing.venue?.value || {};
  const a = v.location?.$type === 'community.lexicon.location.address' ? v.location : {};
  const g = v.place?.geo || {};
  const kind = (v.tags || []).includes('organisation') ? 'org' : (v.tags || []).includes('gallery') ? 'gallery' : 'venue';
  return `<section class="step-in">
    <p class="crumb"><a href="#make">← All options</a></p>
    <h1 class="h">Venue, gallery or organisation</h1>
    ${needAccount('venue', () => `
    <p class="lede">Publish where you are so that events, visits and maps can point at you.
    ${v.name ? 'You already have one; changes here update it.' : ''}</p>
    <p class="note">Use the account that belongs to the venue or organisation, not a personal one.
    ${account.handle.includes('.bsky.social') || account.handle.includes('.blacksky.app') || account.handle.includes('.eurosky.social')
      ? 'You can <a href="#account">use your website domain as the handle</a> later.' : ''}</p>
    <form id="f-venue" class="form card" novalidate>
      <fieldset class="kinds"><legend>This is</legend>
        <label><input type="radio" name="kind" value="venue" ${kind === 'venue' ? 'checked' : ''}> A venue</label>
        <label><input type="radio" name="kind" value="gallery" ${kind === 'gallery' ? 'checked' : ''}> A gallery</label>
        <label><input type="radio" name="kind" value="org" ${kind === 'org' ? 'checked' : ''}> An organisation without a public space</label>
      </fieldset>
      <label>Name <input name="name" required value="${esc(v.name || account.displayName || '')}"></label>
      <label>Description <textarea name="description" rows="3">${esc(v.description || '')}</textarea></label>

      <h3 class="sub">Location</h3>
      <p class="hint only-space">A public space publishes its full address and exact map position.</p>
      <p class="hint only-org" hidden>Without a public space, only your town is published.</p>
      <label class="only-space">Street <input name="street" autocomplete="address-line1" value="${esc(a.street || '')}"></label>
      <div class="grid2">
        <label>Town or city <input name="locality" autocomplete="address-level2" value="${esc(a.locality || '')}"></label>
        <label class="only-space">Postcode <input name="postalCode" autocomplete="postal-code" value="${esc(a.postalCode || '')}"></label>
        <label>Region <span class="faint">(optional)</span> <input name="region" value="${esc(a.region || '')}"></label>
        <label>Country code <input name="country" maxlength="2" value="${esc(a.country || 'GB')}" placeholder="GB"></label>
      </div>
      <div class="pair">
        <span class="hint">Then find it on the map to add coordinates.</span>
        <button type="button" class="btn ghost find">Find on map</button>
      </div>
      <div class="grid2 coords">
        <label>Latitude <input name="lat" inputmode="decimal" value="${esc(g.lat ?? '')}"></label>
        <label>Longitude <input name="lng" inputmode="decimal" value="${esc(g.lng ?? '')}"></label>
      </div>
      <div class="found"></div>

      <div class="only-space">
        <label>Capacity <span class="faint">(approximate, optional)</span> <input name="capacity" inputmode="numeric" value="${esc(v.capacity ?? '')}"></label>
        <label>Access <span class="faint">(step-free entry, hearing loop, quiet room…)</span>
          <textarea name="accessibility" rows="2">${esc(v.accessibility || '')}</textarea></label>
      </div>
      <label>Links <span class="faint">(website, socials, ticketing; one per line)</span>
        <textarea name="links" rows="2">${esc((v.links || []).map(l => l.uri).join('\n'))}</textarea></label>
      <details class="explain"><summary>How location is published</summary>
        <p>The address goes in the shared <code>community.lexicon.location.address</code> format that calendar and
        event apps on the network already read. The coordinates go in <code>place.geo</code> with a stated
        precision: <code>exact</code> for a public space, <code>city</code> otherwise. Events you publish next
        copy both, so nobody retypes the address.</p></details>
      <p class="err" role="alert" hidden></p>
      <button class="btn" type="submit">${v.name ? 'Update' : 'Publish'}</button>
    </form>
    <div id="venue-done"></div>
    ${preview()}`)}
  </section>
  ${nav('make', 'make', 'Back to options')}`;
};

BIND.venue = (view) => {
  bindSignIn(view);
  const form = $('#f-venue', view);
  if (!form) return;
  const build = () => venueRecord(formData(form), { createdAt: existing.venue?.value?.createdAt, now: nowIso() });
  const sync = () => {
    const org = form.kind.value === 'org';
    $$('.only-space', form).forEach(el => { el.hidden = org; });
    $$('.only-org', form).forEach(el => { el.hidden = !org; });
  };
  form.addEventListener('change', sync); sync();
  livePreview(form, build);
  bindFind(form, {
    city: false,
    query: () => {
      const f = formData(form);
      return [f.kind === 'org' ? '' : f.street, f.locality, f.kind === 'org' ? '' : f.postalCode, f.region, f.country]
        .filter(Boolean).join(', ');
    },
  });
  form.onsubmit = async (e) => {
    e.preventDefault();
    if (!form.name.value.trim()) { formError(form, new Error('Add a name.')); return; }
    $('.err', form).hidden = true;
    setBusy(form, true, 'Publishing…');
    try {
      const rec = build();
      const res = await auth.putRecord(NSID.venue, 'self', rec, existing.venue?.cid);
      existing.venue = { uri: res.uri, cid: res.cid, value: rec };
      remember('venue', res.uri, rec.name);
      $('#venue-done').innerHTML = done('Published', res.uri, ' · <a href="#event">Add an event here →</a>');
      setBusy(form, false, 'Update');
    } catch (x) { formError(form, x); setBusy(form, false, 'Publish'); }
  };
};

/* ---------- event ---------- */
PAGES.event = () => {
  const v = existing.venue?.value;
  return `<section class="step-in">
    <p class="crumb"><a href="#make">← All options</a></p>
    <h1 class="h">An event</h1>
    ${needAccount('event', () => `
    <p class="lede">Published in the shared calendar format (<code>community.lexicon.calendar.event</code>), so
    other event and calendar apps on the network can list it too.</p>
    <form id="f-event" class="form card" novalidate>
      <label>Event name <input name="name" required placeholder="Late opening: new work by …"></label>
      <label>Description <textarea name="description" rows="3"></textarea></label>
      <div class="grid2">
        <label>Starts <input type="datetime-local" name="start" required></label>
        <label>Ends <span class="faint">(optional)</span> <input type="datetime-local" name="end"></label>
      </div>
      <fieldset class="kinds"><legend>Where</legend>
        <label><input type="radio" name="mode" value="inperson" checked> In person</label>
        <label><input type="radio" name="mode" value="virtual"> Online</label>
        <label><input type="radio" name="mode" value="hybrid"> Both</label>
      </fieldset>
      <div class="place">
        ${v ? `<label class="check"><input type="checkbox" name="atVenue" checked> At ${esc(v.name)}</label>` : ''}
        <div class="elsewhere" ${v ? 'hidden' : ''}>
          <label>Venue name <input name="venueName"></label>
          <label>Street <input name="street"></label>
          <div class="grid2">
            <label>Town or city <input name="locality"></label>
            <label>Postcode <input name="postalCode"></label>
            <label>Country code <input name="country" maxlength="2" value="GB"></label>
          </div>
          <div class="pair"><span class="hint">Add the map position.</span><button type="button" class="btn ghost find">Find on map</button></div>
          <input type="hidden" name="lat"><input type="hidden" name="lng">
          <div class="found"></div>
        </div>
      </div>
      <label>Links <span class="faint">(event page, tickets, or the online link; one per line)</span>
        <textarea name="links" rows="2"></textarea></label>
      <p class="err" role="alert" hidden></p>
      <button class="btn" type="submit">Publish event</button>
    </form>
    <div id="event-done"></div>
    ${preview()}`)}
  </section>
  ${nav('make', 'make', 'Back to options')}`;
};

BIND.event = (view) => {
  bindSignIn(view);
  const form = $('#f-event', view);
  if (!form) return;
  const v = existing.venue?.value;
  const fields = () => {
    const f = formData(form);
    if (v && form.atVenue?.checked) {
      const a = v.location || {};
      Object.assign(f, { venueName: v.name, street: a.street, locality: a.locality, region: a.region,
        postalCode: a.postalCode, country: a.country, lat: v.place?.geo?.lat, lng: v.place?.geo?.lng });
    }
    return f;
  };
  const build = () => {
    const f = fields();
    const off = new Date(f.start || Date.now()).getTimezoneOffset();
    return eventRecord(f, { now: nowIso(), startsAt: localToIso(f.start, off),
      endsAt: localToIso(f.end, new Date(f.end || Date.now()).getTimezoneOffset()) });
  };
  const sync = () => {
    const online = form.mode.value === 'virtual';
    $('.place', form).hidden = online;
    const el = $('.elsewhere', form);
    if (el) el.hidden = Boolean(v && form.atVenue?.checked);
  };
  form.addEventListener('change', sync); sync();
  livePreview(form, build);
  bindFind(form, { query: () => [form.street.value, form.locality.value, form.postalCode.value, form.country.value].filter(Boolean).join(', ') });
  form.onsubmit = async (e) => {
    e.preventDefault();
    const f = fields();
    if (!f.name?.trim() || !f.start) { formError(form, new Error('Add a name and a start time.')); return; }
    if (f.end && f.end < f.start) { formError(form, new Error('The end is before the start.')); return; }
    $('.err', form).hidden = true;
    setBusy(form, true, 'Publishing…');
    try {
      const rec = build();
      const res = await auth.createRecord(NSID.event, rec);
      remember('event', res.uri, rec.name);
      $('#event-done').innerHTML = done('Event published', res.uri,
        '. Calendar apps that read the shared event format can list it.');
      form.reset(); sync();
      setBusy(form, false, 'Publish another');
    } catch (x) { formError(form, x); setBusy(form, false, 'Publish event'); }
  };
};

/* ---------- quick note (a bead) ---------- */
PAGES.note = () => `<section class="step-in">
    <p class="crumb"><a href="#make">← All options</a></p>
    <h1 class="h">A quick note</h1>
    ${needAccount('note', () => `
    <p class="lede">The smallest record: one thing you saw, heard or read. CultureBlocs calls these <b>beads</b>.</p>
    <form id="f-note" class="form card" novalidate>
      <fieldset class="chips"><legend>What did you do?</legend>
        ${BEAD_KINDS.map((k, i) => `<label class="chip k-${k.kind}"><input type="radio" name="kind" value="${k.kind}" ${i === 0 ? 'checked' : ''}><span>${esc(k.label)}</span></label>`).join('')}
      </fieldset>
      <label>Note <textarea name="note" rows="3" required placeholder="${esc(BEAD_KINDS[0].example)}"></textarea></label>
      <div class="grid2">
        <label>When <input type="date" name="when" value="${new Date().toLocaleDateString('en-CA')}"></label>
        <label>Tags <span class="faint">(optional, commas)</span> <input name="tags" placeholder="film, cinema"></label>
      </div>
      <label>Link <span class="faint">(optional: the film, show or venue page)</span> <input name="link" inputmode="url"></label>
      <p class="err" role="alert" hidden></p>
      <button class="btn" type="submit">Save note</button>
    </form>
    <div id="note-done"></div>
    ${preview()}`)}
  </section>
  ${nav('make', 'make', 'Back to options')}`;

BIND.note = (view) => {
  bindSignIn(view);
  const form = $('#f-note', view);
  if (!form) return;
  const build = () => beadRecord(formData(form), { now: nowIso() });
  livePreview(form, build);
  form.addEventListener('change', (e) => {
    if (e.target.name === 'kind') form.note.placeholder = BEAD_KINDS.find(k => k.kind === e.target.value)?.example || '';
  });
  form.onsubmit = async (e) => {
    e.preventDefault();
    if (!form.note.value.trim()) { formError(form, new Error('Write a line about it.')); return; }
    $('.err', form).hidden = true;
    setBusy(form, true, 'Saving…');
    try {
      const rec = build();
      const res = await auth.createRecord(NSID.bead, rec);
      remember('note', res.uri, rec.note.slice(0, 60));
      $('#note-done').innerHTML = done('Note saved', res.uri, ' · <a href="/beads/" target="_blank" rel="noopener">See it in My beads</a>');
      form.note.value = '';
      setBusy(form, false, 'Save another');
    } catch (x) { formError(form, x); setBusy(form, false, 'Save note'); }
  };
};

/* ---------- tools ---------- */
const TOOLS = () => {
  const h = account ? encodeURIComponent(account.handle) : '';
  return [
    { group: 'Make and edit', items: [
      { name: 'Easel', url: `${SITE}/easel/`, text: 'Your creative profile and works, with images. Edit and publish.' },
      { name: 'Venue or organisation', url: `${SITE}/start/#venue`, text: 'Update your venue profile and its location.' },
      { name: 'Publish an event', url: `${SITE}/start/#event`, text: 'Add an event in the shared calendar format.' },
      { name: 'Quick note', url: `${SITE}/start/#note`, text: 'Record something you saw, heard or read.' },
      { name: 'My beads', url: `${SITE}/beads/`, text: 'All your notes: search, edit, delete. Installs on your phone.' },
      { name: 'I went', url: `${SITE}/events/`, text: 'Find an event in a listing and say you were there.' },
    ] },
    { group: 'See what you published', items: [
      ...(h ? [{ name: 'Your catalogue', url: `${SITE}/catalogue/?actor=${h}`, text: 'Your profile and works as a public page.' }] : []),
      { name: 'Event listings', url: `${SITE}/events/`, text: 'Directories of events, and who went.' },
      ...(account ? [{ name: 'Raw records', url: `https://pdsls.dev/at://${account.did}`, text: 'Everything in your account, as data.' }] : []),
    ] },
    { group: 'Install and run yourself', items: [
      { name: 'Pocket Totem', url: `${SITE}/pocket/`, text: 'Mark a moment with one tap. Add it to your home screen.' },
      { name: 'Loom', url: 'https://github.com/geocontrol/cultureblocs-loom', text: 'Local-first desk for writing and publishing. Runs on your computer.' },
      { name: 'All apps', url: `${SITE}/apps.html`, text: 'The full list, including the String, your own record store.' },
    ] },
  ];
};

PAGES.tools = () => `<section class="step-in">
    <h1 class="h">Your tools</h1>
    <p class="lede">${state.made.length ? `You made ${state.made.length} record${state.made.length === 1 ? '' : 's'}. ` : ''}These
    tools all work with the same account. Bookmark this page, or save the links.</p>
    <div class="tool-actions">
      <button type="button" class="btn" id="bm">Download bookmarks</button>
      <button type="button" class="btn ghost" id="copy">Copy all links</button>
    </div>
    ${TOOLS().map((g, gi) => `<h2 class="sec">${esc(g.group)}</h2>
      <ul class="tools">${g.items.map((t, i) => `<li style="--i:${gi * 4 + i}">
        <a href="${esc(t.url)}"${t.url.startsWith(SITE + '/start/') ? '' : ' target="_blank" rel="noopener"'}><b>${esc(t.name)}</b>
        <span>${esc(t.text)}</span><code>${esc(t.url.replace(/^https:\/\//, ''))}</code></a></li>`).join('')}</ul>`).join('')}
    <p class="note">Each tool asks you to sign in the first time. Use the same handle${account ? `: <b>@${esc(account.handle)}</b>` : ''}.</p>
  </section>
  ${nav('make', null)}`;

BIND.tools = (view) => {
  const all = TOOLS().flatMap(g => g.items.map(t => ({ ...t, group: g.group })));
  $('#copy', view).onclick = async (e) => {
    const text = all.map(t => `${t.name}: ${t.url}`).join('\n');
    try { await navigator.clipboard.writeText(text); e.target.textContent = 'Copied'; }
    catch { e.target.textContent = 'Copy failed'; }
  };
  $('#bm', view).onclick = () => {
    const groups = TOOLS().map(g => `<DT><H3>${esc(g.group)}</H3>\n<DL><p>\n${g.items.map(t =>
      `<DT><A HREF="${esc(t.url)}">${esc(t.name)}</A>`).join('\n')}\n</DL><p>`).join('\n');
    const html = `<!DOCTYPE NETSCAPE-Bookmark-file-1>\n<META HTTP-EQUIV="Content-Type" CONTENT="text/html; charset=UTF-8">\n` +
      `<TITLE>Bookmarks</TITLE>\n<H1>Bookmarks</H1>\n<DL><p>\n<DT><H3>CultureBlocs</H3>\n<DL><p>\n${groups}\n</DL><p>\n</DL><p>\n`;
    const a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob([html], { type: 'text/html' }));
    a.download = 'cultureblocs-bookmarks.html';
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 2000);
  };
};

/* ===================================================== boot */
async function boot() {
  const q = new URLSearchParams(location.search);
  if (q.has('i')) {
    const inv = decodeInvite(q.get('i'));
    if (inv) { state.invite = inv; state.made = state.made || []; save(); }
    history.replaceState({}, '', location.pathname + location.hash);
  }
  let route = current();
  if (auth.pendingCallback()) {
    try {
      await auth.completeLogin();
      route = sessionStorage.getItem('start:return') || 'make';
    } catch (x) {
      route = 'account';
      setTimeout(() => {
        const err = $('form.signin .err');
        if (err) { err.textContent = x.message; err.hidden = false; }
      }, 50);
    }
    sessionStorage.removeItem('start:return');
  }
  await loadAccount().catch(() => {});
  paintWho();
  if (!route) route = account ? 'make' : 'welcome';
  if (location.hash !== `#${route}`) history.replaceState({}, '', `${location.pathname}#${route}`);
  show(route);
}
boot();
