/* Start, Creative Spaces Symposium edition — for people who were at
 * Creative Newham's symposium on 3 Nov 2026.
 *
 * A version of /start/ with a set route, hash-routed so each step can be
 * bookmarked or sent on its own:
 *
 *   #guide     what this page offers, and what you end up with
 *   #account   sign in, or pick a network and a handle
 *   #you       your CreativeID (com.cultureblocs.creative.profile)
 *   #org       your organisation (com.cultureblocs.venue.profile), in its own account
 *   #bloc      a first bloc: one cultural moment (com.cultureblocs.bead)
 *   #there     "I was there": a bead pointing at the symposium's event record
 *   #boards    the Offers and Needs boards: read them, post to them (app.bsky.feed.post)
 *   #tools     links to come back to
 *
 * Everything is written to the person's own repository from the browser.
 * The boards are read from this site's feed service (/xrpc/…getFeedSkeleton,
 * see /feeds/feeds.json) and Bluesky's public API.
 */
import * as auth from '../lib/oauth.js';
import { NSID, NETWORKS, suggestHandles, profileRecord, venueRecord, beadRecord } from '../lib/records.js';
import { buildBead, buildPost, defaultPostText, findExisting, graphemes, POST_MAX } from '../../went/lib/compose.js';
import { getRecord as getPublicRecord, identify, listBeads } from '../../went/lib/repo.js';
import { BOARDS, CATEGORIES, boardPost, boardText, cardOf, feedUri, privateBits, roomLeft, POST_NSID }
  from './lib/board.js';

const DIR = 'creative-newham-symposium';
const SITE = 'https://www.cultureblocs.com';
const HERE = '/start/creative-newham/';
const APP = 'cultureblocs-start-newham';
const SCOPE = 'atproto ' + [NSID.profile, NSID.venue, NSID.bead, POST_NSID].map(n => `repo:${n}`).join(' ') + ' blob:image/*';
const KEY = 'newham:journey';
const ORDER = ['guide', 'account', 'you', 'org', 'bloc', 'there', 'boards', 'tools'];
const TITLES = { guide: 'After the symposium', account: 'Your account', you: 'Your CreativeID',
  org: 'Your organisation', bloc: 'Your first bloc', there: 'You were there', boards: 'Offers and Needs', tools: 'Your tools' };
const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;

/* ---------- small helpers ---------- */
const $ = (s, el = document) => el.querySelector(s);
const $$ = (s, el = document) => [...el.querySelectorAll(s)];
const esc = (s) => String(s ?? '').replace(/[&<>"']/g,
  c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
const nowIso = () => new Date().toISOString();
const formData = (form) => Object.fromEntries(new FormData(form).entries());
const viewer = (uri) => `https://pdsls.dev/${uri}`;
const postUrl = (did, rkey) => `https://bsky.app/profile/${did}/post/${rkey}`;

/* ---------- journey state (this browser only) ---------- */
function load() {
  try { return JSON.parse(localStorage.getItem(KEY) || '{}'); } catch { return {}; }
}
const state = Object.assign({ made: [], me: '', kind: '', board: 'offer' }, load());
const save = () => {
  try { localStorage.setItem(KEY, JSON.stringify({ made: state.made, me: state.me, kind: state.kind, board: state.board })); }
  catch { /* private mode: the journey still works, it just forgets */ }
};
let account = null;     // { did, handle, pds, displayName, avatar }
let existing = {};      // { profile, venue } as { uri, cid, value }
let symposium = null;   // { event: {uri,cid,value}, entry, meta }

function remember(kind, uri, label, extra = {}) {
  state.made = state.made.filter(m => m.uri !== uri);
  state.made.push({ kind, uri, label, did: account?.did, handle: account?.handle, at: nowIso(), ...extra });
  save();
}
const madeOf = (kind) => state.made.filter(m => m.kind === kind);

/* ---------- the account ---------- */
async function getRecord(collection, rkey) {
  const r = await fetch(`${account.pds}/xrpc/com.atproto.repo.getRecord?repo=${encodeURIComponent(account.did)}` +
    `&collection=${encodeURIComponent(collection)}&rkey=${encodeURIComponent(rkey)}`);
  return r.ok ? r.json() : null;
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

async function loadSymposium() {
  if (symposium) return symposium;
  const r = await fetch(`/events/${DIR}/events.json`, { cache: 'no-cache' });
  if (!r.ok) throw new Error('The symposium listing could not be loaded.');
  const listing = await r.json();
  const entry = listing.records[0];
  let event = { uri: entry.atUri, cid: entry.cid, value: entry.record };
  try {   // the published record, with its CID, if it is out yet
    const pub = await identify(listing.meta.did);
    const rec = await getPublicRecord(pub.pds, pub.did, NSID.event, entry.rkey);
    if (rec) event = { uri: rec.uri, cid: rec.cid, value: rec.value, publisher: pub };
  } catch { /* the listing copy is enough to point at */ }
  symposium = { event, entry, meta: listing.meta, url: `${SITE}/events/${DIR}/${entry.slug}/`, page: `/events/${DIR}/${entry.slug}/` };
  return symposium;
}

/* ---------- the shell ---------- */
function paintRail(route) {
  const at = ORDER.indexOf(route);
  $$('#rail li').forEach((li, i) => {
    li.classList.toggle('done', i < at);
    li.classList.toggle('here', i === at);
    li.querySelector('a').toggleAttribute('aria-current', i === at);
  });
  $('#rail').style.setProperty('--p', String(Math.max(at, 0) / (ORDER.length - 1)));
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
    view.innerHTML = PAGES[route]();
    view.dataset.route = route;
    paintRail(route);
    (BIND[route] || (() => {}))(view);
    document.title = `${TITLES[route]} — CultureBlocs`;
  };
  if (document.startViewTransition && !reduced) {
    const t = document.startViewTransition(draw);
    t.ready.catch(() => {}); t.finished.catch(() => {});
    setTimeout(() => { if (!drawn) { t.skipTransition(); draw(); } }, 250);
  } else draw();
  window.scrollTo({ top: 0, behavior: reduced ? 'auto' : 'smooth' });
  $('#main').focus({ preventScroll: true });
}

const current = () => {
  const r = location.hash.replace(/^#\/?/, '');
  return ORDER.includes(r) ? r : '';
};
function go(route) {
  if (location.hash === `#${route}`) show(route);
  else location.hash = route;
}
addEventListener('hashchange', () => show(current() || 'guide'));

/* ---------- reusable bits of page ---------- */
const next = (route) => ORDER[ORDER.indexOf(route) + 1];
const prev = (route) => ORDER[ORDER.indexOf(route) - 1];
const nav = (route, nextLabel, { skip, hideNext } = {}) => `<div class="nav-row">
  ${prev(route) ? `<a class="btn ghost" href="#${prev(route)}">Back</a>` : '<span></span>'}
  <span class="nav-right">
    ${skip ? `<a class="linkish skip" href="#${next(route)}">${esc(skip)}</a>` : ''}
    ${next(route) && !hideNext ? `<a class="btn" href="#${next(route)}">${esc(nextLabel || 'Next')}</a>` : ''}
  </span></div>`;

const signIn = (returnTo, lead = 'Sign in with your handle', value = '') => `
  <form class="signin card" data-return="${esc(returnTo)}">
    <label for="handle-${esc(returnTo)}">${esc(lead)}</label>
    <div class="row">
      <input id="handle-${esc(returnTo)}" name="handle" autocomplete="username" autocapitalize="none" spellcheck="false"
        placeholder="yourname.bsky.social" value="${esc(value)}" required>
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
        sessionStorage.setItem('newham:return', form.dataset.return || 'you');
        await auth.startLogin(form.handle.value.trim().replace(/^@/, ''), SCOPE);
      } catch (x) {
        err.textContent = x.message || String(x);
        err.hidden = false;
        btn.disabled = false; btn.textContent = 'Sign in';
      }
    };
  }
}

const needAccount = (route, body) => account ? body() : `
  <p class="lede">To save this to your account, sign in first.</p>
  ${signIn(route, 'Sign in with your handle', state.me)}
  <p class="hint">No account yet? <a href="#account">Set one up</a>; it takes a couple of minutes.</p>`;

const preview = (what = 'record') => `<details class="preview"><summary>See the ${what}</summary>
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
  if (/scope|forbidden|insufficient/i.test(msg) || x?.status === 403) msg += ' Try signing out and in again.';
  el.textContent = msg;
  el.hidden = false;
}

const done = (title, uri, extra = '') => `
  <div class="done-card" role="status">
    <svg class="tick" viewBox="0 0 52 52" aria-hidden="true"><circle cx="26" cy="26" r="24"/><path d="M15 27l7 7 15-16"/></svg>
    <div><h3>${esc(title)}</h3>
    <p>Saved to your account. <a href="${esc(viewer(uri))}" target="_blank" rel="noopener">View the raw record</a>${extra}</p></div>
  </div>`;

const publicNote = (lines) => `
  <aside class="public" aria-label="Public">
    <span class="ico-public" aria-hidden="true"></span>
    <div>${lines}</div>
  </aside>`;

/* ---------- places ---------- */
async function geocode(q, { city = false } = {}) {
  const url = 'https://nominatim.openstreetmap.org/search?format=jsonv2&limit=1&addressdetails=0' +
    `&q=${encodeURIComponent(q)}` + (city ? '&featureType=settlement' : '');
  const r = await fetch(url, { headers: { 'Accept-Language': navigator.language || 'en' } });
  if (!r.ok) throw new Error('The map search is busy. Try again in a moment, or type the coordinates.');
  const [hit] = await r.json();
  if (!hit) throw new Error('No match. Check the address, or add the postcode.');
  return { lat: Number(hit.lat), lng: Number(hit.lon), label: hit.display_name };
}

function bindFind(form, { city = false, query }) {
  const btn = $('.find', form);
  if (!btn) return;
  const out = $('.found', form);
  btn.onclick = async () => {
    const q = query();
    if (!q.trim()) { out.innerHTML = '<p class="err">Fill in the place first.</p>'; return; }
    btn.disabled = true; btn.textContent = 'Looking…';
    try {
      const hit = await geocode(q, { city });
      form.lat.value = hit.lat.toFixed(6);
      form.lng.value = hit.lng.toFixed(6);
      out.innerHTML = `<p class="hint">Found: ${esc(hit.label)}.${city ? ' Only the town is published, rounded to about 10 km.' : ' If that is wrong, edit the coordinates.'}</p>`;
      form.dispatchEvent(new Event('input'));
    } catch (x) {
      out.innerHTML = `<p class="err">${esc(x.message)}</p>`;
    } finally {
      btn.disabled = false; btn.textContent = 'Find on map';
    }
  };
}

/* ===================================================== pages */
const PAGES = {};
const BIND = {};

/* ---------- guide ---------- */
const STEPS = [
  { route: 'account', title: 'Set up your account', time: '2 min',
    text: 'Sign in with a Bluesky, Blacksky or Eurosky account, or make one. It is the same account for everything below.' },
  { route: 'you', title: 'Your CreativeID', time: '3 min',
    text: 'Your name, what you do and where you are based, published as a creative profile that any directory or catalogue can read.' },
  { route: 'org', title: 'Your organisation', time: '3 min', optional: true,
    text: 'A venue, studio, community group or company: its name, what it does and where. Kept in the organisation’s own account.' },
  { route: 'bloc', title: 'Your first bloc', time: '1 min',
    text: 'One cultural moment from your week: a show, a book, a gig, something you made. This is the smallest CultureBlocs record.' },
  { route: 'there', title: 'Say you were at the symposium', time: '1 min', optional: true,
    text: 'A bloc that points at the day itself, with the sessions you went to and what you took away.' },
  { route: 'boards', title: 'Post to the Offers and Needs boards', time: '2 min',
    text: 'Like the boards on the day: say what you can offer and what you need, and read what other people posted.' },
  { route: 'tools', title: 'Keep your tools', time: '',
    text: 'Links to edit what you made, add more, and come back to the boards.' },
];

PAGES.guide = () => `
  <section class="hero step-in">
    <p class="kicker">Creative Spaces Symposium · 3 November 2026</p>
    <h1>After the symposium</h1>
    <svg class="thread" viewBox="0 0 600 24" aria-hidden="true" preserveAspectRatio="none">
      <path d="M0 12 C 80 2, 160 22, 240 12 S 400 2, 480 12 S 560 20, 600 12"/>
      <circle cx="120" cy="10" r="6" class="b1"/><circle cx="300" cy="11" r="6" class="b2"/><circle cx="470" cy="12" r="6" class="b3"/>
    </svg>
    <p class="lede">You spent the day at English National Ballet talking about creative spaces in Newham. This page
    helps you put what you do, and what you can offer or need, somewhere other people can find it.</p>
    <p>It uses CultureBlocs, an open, shared format for cultural activity. What you make here is saved in
    your own account, as public records any app can read. No company holds the data, and there is no
    CultureBlocs platform to join.</p>

    <h2 class="sec">What you can do here</h2>
    <ol class="guide-steps">
      ${STEPS.map((s, i) => `<li style="--i:${i}">
        <a href="#${s.route}">
          <span class="n">${i + 1}</span>
          <span class="body"><b>${esc(s.title)}</b>${s.optional ? ' <span class="opt-tag">optional</span>' : ''}
          <span class="txt">${esc(s.text)}</span></span>
          ${s.time ? `<span class="time">${esc(s.time)}</span>` : ''}
        </a></li>`).join('')}
    </ol>
    <p class="hint">About ten minutes for all of it. Do it in order, or tap any step to go straight there.
    Skip anything you don't need.</p>

    <h2 class="sec">What you end up with</h2>
    <div class="three">
      <div><h3>A public profile</h3><p>Your CreativeID, and your organisation's, readable by catalogues, maps and
        directories built on the same format, now or later.</p></div>
      <div><h3>A record of the day</h3><p>Your blocs sit in your account. Tools such as My beads and Loom pick them up,
        and you can edit or delete them.</p></div>
      <div><h3>Posts on the boards</h3><p>Your offers and needs go out as Bluesky posts. They show on the boards here
        and in any Bluesky app.</p></div>
    </div>

    ${publicNote(`<h2>Everything you publish is public</h2>
      <p>Profiles, blocs and board posts can be read by anyone: other people, apps and search engines.
      There is no private setting.</p>
      <ul>
        <li>Only add what you would put on a public website or a noticeboard.</li>
        <li>Leave out personal phone numbers, personal email addresses and home addresses.</li>
        <li>You can edit or delete things later, but someone may already have copied them.</li>
      </ul>`)}

    <p class="aside-note">This page was made by CultureBlocs for people at the symposium. It is not run by
    Creative Newham, and nothing you publish here is sent to them or to us.</p>
  </section>
  <div class="nav-row">
    <a class="linkish" href="#boards">Just here for the boards?</a>
    <a class="btn" href="#account">Start</a>
  </div>`;

/* ---------- account ---------- */
PAGES.account = () => {
  if (account) {
    return `<section class="step-in">
      <h1 class="h">You're signed in</h1>
      <div class="card signed">
        ${account.avatar ? `<img class="avatar" src="${esc(account.avatar)}" alt="">` : '<span class="avatar dot"></span>'}
        <div><b>${esc(account.displayName || account.handle)}</b><br><span class="faint">@${esc(account.handle)}</span></div>
      </div>
      <p>What you make next is saved to this account. Use your own account for your CreativeID; the
      organisation step explains how to switch to your organisation's account.</p>
    </section>${nav('account', 'Next: your CreativeID')}`;
  }
  return `<section class="step-in">
    <h1 class="h">Your account</h1>
    <p class="lede">CultureBlocs uses the same accounts as Bluesky and the other networks built on the
    AT Protocol. One account works everywhere.</p>
    <div class="choice" role="tablist">
      <button type="button" role="tab" class="opt" data-pick="have" aria-selected="true">I have an account</button>
      <button type="button" role="tab" class="opt" data-pick="need" aria-selected="false">I need one</button>
    </div>

    <div data-panel="have">
      ${signIn('you', 'Sign in with your handle', state.me)}
      <p class="hint">Your handle looks like <code>name.bsky.social</code>, <code>name.blacksky.app</code>,
      <code>name.eurosky.social</code>, or a domain such as <code>yourstudio.org</code>.</p>
    </div>

    <div data-panel="need" hidden>
      <h2 class="sec">1. Choose a handle</h2>
      <p>Your handle is your public name on the network. Type your name and we'll suggest some.</p>
      <form class="card suggest" autocomplete="off">
        <fieldset class="kinds"><legend>This account is for</legend>
          ${[['person', 'Me, as an artist or person'], ['org', 'An organisation, venue or group']].map(([v, l]) =>
            `<label><input type="radio" name="kind" value="${v}" ${(state.kind || 'person') === v ? 'checked' : ''}> ${l}</label>`).join('')}
        </fieldset>
        <label>Name <input name="name" placeholder="Ada Lovelace, Stratford Youth Dance"></label>
        <label>Website <span class="faint">(optional)</span> <input name="domain" placeholder="yourstudio.org" inputmode="url"></label>
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
      <p class="hint">Signing up asks for an email address and a date of birth. Those stay with the network; they are not
      published and CultureBlocs never sees them.</p>

      <h2 class="sec">3. Come back and sign in</h2>
      ${signIn('you', 'Signed up? Enter your new handle')}
    </div>
  </section>
  ${nav('account', null, { hideNext: true, skip: 'Look around first' })}`;
};

BIND.account = (view) => {
  bindSignIn(view);
  const tabs = $$('[data-pick]', view);
  const pick = (which) => {
    tabs.forEach(t => t.setAttribute('aria-selected', String(t.dataset.pick === which)));
    $$('[data-panel]', view).forEach(p => { p.hidden = p.dataset.panel !== which; });
  };
  tabs.forEach(t => { t.onclick = () => pick(t.dataset.pick); });
  const form = $('form.suggest', view);
  if (!form) return;
  const paint = () => {
    const f = formData(form);
    state.kind = f.kind; save();
    const list = suggestHandles({ ...f, kind: f.kind === 'org' ? 'org' : 'person' });
    $('#handles').innerHTML = list.length ? list.map((s, i) => `
      <li style="--i:${i}"><code>${esc(s.handle)}</code><span>${esc(s.why)}</span>
      <button type="button" class="linkish" data-copy="${esc(s.handle)}">Copy</button></li>`).join('')
      : '<li class="faint">Type a name to see suggestions.</li>';
    for (const n of NETWORKS) {
      const s = list.find(x => x.network === n.id);
      $(`[data-for="${n.id}"]`).textContent = s ? s.handle : `name.${n.suffix}`;
    }
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
};

/* ---------- you: CreativeID ---------- */
PAGES.you = () => {
  const p = existing.profile?.value || {};
  const based = p.based || {};
  return `<section class="step-in">
    <h1 class="h">Your CreativeID</h1>
    ${needAccount('you', () => `
    <p class="lede">Who you are and what you do, as a creative profile in your own account.
    ${p.name ? 'You already have one; changes here update it.' : ''}</p>
    <p class="note">This is about you as a person. If you were there for an organisation, add it in the next step.</p>
    <form id="f-you" class="form card" novalidate>
      <label>Name to be credited under <input name="name" required value="${esc(p.name || account.displayName || '')}"></label>
      <label>About you <textarea name="bio" rows="3" placeholder="Two or three sentences about your practice.">${esc(p.bio || '')}</textarea></label>
      <label>What you do <span class="faint">(separate with commas)</span>
        <input name="disciplines" value="${esc((p.disciplines || []).join(', '))}" placeholder="choreography, community arts, sound"></label>
      <div class="pair">
        <label>Where you are based <span class="faint">(a town or borough is enough)</span>
          <input name="based" value="${esc(based.name || '')}" placeholder="Newham"></label>
        <button type="button" class="btn ghost find">Find on map</button>
      </div>
      <input type="hidden" name="lat" value="${esc(based.geo?.lat ?? '')}"><input type="hidden" name="lng" value="${esc(based.geo?.lng ?? '')}">
      <div class="found"></div>
      <label>Links <span class="faint">(website, portfolio, socials; one per line)</span>
        <textarea name="links" rows="2">${esc((p.links || []).map(l => l.uri).join('\n'))}</textarea></label>
      <p class="hint">Public, like everything here. No home address, personal phone or personal email.</p>
      <p class="err" role="alert" hidden></p>
      <button class="btn" type="submit">${p.name ? 'Update my CreativeID' : 'Publish my CreativeID'}</button>
    </form>
    <div id="you-done"></div>
    ${preview()}`)}
  </section>
  ${nav('you', 'Next: your organisation', { skip: account && !existing.profile ? 'Skip' : '' })}`;
};

BIND.you = (view) => {
  bindSignIn(view);
  const form = $('#f-you', view);
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
    setBusy(form, true, 'Publishing…');
    try {
      const rec = build();
      const res = await auth.putRecord(NSID.profile, 'self', rec, existing.profile?.cid);
      existing.profile = { uri: res.uri, cid: res.cid, value: rec };
      state.me = account.handle;
      remember('person', res.uri, rec.name);
      $('#you-done').innerHTML = done('Your CreativeID is published', res.uri,
        ` · <a href="/catalogue/?actor=${encodeURIComponent(account.handle)}" target="_blank" rel="noopener">See your catalogue page</a>
        · <a href="#org">Next: your organisation →</a>`);
      setBusy(form, false, 'Update my CreativeID');
    } catch (x) { formError(form, x); setBusy(form, false, 'Publish my CreativeID'); }
  };
};

/* ---------- org ---------- */
const orgForm = () => {
  const v = existing.venue?.value || {};
  const a = v.location?.$type === 'community.lexicon.location.address' ? v.location : {};
  const g = v.place?.geo || {};
  const kind = (v.tags || []).includes('organisation') ? 'org' : (v.tags || []).includes('gallery') ? 'gallery' : (v.name ? 'venue' : 'org');
  return `
    <form id="f-org" class="form card" novalidate>
      <fieldset class="kinds"><legend>This is</legend>
        <label><input type="radio" name="kind" value="venue" ${kind === 'venue' ? 'checked' : ''}> A venue or creative space people can visit</label>
        <label><input type="radio" name="kind" value="gallery" ${kind === 'gallery' ? 'checked' : ''}> A gallery</label>
        <label><input type="radio" name="kind" value="org" ${kind === 'org' ? 'checked' : ''}> An organisation, group or company without a public space</label>
      </fieldset>
      <label>Name <input name="name" required value="${esc(v.name || account.displayName || '')}"></label>
      <label>What it does <textarea name="description" rows="3" placeholder="Who it is for and what happens there.">${esc(v.description || '')}</textarea></label>

      <h3 class="sub">Where</h3>
      <p class="hint only-space">A space open to the public publishes its full address and map position.</p>
      <p class="hint only-org" hidden>Without a public space, only the town or borough is published. Don't use a home address.</p>
      <label class="only-space">Street <input name="street" autocomplete="address-line1" value="${esc(a.street || '')}"></label>
      <div class="grid2">
        <label>Town or borough <input name="locality" value="${esc(a.locality || 'London')}"></label>
        <label class="only-space">Postcode <input name="postalCode" autocomplete="postal-code" value="${esc(a.postalCode || '')}"></label>
        <label>Area <span class="faint">(optional)</span> <input name="region" value="${esc(a.region || '')}" placeholder="Newham"></label>
        <label>Country code <input name="country" maxlength="2" value="${esc(a.country || 'GB')}"></label>
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
      <label>Links <span class="faint">(website, socials, booking; one per line)</span>
        <textarea name="links" rows="2">${esc((v.links || []).map(l => l.uri).join('\n'))}</textarea></label>
      <p class="hint">A shared office email or booking page is fine to link. A personal one isn't.</p>
      <p class="err" role="alert" hidden></p>
      <button class="btn" type="submit">${v.name ? 'Update' : 'Publish'}</button>
    </form>
    <div id="org-done"></div>
    ${preview()}`;
};

PAGES.org = () => {
  const mine = existing.profile || (state.me && account && state.me === account.handle);
  let body;
  if (!account) {
    body = `<p class="lede">Sign in with your organisation's account to publish its profile.</p>
      ${signIn('org', "Your organisation's handle")}
      <p class="hint">No organisation account yet? <a href="#account">Set one up</a> and choose
      “An organisation, venue or group”. Ideally its handle is its website domain.</p>`;
  } else if (mine && !existing.venue) {
    body = `<p class="lede">An organisation's profile belongs in the organisation's own account, so that it stays
      with the organisation if people move on, and its events and posts come from it.</p>
      <div class="card signed">
        ${account.avatar ? `<img class="avatar" src="${esc(account.avatar)}" alt="">` : '<span class="avatar dot"></span>'}
        <div>You are signed in as <b>@${esc(account.handle)}</b>, which has your own CreativeID.</div>
      </div>
      <div class="org-choices">
        <button type="button" class="btn" id="switch">Sign in as the organisation</button>
        <button type="button" class="btn ghost" id="same">Use this account anyway</button>
        <a class="linkish" href="#bloc">I'm on my own, skip this</a>
      </div>
      <div id="switch-form" hidden>${signIn('org', "Your organisation's handle")}
        <p class="hint">You'll sign out of @${esc(account.handle)}. After the organisation is published you can
        sign back in to carry on.</p></div>
      <div id="same-form" hidden>${orgForm()}</div>`;
  } else {
    body = `<p class="lede">Name, what it does and where, so events, visits and maps can point at it.
      ${existing.venue ? 'This account already has one; changes here update it.' : ''}</p>${orgForm()}`;
  }
  return `<section class="step-in">
    <h1 class="h">Your organisation</h1>
    ${body}
  </section>
  ${nav('org', 'Next: your first bloc')}`;
};

function bindOrgForm(view) {
  const form = $('#f-org', view);
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
      remember('org', res.uri, rec.name);
      const back = state.me && state.me !== account.handle;
      $('#org-done').innerHTML = done(`${rec.name} is published`, res.uri, back
        ? `<br><button type="button" class="linkish" id="back-me">Sign back in as @${esc(state.me)} to carry on →</button>`
        : ' · <a href="#bloc">Next: your first bloc →</a>');
      $('#back-me', view)?.addEventListener('click', async () => {
        await auth.signOut(); account = null; existing = {};
        sessionStorage.setItem('newham:return', 'bloc');
        try { await auth.startLogin(state.me, SCOPE); } catch (x) { paintWho(); go('bloc'); }
      });
      setBusy(form, false, 'Update');
    } catch (x) { formError(form, x); setBusy(form, false, 'Publish'); }
  };
}

BIND.org = (view) => {
  bindSignIn(view);
  bindOrgForm(view);
  $('#switch', view)?.addEventListener('click', async () => {
    $('#switch-form', view).hidden = false; $('#same-form', view).hidden = true;
    await auth.signOut(); account = null; existing = {}; paintWho();
    $('#switch-form input', view).focus();
  });
  $('#same', view)?.addEventListener('click', () => {
    $('#same-form', view).hidden = false; $('#switch-form', view).hidden = true;
  });
};

/* ---------- first bloc ---------- */
const BLOC_KINDS = [
  { kind: 'bloc', label: 'A moment', example: 'Walked past the new mural on the Greenway. Stopped for ten minutes.' },
  { kind: 'visit', label: 'Visited', example: 'Went to the open studios at Bow Arts. Room four was the best.' },
  { kind: 'performance', label: 'Saw live', example: 'Caught the late set at the Rhythm Factory.' },
  { kind: 'watch', label: 'Watched', example: 'Saw the new Spielberg at the Stratford Picturehouse.' },
  { kind: 'listen', label: 'Listened', example: 'First full listen of the new record on the Jubilee line.' },
  { kind: 'read', label: 'Read', example: 'Finished a book on public space, on the DLR.' },
  { kind: 'note', label: 'Made or shared', example: 'Ran our first open rehearsal. Eleven people came.' },
];

PAGES.bloc = () => `<section class="step-in">
    <h1 class="h">Your first bloc</h1>
    ${needAccount('bloc', () => `
    <p class="lede">A bloc is one cultural moment: something you saw, heard, read, visited or made. It's the
    smallest CultureBlocs record, saved in your account as a <b>bead</b>.</p>
    <p class="note">Anything from the last few days. The symposium itself has its own step next.</p>
    <form id="f-bloc" class="form card" novalidate>
      <fieldset class="chips"><legend>What was it?</legend>
        ${BLOC_KINDS.map((k, i) => `<label class="chip k-${k.kind}"><input type="radio" name="kind" value="${k.kind}" ${i === 0 ? 'checked' : ''}><span>${esc(k.label)}</span></label>`).join('')}
      </fieldset>
      <label>A line or two about it <textarea name="note" rows="3" required placeholder="${esc(BLOC_KINDS[0].example)}"></textarea></label>
      <div class="grid2">
        <label>When <input type="date" name="when" value="${new Date().toLocaleDateString('en-CA')}"></label>
        <label>Tags <span class="faint">(optional, commas)</span> <input name="tags" placeholder="dance, Stratford"></label>
      </div>
      <label>Link <span class="faint">(optional: the show, venue or work)</span> <input name="link" inputmode="url"></label>
      <p class="hint">Public. Write about what you did, not about other people's private lives.</p>
      <p class="err" role="alert" hidden></p>
      <button class="btn" type="submit">Save my first bloc</button>
    </form>
    <div id="bloc-done"></div>
    ${preview()}`)}
  </section>
  ${nav('bloc', 'Next: the symposium')}`;

const blocRecord = (f) => {
  const rec = beadRecord(f, { now: nowIso() });
  rec.kind = BLOC_KINDS.some(k => k.kind === f.kind) ? f.kind : 'bloc';
  rec.provenance = { app: APP, mintedAt: nowIso(), timeAnchored: false };
  return rec;
};

BIND.bloc = (view) => {
  bindSignIn(view);
  const form = $('#f-bloc', view);
  if (!form) return;
  const build = () => blocRecord(formData(form));
  livePreview(form, build);
  form.addEventListener('change', (e) => {
    if (e.target.name === 'kind') form.note.placeholder = BLOC_KINDS.find(k => k.kind === e.target.value)?.example || '';
  });
  form.onsubmit = async (e) => {
    e.preventDefault();
    if (!form.note.value.trim()) { formError(form, new Error('Write a line about it.')); return; }
    $('.err', form).hidden = true;
    setBusy(form, true, 'Saving…');
    try {
      const rec = build();
      const res = await auth.createRecord(NSID.bead, rec);
      remember('bloc', res.uri, rec.note.slice(0, 60));
      $('#bloc-done').innerHTML = done('Your first bloc is saved', res.uri,
        ' · <a href="/beads/" target="_blank" rel="noopener">See it in My beads</a> · <a href="#there">Next: the symposium →</a>');
      form.note.value = '';
      setBusy(form, false, 'Save another');
    } catch (x) { formError(form, x); setBusy(form, false, 'Save my first bloc'); }
  };
};

/* ---------- there: the symposium ---------- */
PAGES.there = () => `<section class="step-in">
    <h1 class="h">You were at the symposium</h1>
    ${needAccount('there', () => `
    <p class="lede">A bloc that points at the day itself. It joins the record of the symposium, so anyone
    reading it can see who was there, from each person's own account.</p>
    <div id="ev-card" class="ev-card card"><p class="faint">Loading the day…</p></div>
    <form id="f-there" class="form card" novalidate hidden>
      <fieldset class="chips sessions"><legend>Which sessions were you in? <span class="faint">(tap to add them to your note)</span></legend>
        <div id="sessions"></div>
      </fieldset>
      <label>What did you take away? <textarea name="note" rows="4"
        placeholder="One idea I'm taking back to our space, or someone I'm glad I met."></textarea></label>
      <fieldset class="kinds"><legend>Saved as</legend>
        <label><input type="radio" name="kind" value="visit" checked> A visit</label>
        <label><input type="radio" name="kind" value="performance"> A talk or performance</label>
      </fieldset>
      <label class="check"><input type="checkbox" name="post"> Also post about it on Bluesky</label>
      <div id="post-box" hidden>
        <label>Your post <textarea name="postText" rows="3"></textarea></label>
        <p class="hint"><span id="post-count"></span> It links to the symposium's page and shows in the
        “Creative Spaces 2026” feed.</p>
      </div>
      <p class="hint">Public. If you mention people, keep to what they said on stage or in public.</p>
      <p class="dupe note" hidden></p>
      <p class="err" role="alert" hidden></p>
      <button class="btn" type="submit">Save</button>
    </form>
    <div id="there-done"></div>
    ${preview()}`)}
  </section>
  ${nav('there', 'Next: the boards', { skip: account && !madeOf('there').length ? 'Skip' : '' })}`;

BIND.there = async (view) => {
  bindSignIn(view);
  const form = $('#f-there', view);
  if (!form) return;
  let sym, beads = [];
  try {
    [sym, beads] = await Promise.all([loadSymposium(), listBeads(account.pds, account.did).catch(() => [])]);
  } catch (x) {
    $('#ev-card', view).innerHTML = `<p class="err">${esc(x.message)}</p>`;
    return;
  }
  const ev = sym.event.value;
  const loc = ev.locations?.[0] || {};
  $('#ev-card', view).innerHTML = `<p class="kicker">Tue 3 Nov 2026 · 9.30–16.30</p>
    <h2>${esc(ev.name)}</h2><p class="faint">${esc(loc.name || '')}</p>
    <p><a href="${esc(sym.page)}">About the day →</a></p>`;
  $('#sessions', view).innerHTML = sym.entry.programme.map((s, i) =>
    `<button type="button" class="chip-btn" data-s="${i}" aria-pressed="false">${esc(s.name)}</button>`).join('');
  form.hidden = false;
  const day = '2026-11-03';
  const authorities = [sym.event.publisher?.did, sym.meta.did, sym.meta.repo];
  const dup = findExisting(beads, sym.event.uri, day, authorities);
  if (dup) {
    const d = $('.dupe', form);
    d.textContent = 'You already have a bloc for the symposium. Saving will update it rather than add a second.';
    d.hidden = false;
    if (dup.value?.note) form.note.value = dup.value.note;
  }

  const picked = new Set();
  $('#sessions', view).addEventListener('click', (e) => {
    const b = e.target.closest('[data-s]');
    if (!b) return;
    const name = sym.entry.programme[b.dataset.s].name;
    const on = b.getAttribute('aria-pressed') !== 'true';
    b.setAttribute('aria-pressed', String(on));
    if (on) {
      picked.add(name);
      const sep = form.note.value.trim() ? (/\n$/.test(form.note.value) ? '' : '\n') : '';
      form.note.value += `${sep}${name}: `;
      form.note.focus();
    } else picked.delete(name);
    form.dispatchEvent(new Event('input'));
  });

  let postEdited = false;
  const postBox = $('#post-box', form);
  const syncPost = () => {
    postBox.hidden = !form.post.checked;
    if (!postEdited) form.postText.value = defaultPostText({ name: ev.name, note: form.note.value });
    const n = graphemes(form.postText.value);
    $('#post-count', form).textContent = `${n} / ${POST_MAX}.`;
    $('#post-count', form).classList.toggle('err', n > POST_MAX);
  };
  form.postText.addEventListener('input', () => { postEdited = true; });
  form.addEventListener('input', syncPost);
  form.addEventListener('change', syncPost);
  syncPost();

  const build = () => {
    const f = formData(form);
    const bead = buildBead({ event: sym.event, day, note: f.note, kind: f.kind, tags: [sym.meta.tag],
      eventUrl: sym.url, category: sym.entry.category });
    bead.provenance.app = APP;
    return bead;
  };
  livePreview(form, build);

  form.onsubmit = async (e) => {
    e.preventDefault();
    const f = formData(form);
    if (f.post && (!f.postText.trim() || graphemes(f.postText) > POST_MAX)) {
      formError(form, new Error(`The post needs some text, up to ${POST_MAX} characters.`)); return;
    }
    $('.err', form).hidden = true;
    setBusy(form, true, 'Saving…');
    try {
      const fresh = await listBeads(account.pds, account.did).catch(() => beads);
      const was = findExisting(fresh, sym.event.uri, day, authorities);
      const bead = build();
      const res = was ? await auth.putRecord(NSID.bead, was.rkey, bead) : await auth.createRecord(NSID.bead, bead);
      remember('there', res.uri, ev.name);
      let extra = ' · <a href="#boards">Next: the boards →</a>';
      if (f.post) {
        try {
          let thumb;
          try {
            const img = await fetch(`${sym.page}og.png`);
            if (img.ok) thumb = await auth.uploadBlob(await img.blob());
          } catch { /* a card without a picture is fine */ }
          const post = buildPost({ text: f.postText, eventUrl: sym.url, title: ev.name,
            description: `Tue 3 Nov 2026 · ${loc.name || ''}`, thumb, tags: [sym.meta.tag] });
          const p = await auth.createRecord(POST_NSID, post);
          extra = ` · <a href="${esc(postUrl(account.did, p.uri.split('/').pop()))}" target="_blank" rel="noopener">See your post</a>${extra}`;
        } catch (x) {
          extra = `<br><span class="err">The bloc is saved, but the Bluesky post didn't go: ${esc(x.message)}</span>${extra}`;
        }
      }
      $('#there-done', view).innerHTML = done(was ? 'Your symposium bloc is updated' : 'Your symposium bloc is saved', res.uri, extra);
      form.post.checked = false; syncPost();
      setBusy(form, false, 'Update');
    } catch (x) { formError(form, x); setBusy(form, false, 'Save'); }
  };
};

/* ---------- boards ---------- */
PAGES.boards = () => {
  const b = BOARDS[state.board] || BOARDS.offer;
  return `<section class="step-in">
    <h1 class="h">Offers and Needs</h1>
    <p class="lede">The boards from the day, carried on. Say what you can offer other people in Newham's
    creative sector, or what you need, and see what others have posted.</p>

    <div class="choice board-tabs" role="tablist" aria-label="Board">
      ${Object.values(BOARDS).map(x => `<button type="button" role="tab" class="opt" data-board="${x.id}"
        aria-selected="${x.id === b.id}">${esc(x.label)}</button>`).join('')}
    </div>

    <h2 class="sec" id="post-h">Post to the <span class="board-name">${esc(b.label)}</span> board</h2>
    ${publicNote(`<h2>This board is public</h2>
      <p>Your post goes out on Bluesky under your name. Anyone can read, share or copy it, including people
      who weren't at the symposium, and it stays up until you delete it.</p>
      <ul>
        <li><b>Don't include</b> a personal phone number, personal email or home address.</li>
        <li>People can <b>reply to your post</b> on Bluesky, so you don't need to give contact details at all.</li>
        <li>If you'd rather be contacted another way, link to a <b>public page</b>: your website, a booking or contact form.</li>
        <li>Only mention other people or organisations if they're happy to be named.</li>
      </ul>`)}
    ${needAccount('boards', () => `
    <form id="f-board" class="form card" novalidate>
      <fieldset class="kinds"><legend>Board</legend>
        ${Object.values(BOARDS).map(x => `<label><input type="radio" name="board" value="${x.id}" ${x.id === b.id ? 'checked' : ''}> ${esc(x.one)}</label>`).join('')}
      </fieldset>
      <fieldset class="chips"><legend>What kind of thing?</legend>
        ${CATEGORIES.map(([v, l], i) => `<label class="chip"><input type="radio" name="category" value="${v}" ${i === 0 ? 'checked' : ''}><span>${esc(l)}</span></label>`).join('')}
      </fieldset>
      <label><span class="ask">${esc(b.ask)}</span> <span class="faint help">${esc(b.help)}</span>
        <textarea name="text" rows="4" required placeholder="${esc(b.placeholder)}"></textarea></label>
      <p class="hint" id="room"></p>
      <div class="warn" id="warn" role="alert" hidden></div>
      <fieldset class="kinds reply"><legend>How should people get in touch?</legend>
        <label><input type="radio" name="reply" value="bsky" checked> By replying to my post on Bluesky</label>
        <label><input type="radio" name="reply" value="link"> Through a public web page</label>
      </fieldset>
      <label class="link-row" hidden>Public page <span class="faint">(website, booking or contact form)</span>
        <input name="link" inputmode="url" placeholder="https://"></label>
      <div class="post-preview"><span class="lbl">Your post will read</span><p id="post-out"></p></div>
      <label class="check ack"><input type="checkbox" name="ack" required> I understand this post is public, and it has
        no contact details I'd want kept private.</label>
      <p class="err" role="alert" hidden></p>
      <button class="btn" type="submit">Post to the board</button>
    </form>
    <div id="board-done"></div>`)}

    <h2 class="sec">On the <span class="board-name">${esc(b.label)}</span> board</h2>
    <div id="board" class="board" aria-live="polite"><p class="faint">Loading…</p></div>
    <p class="hint">The boards collect Bluesky posts tagged <code>#CreativeNewhamOffer</code> and
    <code>#CreativeNewhamNeed</code>, so you can also post from any Bluesky app with the tag. New posts can take a
    minute or two to show.</p>
  </section>
  ${nav('boards', "Next: your tools")}`;
};

async function loadBoard(board, view) {
  const el = $('#board', view);
  el.innerHTML = '<p class="faint">Loading…</p>';
  try {
    const sk = await fetch(`/xrpc/app.bsky.feed.getFeedSkeleton?feed=${encodeURIComponent(feedUri(board))}&limit=60`);
    if (!sk.ok) throw new Error(`board unavailable (${sk.status})`);
    const uris = ((await sk.json()).feed || []).map(x => x.post);
    const posts = [];
    for (let i = 0; i < uris.length; i += 25) {
      const q = uris.slice(i, i + 25).map(u => `uris=${encodeURIComponent(u)}`).join('&');
      const r = await fetch(`https://public.api.bsky.app/xrpc/app.bsky.feed.getPosts?${q}`);
      if (r.ok) posts.push(...(await r.json()).posts);
    }
    const order = new Map(uris.map((u, i) => [u, i]));
    const cards = posts.sort((a, b) => order.get(a.uri) - order.get(b.uri)).map(cardOf);
    paintBoard(el, cards, board);
  } catch {
    el.innerHTML = `<p class="faint">The board couldn't be loaded just now. You can still post, or
      <a href="https://bsky.app/hashtag/${BOARDS[board].hashtag.slice(1)}" target="_blank" rel="noopener">see
      ${esc(BOARDS[board].hashtag)} on Bluesky</a>.</p>`;
  }
}

function paintBoard(el, cards, board) {
  if (!cards.length) {
    el.innerHTML = `<p class="faint empty">Nothing here yet. ${account ? 'Be the first: post above.' : 'Sign in above to post the first one.'}</p>`;
    return;
  }
  el.innerHTML = `<ul class="board-list">${cards.map((c, i) => `<li class="bp bp-${board}" style="--i:${i}">
    <div class="bp-head">
      ${c.avatar ? `<img src="${esc(c.avatar)}" alt="">` : '<span class="dot"></span>'}
      <span><b>${esc(c.name)}</b> <span class="faint">@${esc(c.handle)}</span></span>
      ${c.category ? `<span class="cat">${esc(c.category)}</span>` : ''}
    </div>
    <p>${linkify(c.body)}</p>
    <div class="bp-foot">
      <time datetime="${esc(c.at)}">${esc(when(c.at))}</time>
      <a href="${esc(postUrl(c.did, c.rkey))}" target="_blank" rel="noopener">${c.replies ? `${c.replies} repl${c.replies === 1 ? 'y' : 'ies'} · ` : ''}Reply on Bluesky →</a>
      ${account?.did === c.did ? `<button type="button" class="linkish del" data-rkey="${esc(c.rkey)}">Delete</button>` : ''}
    </div></li>`).join('')}</ul>`;
}

const linkify = (s) => esc(s).replace(/https?:\/\/[^\s<]+/g, (u) => {
  const clean = u.replace(/[.,;:!?)]+$/, '');
  return `<a href="${clean}" target="_blank" rel="noopener nofollow">${clean.replace(/^https?:\/\//, '')}</a>${u.slice(clean.length)}`;
});
const when = (iso) => {
  const d = new Date(iso);
  return Number.isNaN(+d) ? '' : d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });
};

BIND.boards = (view) => {
  bindSignIn(view);
  const pickBoard = (id) => {
    state.board = id; save();
    $$('[data-board]', view).forEach(t => t.setAttribute('aria-selected', String(t.dataset.board === id)));
    $$('.board-name', view).forEach(n => { n.textContent = BOARDS[id].label; });
    const form = $('#f-board', view);
    if (form && form.board.value !== id) { form.board.value = id; form.dispatchEvent(new Event('change')); }
    loadBoard(id, view);
  };
  $$('[data-board]', view).forEach(t => { t.onclick = () => pickBoard(t.dataset.board); });
  $('#board', view).addEventListener('click', async (e) => {
    const b = e.target.closest('.del');
    if (!b || !confirmDelete(b)) return;
    try {
      await auth.deleteRecord(POST_NSID, b.dataset.rkey);
      b.closest('li').remove();
    } catch (x) { b.textContent = `Couldn't delete: ${x.message}`; }
  });
  loadBoard(state.board in BOARDS ? state.board : 'offer', view);

  const form = $('#f-board', view);
  if (!form) return;
  const fields = () => {
    const f = formData(form);
    return { board: f.board, category: f.category, text: f.text, link: f.reply === 'link' ? f.link : '' };
  };
  const sync = () => {
    const f = fields();
    const b = BOARDS[f.board];
    if (f.board !== state.board) {
      state.board = f.board; save();
      $$('[data-board]', view).forEach(t => t.setAttribute('aria-selected', String(t.dataset.board === f.board)));
      $$('.board-name', view).forEach(n => { n.textContent = b.label; });
      $('.ask', form).textContent = b.ask; $('.help', form).textContent = b.help;
      form.text.placeholder = b.placeholder;
      loadBoard(f.board, view);
    }
    $('.link-row', form).hidden = formData(form).reply !== 'link';
    const left = roomLeft(f) - graphemes(String(f.text || '').trim().replace(/\s+/g, ' '));
    const room = $('#room', form);
    room.textContent = left >= 0 ? `${left} characters left` : `${-left} characters too long`;
    room.classList.toggle('err', left < 0);
    $('#post-out', form).textContent = f.text.trim() ? boardText(f) : `${b.one}: …  ${b.hashtag}`;
    const bits = privateBits(`${f.text} ${f.link}`);
    const warn = $('#warn', form);
    warn.hidden = !bits.length;
    warn.innerHTML = bits.length ? `<b>Check before you post.</b> This looks like it includes
      ${[...new Set(bits.map(x => x.say))].map(esc).join(', ')}:
      ${bits.map(x => `<code>${esc(x.match)}</code>`).join(' ')}.
      The board is public. Remove it unless it's a public business contact you're happy for anyone to see.` : '';
  };
  form.addEventListener('input', sync);
  form.addEventListener('change', sync);
  sync();

  form.onsubmit = async (e) => {
    e.preventDefault();
    if (!form.ack.checked) { formError(form, new Error('Tick the box to confirm the post can be public.')); return; }
    $('.err', form).hidden = true;
    const f = fields();
    if (formData(form).reply === 'link' && !f.link.trim()) { formError(form, new Error('Add the public page, or choose replies on Bluesky.')); return; }
    let post;
    try { post = boardPost(f); } catch (x) { formError(form, x); return; }
    setBusy(form, true, 'Posting…');
    try {
      const res = await auth.createRecord(POST_NSID, post);
      const rkey = res.uri.split('/').pop();
      remember('board', res.uri, post.text.slice(0, 60), { board: f.board });
      $('#board-done', view).innerHTML = `<div class="done-card" role="status">
        <svg class="tick" viewBox="0 0 52 52" aria-hidden="true"><circle cx="26" cy="26" r="24"/><path d="M15 27l7 7 15-16"/></svg>
        <div><h3>Posted to the ${esc(BOARDS[f.board].label)} board</h3>
        <p><a href="${esc(postUrl(account.did, rkey))}" target="_blank" rel="noopener">See it on Bluesky</a> ·
        <button type="button" class="linkish" id="undo">Delete it</button> · Post to the other board too, or
        <a href="#tools">carry on →</a></p></div></div>`;
      $('#undo', view).onclick = async (ev) => {
        try { await auth.deleteRecord(POST_NSID, rkey); ev.target.closest('.done-card').querySelector('h3').textContent = 'Deleted'; }
        catch (x) { ev.target.textContent = `Couldn't delete: ${x.message}`; }
      };
      // show it at once; the feed catches up in a minute or two
      const list = $('.board-list', view) || (() => { $('#board', view).innerHTML = '<ul class="board-list"></ul>'; return $('.board-list', view); })();
      const tmp = document.createElement('div');
      paintBoard(tmp, [cardOf({ uri: res.uri, author: { did: account.did, handle: account.handle,
        displayName: account.displayName, avatar: account.avatar }, record: post })], f.board);
      list.prepend(tmp.querySelector('li'));
      form.text.value = ''; form.ack.checked = false; form.link.value = '';
      sync();
      setBusy(form, false, 'Post another');
    } catch (x) { formError(form, x); setBusy(form, false, 'Post to the board'); }
  };
};

function confirmDelete(btn) {
  if (btn.dataset.sure === '1') return true;
  btn.dataset.sure = '1';
  btn.textContent = 'Tap again to delete';
  setTimeout(() => { btn.dataset.sure = ''; btn.textContent = 'Delete'; }, 4000);
  return false;
}

/* ---------- tools ---------- */
const TOOLS = () => {
  const h = account ? encodeURIComponent(account.handle) : '';
  return [
    { group: 'Come back to', items: [
      { name: 'Offers and Needs boards', url: `${SITE}${HERE}#boards`, text: 'Read the boards and post to them.' },
      { name: 'Offers in your Bluesky app', url: 'https://bsky.app/profile/cultureblocs.com/feed/cn-offers', text: 'Pin the Offers board as a feed.' },
      { name: 'Needs in your Bluesky app', url: 'https://bsky.app/profile/cultureblocs.com/feed/cn-needs', text: 'Pin the Needs board as a feed.' },
      { name: 'The symposium', url: `${SITE}/events/${DIR}/2026/`, text: 'The day, and who said they were there.' },
    ] },
    { group: 'Edit and add', items: [
      { name: 'My creative persona', url: `${SITE}/persona/`, text: 'Edit your CreativeID.' },
      { name: 'Easel', url: `${SITE}/easel/`, text: 'Add works to your profile, with images.' },
      { name: 'Venue or organisation', url: `${SITE}/start/#venue`, text: "Update your organisation's profile." },
      { name: 'Publish an event', url: `${SITE}/start/#event`, text: 'Add an event in the shared calendar format.' },
      { name: 'My beads', url: `${SITE}/beads/`, text: 'All your blocs: search, edit, delete. Installs on your phone.' },
    ] },
    { group: 'See what you published', items: [
      ...(h ? [{ name: 'Your catalogue', url: `${SITE}/catalogue/?actor=${h}`, text: 'Your profile and works as a public page.' }] : []),
      ...(account ? [{ name: 'Raw records', url: `https://pdsls.dev/at://${account.did}`, text: 'Everything in your account, as data.' }] : []),
      { name: 'All CultureBlocs tools', url: `${SITE}/apps.html`, text: 'Including Loom, the local-first desk.' },
    ] },
  ];
};

PAGES.tools = () => {
  const n = state.made.filter(m => !account || m.did === account.did || !m.did).length;
  return `<section class="step-in">
    <h1 class="h">Your tools</h1>
    <p class="lede">${n ? `You made ${n} thing${n === 1 ? '' : 's'} in this browser. ` : ''}These tools all
    work with the same account. Bookmark this page, or save the links.</p>
    ${state.made.length ? `<ul class="made-list">${state.made.map(m => `<li class="mk-${esc(m.kind)}">
      <a href="${esc(m.kind === 'board' && m.did ? postUrl(m.did, m.uri.split('/').pop()) : viewer(m.uri))}" target="_blank" rel="noopener">
      <span class="k">${esc({ person: 'CreativeID', org: 'Organisation', bloc: 'Bloc', there: 'Symposium', board: m.board === 'need' ? 'Need' : 'Offer' }[m.kind] || m.kind)}</span>
      ${esc(m.label)}</a></li>`).join('')}</ul>` : ''}
    <div class="tool-actions">
      <button type="button" class="btn" id="bm">Download bookmarks</button>
      <button type="button" class="btn ghost" id="copy">Copy all links</button>
    </div>
    ${TOOLS().map((g, gi) => `<h2 class="sec">${esc(g.group)}</h2>
      <ul class="tools">${g.items.map((t, i) => `<li style="--i:${gi * 4 + i}">
        <a href="${esc(t.url)}"${t.url.startsWith(SITE + HERE) ? '' : ' target="_blank" rel="noopener"'}><b>${esc(t.name)}</b>
        <span>${esc(t.text)}</span><code>${esc(t.url.replace(/^https:\/\//, ''))}</code></a></li>`).join('')}</ul>`).join('')}
    <p class="note">Pass it on: <code>cultureblocs.com/w/cn</code> brings someone else to the start of this page.</p>
  </section>
  ${nav('tools', null)}`;
};

BIND.tools = (view) => {
  const all = TOOLS().flatMap(g => g.items);
  $('#copy', view).onclick = async (e) => {
    try { await navigator.clipboard.writeText(all.map(t => `${t.name}: ${t.url}`).join('\n')); e.target.textContent = 'Copied'; }
    catch { e.target.textContent = 'Copy failed'; }
  };
  $('#bm', view).onclick = () => {
    const groups = TOOLS().map(g => `<DT><H3>${esc(g.group)}</H3>\n<DL><p>\n${g.items.map(t =>
      `<DT><A HREF="${esc(t.url)}">${esc(t.name)}</A>`).join('\n')}\n</DL><p>`).join('\n');
    const html = `<!DOCTYPE NETSCAPE-Bookmark-file-1>\n<META HTTP-EQUIV="Content-Type" CONTENT="text/html; charset=UTF-8">\n` +
      `<TITLE>Bookmarks</TITLE>\n<H1>Bookmarks</H1>\n<DL><p>\n<DT><H3>CultureBlocs · Creative Spaces Symposium</H3>\n<DL><p>\n${groups}\n</DL><p>\n</DL><p>\n`;
    const a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob([html], { type: 'text/html' }));
    a.download = 'cultureblocs-creative-newham.html';
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 2000);
  };
};

/* ===================================================== boot */
async function boot() {
  let route = current();
  if (auth.pendingCallback()) {
    try {
      await auth.completeLogin();
      route = sessionStorage.getItem('newham:return') || 'you';
    } catch (x) {
      route = 'account';
      setTimeout(() => {
        const err = $('form.signin .err');
        if (err) { err.textContent = x.message; err.hidden = false; }
      }, 50);
    }
    sessionStorage.removeItem('newham:return');
  }
  await loadAccount().catch(() => {});
  if (account && !state.me && route !== 'org') { state.me = account.handle; save(); }
  paintWho();
  if (!route) route = 'guide';
  if (location.hash !== `#${route}`) history.replaceState({}, '', `${location.pathname}#${route}`);
  show(route);
}
boot();
