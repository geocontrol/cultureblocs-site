/* My creative persona: sign in with your own Atmosphere account and publish
 * one com.cultureblocs.creative.profile record (rkey "self") to it.
 *
 * The web version of CreativeID Studio's profile, for people who can't or
 * don't want to install the studio. Nothing is kept on this site: the
 * record is read from and written to the person's own server, through
 * OAuth (went/lib/oauth.js) with permission to touch only this record type
 * where the server supports permissions that narrow. */
import * as oauth from '../went/lib/oauth.js';
import { getRecord, identify, profileCard } from '../went/lib/repo.js';
import { BIO_MAX, NSID, RKEY, formFrom, graphemes, parseDisciplines, toRecord, unchanged, validate } from './lib/profile.js';

const $ = (id) => document.getElementById(id);
const show = (el, on = true) => { if (el) el.hidden = !on; };
const SCOPE = `atproto repo:${NSID}?action=create&action=update`;
const DRAFT = 'persona:draft';
const RETRIED = 'persona:retried';
const FIELDS = ['name', 'bio', 'disciplines', 'based', 'website'];

const st = { me: null, existing: null, cid: null, signingIn: false };

function say(html) { $('status').innerHTML = html; show($('status'), Boolean(html)); }
function fail(el, msg) { el.textContent = msg || ''; show(el, Boolean(msg)); }
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

/* ---------- the form ---------- */
const readForm = () => Object.fromEntries(FIELDS.map((f) => [f, $(`f-${f}`).value]));
function fillForm(form) { for (const f of FIELDS) $(`f-${f}`).value = form[f] || ''; refresh(); }

function showErrors(errs) {
  for (const f of FIELDS) {
    const e = errs.find((x) => x.field === f);
    fail($(`e-${f}`), e?.message);
    $(`f-${f}`).setAttribute('aria-invalid', e ? 'true' : 'false');
  }
}
function refresh() {
  const n = graphemes($('f-bio').value.trim());
  $('c-bio').textContent = n > BIO_MAX * 0.8 ? `${n} / ${BIO_MAX}` : '';
  $('c-bio').classList.toggle('over', n > BIO_MAX);
}
$('form').addEventListener('input', () => {
  refresh();
  try { sessionStorage.setItem(DRAFT, JSON.stringify(readForm())); } catch {}
});

/* ---------- sign in ---------- */
async function signIn(handle) {
  const h = String(handle || '').trim().replace(/^@/, '');
  if (!h) return 'Enter your handle. It looks like name.bsky.social.';
  st.signingIn = true;
  try {
    await oauth.startLogin(h, sessionStorage.getItem(RETRIED) ? 'atproto transition:generic' : SCOPE);
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
  await oauth.signOut();
  sessionStorage.removeItem(DRAFT);
  st.me = null; st.existing = null; st.cid = null;
  showSignIn();
});

function showSignIn(msg) {
  show($('app'), false); show($('hero'));
  say(msg ? `<p>${esc(msg)}</p>` : '');
  show($('signin'));
  $('go').disabled = false; $('go').textContent = 'Sign in';
  if (st.me?.handle) $('handle').value = st.me.handle;
  $('handle').focus();
}
function needsSignIn(msg) {
  if (st.me?.handle) $('handle').value = st.me.handle;
  showSignIn(msg);
}

/* ---------- permissions ---------- */
function canWrite(scope) {
  const s = new Set(String(scope || '').split(/\s+/));
  if (s.has('transition:generic')) return true;
  return [...s].some((x) => x === 'repo:*' || x.startsWith('repo:*?') || x.startsWith(`repo:${NSID}`)
    || (x.startsWith('repo?') && x.includes(`collection=${NSID}`)));
}
const scopeProblem = (err) => err?.status === 403 || /scope|forbidden|insufficient/i.test(`${err?.code} ${err?.message}`);

/* ---------- publish ---------- */
$('form').addEventListener('submit', async (e) => {
  e.preventDefault();
  fail($('publish-error'), '');
  const form = readForm();
  const errs = validate(form);
  showErrors(errs);
  if (errs.length) { $(`f-${errs[0].field}`).focus(); return; }
  if (unchanged(form, st.existing)) return fail($('publish-error'), 'Nothing has changed since it was last published.');

  const s = oauth.session();
  if (!s || s.did !== st.me.did) return needsSignIn('Your sign-in has ended. Sign in again to publish; what you typed is kept.');
  if (!canWrite(s.scope)) return needsSignIn('This needs your permission to change your creative profile. Sign in again to give it; what you typed is kept.');

  const btn = $('publish');
  btn.disabled = true; btn.textContent = 'Publishing…';
  try {
    const record = toRecord(form, st.existing);
    const res = await oauth.putRecord(NSID, RKEY, record, st.cid || undefined);
    const first = !st.existing;
    st.existing = record; st.cid = res.cid;
    sessionStorage.removeItem(DRAFT);
    sessionStorage.removeItem(RETRIED);
    showDone(res.uri, first);
  } catch (err) {
    if (err?.code === 'InvalidSwap' || /swap/i.test(err?.message || '')) {
      fail($('publish-error'), 'Your profile was changed somewhere else since this page loaded, so nothing was published. Reload the page to see the latest, then make your change again.');
    } else if (/not signed in|session expired/i.test(err?.message || '')) {
      return needsSignIn('Your sign-in has ended. Sign in again to publish; what you typed is kept.');
    } else if (scopeProblem(err) && !sessionStorage.getItem(RETRIED)) {
      sessionStorage.setItem(RETRIED, '1');
      return needsSignIn('Your account’s server needs a broader permission for this. Sign in again; what you typed is kept.');
    } else {
      fail($('publish-error'), `Not published: ${err?.message || err}. Nothing has changed in your account. Try again.`);
    }
  } finally {
    btn.disabled = false; btn.textContent = 'Publish';
  }
});

function wallLabel(r) {
  const sub = [(r.disciplines || []).join(', '), r.based?.name].filter(Boolean).join(' · ');
  return `<p class="pp-name">${esc(r.name)}</p>${sub ? `<p class="pp-sub">${esc(sub)}</p>` : ''}${r.bio ? `<p class="pp-bio">${esc(r.bio)}</p>` : ''}`;
}
function showDone(uri, first) {
  show($('form'), false);
  $('done-title').textContent = first ? 'Published.' : 'Updated.';
  $('done-text').textContent = first
    ? 'Your creative persona is now in your own account. Directories that read CultureBlocs records will find it by themselves.'
    : 'The new version is in your account.';
  $('label').innerHTML = wallLabel(st.existing);
  $('done-record').href = `https://pdsls.dev/${uri}`;
  show($('done'));
  $('done').focus();
}
$('edit-again').addEventListener('click', () => {
  show($('done'), false);
  fillForm(formFrom(st.existing));
  showExistingNote();
  show($('form'));
  $('f-name').focus();
});
function showExistingNote() {
  const note = $('existing-note');
  note.textContent = st.existing
    ? 'This is your creative profile as it is now. Change what you like and publish again; anything this page doesn’t show is kept.'
    : '';
  show(note, Boolean(st.existing));
}

/* ---------- start ---------- */
window.addEventListener('beforeunload', (e) => {
  if (!st.signingIn && st.me && !$('form').hidden && !unchanged(readForm(), st.existing)
      && FIELDS.some((f) => $(`f-${f}`).value.trim())) { e.preventDefault(); e.returnValue = ''; }
});

async function boot() {
  let s = oauth.session();
  if (oauth.pendingCallback()) {
    say('<p>Finishing sign-in…</p>');
    try {
      s = await oauth.completeLogin();
    } catch (e) {
      return showSignIn(`Sign-in didn’t finish: ${e.message}`);
    }
  }
  if (!s) return showSignIn();

  say('<p>Fetching your creative profile…</p>');
  try {
    const who = await identify(s.did);
    st.me = { did: s.did, handle: who.handle || s.handle, pds: who.pds || s.pds };
    const [rec, card] = await Promise.all([
      getRecord(st.me.pds, s.did, NSID, RKEY),
      profileCard(s.did).catch(() => null),
    ]);
    st.existing = rec?.value || null;
    st.cid = rec?.cid || null;
    if (card?.avatar) { $('me-avatar').src = card.avatar; show($('me-avatar')); }
    st.card = card;
  } catch (e) {
    return showSignIn(`Your account couldn’t be read: ${e.message}. Check your connection and sign in again.`);
  }

  let draft = null;
  try { draft = JSON.parse(sessionStorage.getItem(DRAFT) || 'null'); } catch {}
  const start = draft || formFrom(st.existing);
  // A first-timer starts from their Bluesky display name, if they have one.
  if (!draft && !st.existing && st.card?.displayName) start.name = st.card.displayName;
  fillForm(start);
  showExistingNote();

  $('me-handle').textContent = `@${st.me.handle}`;
  say('');
  show($('signin'), false);
  show($('app'));
  $('f-name').focus();
}

boot();
