/* "I went" — the composer's only impure module.
 *
 * Order of the visit: load the event → choose the day → write a note →
 * name your account (we look it up publicly) → preview → sign in and
 * publish. Writing comes before signing in on purpose, and the draft is
 * kept in sessionStorage across the OAuth redirect so nothing typed is lost.
 *
 * Arrives as /went/?dir=<directory>&event=<at:// uri>. Returns from OAuth
 * as /went/?code=…&state=… with everything else in the saved draft.
 */
import * as oauth from './lib/oauth.js';
import { cleanHandle, getRecord, identify, listBeads, postsToBluesky, profileCard } from './lib/repo.js';
import {
  EVENT_NSID, BEAD_NSID, POST_NSID, KINDS, NOTE_MAX, POST_MAX, SITE,
  buildBead, buildPost, covers, dayOptions, defaultPostText, findExisting, graphemes,
  kindFor, parseAtUri, scopesFor, todayInLondon, validDirectory,
} from './lib/compose.js';
import { dateLabel, dayLabel, groupOf, shape } from '../events/lib/schedule.js';
import { esc } from '../events/lib/render.js';

const $ = (id) => document.getElementById(id);
const DRAFT = 'went:draft';
const RETRIED = 'went:retried';

const ui = {
  status: $('status'), form: $('compose'), card: $('event-card'), chips: $('day-chips'),
  picker: $('day-picker'), dayInput: $('day-input'), note: $('note'), noteCount: $('note-count'),
  kind: $('kind'), signed: $('who-signed'), ask: $('who-ask'), handle: $('handle'),
  find: $('find'), whoError: $('who-error'), whoHandle: $('who-handle'), whoAvatar: $('who-avatar'),
  preview: $('preview'), beadPreview: $('bead-preview'), dupe: $('dupe'), bsky: $('bsky'),
  post: $('post'), postBox: $('post-box'), postText: $('post-text'), postCount: $('post-count'),
  perm: $('perm-note'), publish: $('publish'), pubError: $('pub-error'), done: $('done'),
  crumbs: $('crumbs'),
};

/* Everything the page knows, in one place. */
const st = {
  ctx: null,          // { event:{uri,cid,value}, entry, listing, dir, eventUrl, pageUrl, tags }
  day: null,
  acct: null,         // { did, pds, handle, hasBsky, beads, profile }
  postEdited: false,
};

const show = (el, on = true) => { el.hidden = !on; };
const say = (html) => { ui.status.innerHTML = html; show(ui.status, Boolean(html)); };
const fail = (el, msg) => { el.textContent = msg || ''; show(el, Boolean(msg)); };

/* ---------- loading the event ---------- */
async function loadContext(eventUri, dir) {
  const at = parseAtUri(eventUri);
  if (!at || at.collection !== EVENT_NSID) throw new Error('That link doesn’t point at an event.');
  let listing = null, entry = null;
  if (dir) {
    try {
      const r = await fetch(`/events/${dir}/events.json`, { cache: 'no-cache' });
      if (r.ok) listing = await r.json();
    } catch { /* the event can stand alone */ }
    entry = listing?.records?.find(e => e.rkey === at.rkey) || null;
  }
  let event = null;
  try {
    const pub = await identify(at.authority);
    const rec = await getRecord(pub.pds, pub.did, at.collection, at.rkey);
    if (rec) event = { uri: rec.uri, cid: rec.cid, value: rec.value, publisher: pub };
  } catch { /* fall back to the listing below */ }
  if (!event && entry) event = { uri: entry.atUri || eventUri, cid: entry.cid, value: entry.record };
  if (!event) throw new Error('That event couldn’t be found. It may have been withdrawn.');
  const dirBase = dir ? `/events/${dir}/` : null;
  return {
    event, entry, listing, dir,
    pageUrl: entry ? `${dirBase}${entry.slug}/` : null,
    eventUrl: entry ? `${SITE}${dirBase}${entry.slug}/` : null,
    dirUrl: dirBase,
    dirName: listing?.meta?.name || null,
    tags: [listing?.meta?.tag].filter(Boolean),
  };
}

function rangeLabel(record) {
  const sh = shape(record);
  if (!sh) return '';
  if (sh.days === 1) return `${dayLabel(sh.start.date)}${sh.openStart ? '' : ` · ${sh.start.time}`}`;
  if (sh.running) return `${dateLabel(sh.start.date)} – ${dateLabel(sh.endDate)}`;
  return `${dayLabel(sh.start.date)} – ${dayLabel(sh.endDate)}`;
}

function venueOf(record) {
  const loc = (record?.locations || []).find(l => l?.name || l?.street);
  return loc ? loc.name || loc.street : '';
}

function renderEvent() {
  const { event, entry, pageUrl } = st.ctx;
  const r = event.value || {};
  const group = groupOf(entry?.category) || 'fairs';
  ui.card.innerHTML = `<article class="ev ev-${esc(group)}">
    <div class="ev-when">${esc(rangeLabel(r))}</div>
    <div class="ev-body"><h3>${esc(r.name)}</h3>
      ${venueOf(r) ? `<p class="ev-where">${esc(venueOf(r))}</p>` : ''}
      ${pageUrl ? `<p class="ev-links"><a href="${esc(pageUrl)}">about this event →</a></p>` : ''}
    </div></article>`;
  if (st.ctx.dirUrl) {
    ui.crumbs.innerHTML = `<a href="/events/">Events</a> / <a href="${esc(st.ctx.dirUrl)}">`
      + `${esc(st.ctx.dirName || 'Directory')}</a> / I went`;
  }
  document.title = `I went to ${r.name} — CultureBlocs`;
}

/* ---------- the day ---------- */
function renderDays(preferred) {
  const opts = dayOptions(st.ctx.event.value, todayInLondon());
  if (opts.status === 'future') {
    say(`<h2>Not yet</h2><p>${esc(st.ctx.event.value.name)} opens on
      ${esc(dayLabel(opts.opens))}. Come back once you’ve been — this page will be
      ready.</p>${st.ctx.dirUrl ? `<p><a href="${esc(st.ctx.dirUrl)}">See the rest of the programme →</a></p>` : ''}`);
    return false;
  }
  if (opts.status !== 'ok') throw new Error('This event’s dates couldn’t be read.');
  const want = preferred && preferred >= opts.min && preferred <= opts.max ? preferred : opts.initial;
  if (opts.mode === 'chips') {
    ui.chips.innerHTML = opts.days.map(d =>
      `<button type="button" class="chip" role="radio" data-day="${d.date}"
        aria-checked="${d.date === want}">${esc(d.label)}</button>`).join('');
    show(ui.chips); show(ui.picker, false);
  } else {
    ui.dayInput.min = opts.min; ui.dayInput.max = opts.max; ui.dayInput.value = want;
    show(ui.chips, false); show(ui.picker);
  }
  st.day = want;
  return true;
}

ui.chips.addEventListener('click', (e) => {
  const chip = e.target.closest('[data-day]');
  if (!chip) return;
  st.day = chip.dataset.day;
  ui.chips.querySelectorAll('[data-day]').forEach(c =>
    c.setAttribute('aria-checked', String(c === chip)));
  refresh();
});
ui.dayInput.addEventListener('change', () => {
  const v = ui.dayInput.value;
  if (v && v >= ui.dayInput.min && v <= ui.dayInput.max) st.day = v;
  refresh();
});

/* ---------- note, kind, post text ---------- */
function counter(el, text, max) {
  const n = graphemes(text);
  el.textContent = n ? `${n} / ${max}` : '';
  el.classList.toggle('over', n > max);
  return n <= max;
}

ui.note.addEventListener('input', () => {
  if (!st.postEdited) ui.postText.value = defaultPostText({ name: st.ctx.event.value.name, note: ui.note.value });
  refresh();
});
ui.kind.addEventListener('change', refresh);
ui.postText.addEventListener('input', () => { st.postEdited = true; refresh(); });
ui.post.addEventListener('change', () => { show(ui.postBox, ui.post.checked); refresh(); });

/* ---------- the account ---------- */
async function lookUp(handleOrDid) {
  fail(ui.whoError, '');
  ui.find.disabled = true;
  ui.find.textContent = 'Looking…';
  try {
    const who = await identify(handleOrDid);
    const [hasBsky, beads, profile] = await Promise.all([
      postsToBluesky(who.pds, who.did).catch(() => false),
      listBeads(who.pds, who.did).catch(() => []),
      profileCard(who.did),
    ]);
    st.acct = { ...who, hasBsky, beads, profile };
    renderAccount();
  } catch (e) {
    st.acct = null;
    fail(ui.whoError, e.message || 'That account couldn’t be found.');
  } finally {
    ui.find.disabled = false;
    ui.find.textContent = 'Continue';
  }
}

function renderAccount() {
  const a = st.acct;
  const s = oauth.session();
  const signedIn = Boolean(a && s && s.did === a.did);
  show(ui.signed, Boolean(a)); show(ui.ask, !a);
  if (a) {
    ui.whoHandle.textContent = `@${a.handle}`;
    ui.signed.querySelector('.who span').firstChild.textContent = signedIn ? 'Signed in as ' : 'Publishing as ';
    if (a.profile?.avatar) { ui.whoAvatar.src = a.profile.avatar; show(ui.whoAvatar); }
    else show(ui.whoAvatar, false);
    $('sign-out').textContent = signedIn ? 'Not you? Sign out' : 'Change';
  }
  show(ui.bsky, Boolean(a?.hasBsky));
  if (!a?.hasBsky) ui.post.checked = false;
  show(ui.postBox, ui.post.checked);
  show(ui.preview, Boolean(a));
  refresh();
}

ui.find.addEventListener('click', () => lookUp(ui.handle.value));
ui.handle.addEventListener('keydown', (e) => {
  if (e.key === 'Enter') { e.preventDefault(); lookUp(ui.handle.value); }
});
$('sign-out').addEventListener('click', async () => {
  if (oauth.session()) await oauth.signOut();
  st.acct = null;
  ui.handle.value = '';
  renderAccount();
  ui.handle.focus();
});

/* ---------- preview ---------- */
function refresh() {
  if (!st.ctx) return;
  const noteOk = counter(ui.noteCount, ui.note.value, NOTE_MAX);
  const postOk = !ui.post.checked || (counter(ui.postCount, ui.postText.value, POST_MAX)
    && ui.postText.value.trim().length > 0);
  const kindLabel = (KINDS.find(k => k[0] === ui.kind.value) || KINDS[0])[1];
  const note = ui.note.value.trim();
  ui.beadPreview.innerHTML = `
    <dt>Event</dt><dd>${esc(st.ctx.event.value.name)}</dd>
    <dt>Day</dt><dd>${st.day ? esc(dayLabel(st.day)) : '—'}</dd>
    <dt>Kind</dt><dd>${esc(kindLabel)}</dd>
    <dt>Note</dt><dd>${note ? esc(note) : '<span class="hint">none</span>'}</dd>
    ${st.acct ? `<dt>Account</dt><dd>@${esc(st.acct.handle)}</dd>` : ''}`;
  const dup = st.acct && st.day
    ? findExisting(st.acct.beads, st.ctx.event.uri, st.day,
      [st.ctx.event.publisher?.did, st.ctx.event.publisher?.handle]) : null;
  st.existing = dup;
  ui.dupe.textContent = dup
    ? `You already recorded this event on ${dayLabel(st.day)} — publishing will update that bead rather than add a second.`
    : '';
  show(ui.dupe, Boolean(dup));

  const s = oauth.session();
  const ready = Boolean(st.acct && s && s.did === st.acct.did && covers(s.scope, { post: ui.post.checked }));
  ui.publish.textContent = dup ? (ready ? 'Update' : 'Sign in & update') : (ready ? 'Publish' : 'Sign in & publish');
  ui.perm.textContent = ready ? ''
    : `Next you’ll approve this on your account’s own sign-in page. CultureBlocs asks only to write beads${
      ui.post.checked ? ' and this one post' : ''} — your password never comes here.`;
  ui.publish.disabled = !(st.acct && st.day && noteOk && postOk);
}

/* ---------- drafts ---------- */
function readForm() {
  return {
    given: st.ctx.event.uri, dir: st.ctx.dir, day: st.day,
    note: ui.note.value, kind: ui.kind.value,
    post: ui.post.checked, postText: ui.postText.value, postEdited: st.postEdited,
    handle: st.acct?.handle, did: st.acct?.did,
  };
}
const saveDraft = (d) => sessionStorage.setItem(DRAFT, JSON.stringify(d));
const loadDraft = () => { try { return JSON.parse(sessionStorage.getItem(DRAFT) || 'null'); } catch { return null; } };

function fillForm(d) {
  ui.note.value = d.note || '';
  if (d.kind) ui.kind.value = d.kind;
  ui.post.checked = Boolean(d.post);
  st.postEdited = Boolean(d.postEdited);
  ui.postText.value = d.postText || defaultPostText({ name: st.ctx.event.value.name, note: d.note });
}

/* ---------- publishing ---------- */
ui.form.addEventListener('submit', async (e) => {
  e.preventDefault();
  if (ui.publish.disabled) return;
  const draft = readForm();
  saveDraft(draft);
  const s = oauth.session();
  if (s && s.did === st.acct.did && covers(s.scope, { post: draft.post })) return publish(draft);
  await signInThenPublish(draft);
});

async function signInThenPublish(draft, scope) {
  saveDraft({ ...draft, autopublish: true });
  ui.publish.disabled = true;
  ui.publish.textContent = 'Opening your sign-in…';
  try {
    await oauth.startLogin(draft.handle, scope || scopesFor({ post: draft.post }));
  } catch (err) {
    fail(ui.pubError, `Couldn’t start sign-in: ${err.message}`);
    refresh();
  }
}

const scopeProblem = (err) => err?.status === 403
  || /scope|forbidden|insufficient/i.test(`${err?.code} ${err?.message}`);

async function publish(draft) {
  fail(ui.pubError, '');
  ui.publish.disabled = true;
  ui.publish.textContent = 'Publishing…';
  const s = oauth.session();
  const { event, entry, eventUrl, tags } = st.ctx;

  let beadUri;
  try {
    const fresh = await listBeads(s.pds, s.did).catch(() => st.acct?.beads || []);
    const existing = findExisting(fresh, event.uri, draft.day,
      [event.publisher?.did, event.publisher?.handle]);
    const bead = buildBead({ event, day: draft.day, note: draft.note, kind: draft.kind, tags, eventUrl });
    const res = existing
      ? await oauth.putRecord(BEAD_NSID, existing.rkey, bead)
      : await oauth.createRecord(BEAD_NSID, bead);
    beadUri = res.uri;
  } catch (err) {
    if (scopeProblem(err) && !sessionStorage.getItem(RETRIED)) {
      // The server accepted narrow permissions but won't honour them: go broad, once.
      sessionStorage.setItem(RETRIED, '1');
      if (s.issuer) oauth.markGenericOnly(s.issuer);
      await oauth.signOut();
      return signInThenPublish(draft, 'atproto transition:generic');
    }
    fail(ui.pubError, `Your bead wasn’t saved: ${err.message}. Nothing was published — try again.`);
    refresh();
    return;
  }

  let postUri = null, postError = null;
  if (draft.post) {
    try {
      let thumb;
      if (entry && st.ctx.pageUrl) {
        try {
          const img = await fetch(`${st.ctx.pageUrl}og.png`);
          if (img.ok) thumb = await oauth.uploadBlob(await img.blob());
        } catch { /* a card without a picture is fine */ }
      }
      const post = buildPost({
        text: draft.postText, eventUrl: eventUrl || undefined,
        title: event.value.name, description: rangeLabel(event.value) + (venueOf(event.value) ? ` · ${venueOf(event.value)}` : ''),
        thumb, tags,
      });
      postUri = (await oauth.createRecord(POST_NSID, post)).uri;
    } catch (err) {
      postError = err.message;
    }
  }

  sessionStorage.removeItem(DRAFT);
  sessionStorage.removeItem(RETRIED);
  done({ beadUri, postUri, postError, draft, handle: s.handle || draft.handle, did: s.did });
}

function done({ beadUri, postUri, postError, draft, handle, did }) {
  const name = st.ctx.event.value.name;
  const beadRkey = String(beadUri).split('/').pop();
  const postRkey = postUri ? String(postUri).split('/').pop() : null;
  show(ui.form, false); say('');
  ui.done.innerHTML = `
    <h2>You went to ${esc(name)}.</h2>
    <p>Your bead for <b>${esc(dayLabel(draft.day))}</b> is saved in
    <b>@${esc(handle)}</b>’s own repository. It points at the event, so it will
    show up wherever this programme is read.</p>
    ${postUri ? '<p>Your post is up on Bluesky.</p>' : ''}
    ${postError ? `<p class="went-error">The bead is saved, but the Bluesky post didn’t go: ${esc(postError)}</p>` : ''}
    <div class="links">
      <a href="https://pdsls.dev/at/${esc(did)}/${BEAD_NSID}/${esc(beadRkey)}" rel="noopener">see the record →</a>
      ${postRkey ? `<a href="https://bsky.app/profile/${esc(did)}/post/${esc(postRkey)}" rel="noopener">see your post →</a>` : ''}
      ${st.ctx.dirUrl ? `<a href="${esc(st.ctx.dirUrl)}">back to ${esc(st.ctx.dirName || 'the programme')} →</a>` : ''}
    </div>
    <p>Went to something else too? Pick it from the programme and do the same —
    each one becomes another bead. And if you’d like to do more with them —
    add photos, string a day together — that’s what <a href="/apps.html">Loom</a>
    is for. It picks these up from your account.</p>`;
  show(ui.done);
  ui.done.scrollIntoView({ block: 'start' });
}

/* ---------- start ---------- */
function fillKinds(category) {
  ui.kind.innerHTML = KINDS.map(([v, label]) => `<option value="${v}">${esc(label)}</option>`).join('');
  ui.kind.value = kindFor(category);
}

async function boot() {
  let draft = null;
  let returning = false;
  let returnError = null;

  if (oauth.pendingCallback()) {
    returning = true;
    draft = loadDraft();
    try {
      await oauth.completeLogin();
    } catch (err) {
      returnError = err.message;
    }
  } else {
    const q = new URLSearchParams(location.search);
    const given = q.get('event');
    if (!given) {
      say(`<h2>Pick an event first</h2><p>Open a programme and choose
        <b>I went</b> on anything you were at.</p><p><a href="/events/">Browse the events →</a></p>`);
      return;
    }
    const dir = validDirectory(q.get('dir')) ? q.get('dir') : null;
    draft = { given, dir };
    const saved = loadDraft();
    if (saved && saved.given === given) draft = { ...saved, autopublish: false };
  }

  if (!draft?.given) {
    say(`<h2>Signed in</h2><p>But the note you were writing wasn’t found in this
      browser tab. Open the event again and you’ll go straight to publishing.</p>
      <p><a href="/events/">Browse the events →</a></p>`);
    return;
  }

  try {
    st.ctx = await loadContext(draft.given, draft.dir);
  } catch (err) {
    say(`<h2>Can’t find that event</h2><p>${esc(err.message)}</p><p><a href="/events/">Browse the events →</a></p>`);
    return;
  }
  if (returning) {
    const q = new URLSearchParams({ event: draft.given, ...(draft.dir ? { dir: draft.dir } : {}) });
    history.replaceState(null, '', `${location.pathname}?${q}`);
  }

  renderEvent();
  fillKinds(st.ctx.entry?.category);
  ui.postText.value = defaultPostText({ name: st.ctx.event.value.name, note: '' });
  if (draft.note !== undefined) fillForm(draft);
  if (!renderDays(draft.day)) return;
  say('');
  show(ui.form);

  const s = oauth.session();
  ui.handle.value = s?.handle || draft.handle || '';
  const who = s?.did || draft.handle || draft.did;
  if (who) await lookUp(who);
  if (st.acct && s && s.did === st.acct.did && s.handle) st.acct.handle = s.handle;
  renderAccount();

  if (returnError) {
    fail(ui.pubError, `Sign-in didn’t finish: ${returnError}. Your note is still here — try again.`);
    return;
  }
  if (returning && draft.autopublish) {
    const now = oauth.session();
    if (!now) return fail(ui.pubError, 'Sign-in didn’t finish. Your note is still here — try again.');
    if (!covers(now.scope, { post: draft.post })) {
      if (!sessionStorage.getItem(RETRIED)) {
        sessionStorage.setItem(RETRIED, '1');
        if (now.issuer) oauth.markGenericOnly(now.issuer);
        return signInThenPublish({ ...draft, handle: now.handle || draft.handle }, 'atproto transition:generic');
      }
      return fail(ui.pubError, 'Your account didn’t grant permission to write the bead. Try signing in again.');
    }
    await publish({ ...readForm(), handle: now.handle || draft.handle });
  }
}

boot().catch((err) => {
  say(`<h2>Something went wrong</h2><p>${esc(err?.message || err)}. Please reload the page.</p>`);
});
