/* "My week": one person's beads for a directory, as a page anyone can
 * open — and, for the person themselves, a way to publish them as a strand.
 *
 *   /week/?dir=frieze-week-london                 asks whose week
 *   /week/?dir=frieze-week-london&who=<handle>    shows it (public data only)
 *
 * Publishing signs in with this app's own OAuth client (week/client-
 * metadata.json; <meta name="oauth-store" content="week">), writes one
 * com.cultureblocs.strand to the person's own repository, and finds it
 * again next time by its link to the directory page — so it updates
 * rather than duplicates. The draft survives the sign-in redirect.
 */
import * as oauth from '../went/lib/oauth.js';
import { identify, listBeads, postsToBluesky, profileCard } from '../went/lib/repo.js';
import { NARRATIVE_MAX, STRAND_NSID, buildStrand, coversStrand, defaultWeekPost, findExistingStrand, strandScopes } from './lib/strand.js';
import { POST_MAX, POST_NSID, buildPost, graphemes, validDirectory } from '../went/lib/compose.js';
import { belongsTo, canonicalise, personWeek } from '../events/lib/report.js';
import { listCollection } from '../events/lib/atproto.js';
import { groupOf } from '../events/lib/schedule.js';
import { hider } from '../events/lib/went.js';
import { verbOf } from '../events/lib/verb.js';
import { actorPath, esc } from '../events/lib/render.js';

const SITE = 'https://www.cultureblocs.com';
const DRAFT = 'week:draft';
const RETRIED = 'week:retried';
const $ = (id) => document.getElementById(id);
const show = (el, on = true) => { el.hidden = !on; };
const say = (html) => { $('status').innerHTML = html; show($('status'), Boolean(html)); };
const fail = (el, msg) => { el.textContent = msg || ''; show(el, Boolean(msg)); };
const KIND = { visit: 'a visit', performance: 'a performance or talk', screening: 'a screening', dwell: 'time with one thing', bloc: 'a marked moment' };
const COLOUR = { fairs: '#2B4BC7', talks: '#C74E2B', exhibitions: '#2E7A4F', galleries: '#C7860F', nights: '#5B2BC7' };

const st = { dir: null, listing: null, person: null, beads: [], existing: null, week: null, postEdited: false };

/* ---------- loading ---------- */
async function loadListing(dir) {
  const r = await fetch(`/events/${dir}/events.json`, { cache: 'no-cache' });
  if (!r.ok) throw new Error('That programme couldn’t be found.');
  return r.json();
}
async function hiddenList() {
  try { const r = await fetch('/events/hidden.json', { cache: 'no-cache' }); return hider(r.ok ? await r.json() : null); }
  catch { return hider(null); }
}

async function loadPerson(who) {
  const person = await identify(who);
  const [records, strands, hasBsky, profile, hidden] = await Promise.all([
    listBeads(person.pds, person.did, { maxPages: 10 }),
    listCollection(person.pds, person.did, STRAND_NSID).catch(() => []),
    postsToBluesky(person.pds, person.did).catch(() => false),
    profileCard(person.did),
    hiddenList(),
  ]);
  if (hidden(person.did, '')) throw new Error('This week isn’t shown here.');
  const meta = st.listing.meta || {};
  const ours = canonicalise(st.listing, records.filter(belongsTo(st.listing, [meta.did, meta.repo])))
    .map(r => ({ ...r, did: person.did }));
  return { person: { ...person, hasBsky, profile }, beads: ours, existing: findExistingStrand(strands, weekUrl()) };
}

const weekUrl = () => `${SITE}/events/${st.dir}/`;
const shareUrl = () => `${SITE}/week/?dir=${encodeURIComponent(st.dir)}&who=${encodeURIComponent(st.person.handle)}`;
const dirName = () => st.listing?.meta?.name || 'the programme';
const nameOf = () => st.person.profile?.displayName || `@${st.person.handle}`;

/* ---------- the week ---------- */
function thread(week) {
  const items = week.days.flatMap((d, di) => d.items.map((x, i) => ({ ...x, day: d, first: i === 0, di })));
  if (!items.length) return '';
  const step = 46, gap = 30, pad = 24, y = 34;
  let x = pad;
  const dots = [];
  const labels = [];
  items.forEach((it, i) => {
    if (i > 0 && it.first) x += gap;
    if (it.first) labels.push(`<text x="${x}" y="${y + 36}" font-size="11" fill="#8A8880" font-family="ui-monospace,Menlo,monospace">${esc(it.day.label.replace(' Oct', ''))}</text>`);
    const c = COLOUR[groupOf(it.event?.category)] || '#4A4741';
    dots.push(`<circle cx="${x + 10}" cy="${y}" r="10" fill="${c}" stroke="#FAFAF9" stroke-width="2"><title>${esc(it.event?.record?.name || 'An event')} — ${esc(it.day.label)}</title></circle>`);
    x += step;
  });
  const w = Math.max(x + pad - step + 20, 200);
  return `<svg viewBox="0 0 ${w} 80" width="${w}" height="80" role="img" aria-label="${items.length} beads across ${week.days.length} days">
    <line x1="${pad - 8}" y1="${y}" x2="${w - pad + 8}" y2="${y}" stroke="#C9C7C0" stroke-width="2"/>${dots.join('')}${labels.join('')}</svg>`;
}

function renderWeek() {
  const week = personWeek({ listing: st.listing, beads: st.beads });
  st.week = week;
  $('wk-title').textContent = `${nameOf()}’s ${dirName()}.`;
  $('wk-lede').innerHTML = `Told in beads kept in <b>@${esc(st.person.handle)}</b>’s own account.`;
  document.title = `${nameOf()}’s ${dirName()} — CultureBlocs`;
  $('crumbs').innerHTML = `<a href="/events/">Events</a> / <a href="/events/${esc(st.dir)}/">${esc(dirName())}</a> / ${esc(nameOf())}`;
  if (!week.beads) {
    say(`<h2>No beads here yet</h2><p>@${esc(st.person.handle)} hasn’t said they ${esc(verbOf(st.listing).past)}${verbOf(st.listing).to ? ' to' : ''} anything in
      ${esc(dirName())}. <a href="/events/${esc(st.dir)}/">See the programme →</a></p>`);
    return false;
  }
  $('thread').innerHTML = thread(week);
  $('stats').textContent = `${week.beads} ${week.beads === 1 ? 'bead' : 'beads'} · ${week.events} ${st.listing?.meta?.layout === 'films' ? (week.events === 1 ? 'film' : 'films') : (week.events === 1 ? 'event' : 'events')} · ${week.days.length} ${week.days.length === 1 ? 'day' : 'days'}`;
  $('days').innerHTML = week.days.map(d => `<section class="wk-day"><h2 class="sec">${esc(d.label)}</h2>
    ${d.items.map(({ bead, event }) => `<article class="wk-item k-${esc(groupOf(event?.category) || 'fairs')}">
      <span class="wk-dot" aria-hidden="true"></span>
      <div><h3>${event ? `<a href="/events/${esc(st.dir)}/${esc(event.slug)}/">${esc(event.record.name)}</a>` : 'An event'}</h3>
      <p class="wk-kind">${esc(KIND[bead.value.kind] || bead.value.kind || '')}</p>
      ${bead.value.note ? `<p class="wk-note">${esc(bead.value.note)}</p>` : ''}</div></article>`).join('')}</section>`).join('');
  $('share-url').textContent = shareUrl();
  show($('week'));
  return true;
}

$('share-copy').addEventListener('click', async () => {
  try { await navigator.clipboard.writeText(shareUrl()); $('share-copy').textContent = 'Copied'; }
  catch { $('share-copy').textContent = 'Select and copy'; }
  setTimeout(() => { $('share-copy').textContent = 'Copy'; }, 2000);
});

/* ---------- the publish form ---------- */
function counter(el, text, max) {
  const n = graphemes(text);
  el.textContent = n ? `${n} / ${max}` : '';
  el.classList.toggle('over', n > max);
  return n <= max;
}

function refreshForm() {
  const narrOk = counter($('narrative-count'), $('narrative').value, NARRATIVE_MAX);
  const postOk = !$('post').checked || (counter($('post-count'), $('post-text').value, POST_MAX) && $('post-text').value.trim());
  show($('post-box'), $('post').checked);
  show($('post-again'), Boolean(st.existing));
  const s = oauth.session();
  const ready = Boolean(s && s.did === st.person.did && coversStrand(s.scope, { post: $('post').checked }));
  const verb = st.existing ? 'update' : 'publish';
  $('publish').textContent = ready ? verb[0].toUpperCase() + verb.slice(1) : `Sign in & ${verb}`;
  $('perm-note').textContent = ready ? `Publishing as @${st.person.handle}.`
    : `You’ll approve this on @${st.person.handle}’s own sign-in page — only the account that holds these beads can publish them. CultureBlocs asks only to write strands${$('post').checked ? ' and this one post' : ''}.`;
  $('publish').disabled = !(narrOk && postOk);
}
['narrative', 'title'].forEach(id => $(id).addEventListener('input', refreshForm));
$('post').addEventListener('change', refreshForm);
$('post-text').addEventListener('input', () => { st.postEdited = true; refreshForm(); });

function openForm(draft) {
  const v = st.existing?.value || {};
  $('title').value = draft?.title ?? v.title ?? `My ${dirName()}`;
  $('narrative').value = draft?.narrative ?? v.narrative ?? '';
  show($('bsky'), Boolean(st.person.hasBsky));
  $('post').checked = Boolean(draft?.post) && st.person.hasBsky;
  st.postEdited = Boolean(draft?.postEdited);
  $('post-text').value = draft?.postText || defaultWeekPost({ dirName: dirName(), events: st.week.events, days: st.week.days.length });
  show($('publish-form'));
  refreshForm();
}

const readDraft = () => ({
  dir: st.dir, who: st.person.handle, did: st.person.did,
  title: $('title').value, narrative: $('narrative').value,
  post: $('post').checked, postText: $('post-text').value, postEdited: st.postEdited,
});
const saveDraft = (d) => sessionStorage.setItem(DRAFT, JSON.stringify(d));
const loadDraft = () => { try { return JSON.parse(sessionStorage.getItem(DRAFT) || 'null'); } catch { return null; } };

$('publish-form').addEventListener('submit', async (e) => {
  e.preventDefault();
  if ($('publish').disabled) return;
  const draft = readDraft();
  const s = oauth.session();
  if (s && s.did === st.person.did && coversStrand(s.scope, { post: draft.post })) return publish(draft);
  return signIn(draft);
});

async function signIn(draft, scope) {
  saveDraft({ ...draft, autopublish: true });
  $('publish').disabled = true;
  $('publish').textContent = 'Opening your sign-in…';
  try {
    if (oauth.session() && oauth.session().did !== st.person.did) await oauth.signOut();
    await oauth.startLogin(st.person.handle, scope || strandScopes({ post: draft.post }));
  } catch (err) {
    fail($('pub-error'), `Couldn’t start sign-in: ${err.message}`);
    refreshForm();
  }
}

const scopeProblem = (err) => err?.status === 403 || /scope|forbidden|insufficient/i.test(`${err?.code} ${err?.message}`);

async function publish(draft) {
  fail($('pub-error'), '');
  $('publish').disabled = true;
  $('publish').textContent = 'Publishing…';
  const s = oauth.session();
  let strandUri;
  try {
    // Re-read: the strand must reference each bead's current version.
    const fresh = await loadPerson(st.person.did);
    st.beads = fresh.beads;
    st.existing = fresh.existing;
    const strand = buildStrand({
      beads: st.beads, title: draft.title, narrative: draft.narrative,
      weekUrl: weekUrl(), dirName: dirName(), createdAt: st.existing?.value?.createdAt,
    });
    const res = st.existing
      ? await oauth.putRecord(STRAND_NSID, st.existing.rkey, strand)
      : await oauth.createRecord(STRAND_NSID, strand);
    strandUri = res.uri;
  } catch (err) {
    if (scopeProblem(err) && !sessionStorage.getItem(RETRIED)) {
      sessionStorage.setItem(RETRIED, '1');
      if (s?.issuer) oauth.markGenericOnly(s.issuer);
      await oauth.signOut();
      return signIn(draft, 'atproto transition:generic');
    }
    fail($('pub-error'), `Your strand wasn’t saved: ${err.message}. Nothing was published — try again.`);
    refreshForm();
    return;
  }

  let postUri = null, postError = null;
  if (draft.post) {
    try {
      let thumb;
      try {
        const img = await fetch(`/events/${st.dir}/og.png`);
        if (img.ok) thumb = await oauth.uploadBlob(await img.blob());
      } catch { /* a card without a picture is fine */ }
      const post = buildPost({
        text: draft.postText, eventUrl: shareUrl(), title: `${nameOf()}’s ${dirName()}`,
        description: $('stats').textContent, thumb, tags: [st.listing.meta?.tag].filter(Boolean),
      });
      postUri = (await oauth.createRecord(POST_NSID, post)).uri;
    } catch (err) {
      postError = err.message;
    }
  }
  sessionStorage.removeItem(DRAFT);
  sessionStorage.removeItem(RETRIED);

  const rkey = String(strandUri).split('/').pop();
  const wall = `/wall/${encodeURIComponent(st.person.handle)}/${encodeURIComponent(rkey)}`;
  show($('publish-form'), false);
  $('done').innerHTML = `<h2>Your week is a strand.</h2>
    <p><b>${esc(draft.title || `My ${dirName()}`)}</b> — ${st.beads.length} ${st.beads.length === 1 ? 'bead' : 'beads'},
    in <b>@${esc(st.person.handle)}</b>’s own repository.${postUri ? ' Your post is up on Bluesky.' : ''}</p>
    ${postError ? `<p class="went-error">The strand is saved, but the Bluesky post didn’t go: ${esc(postError)}</p>` : ''}
    <div class="links"><a href="${esc(wall)}">see it on your wall →</a>
      ${postUri ? `<a href="https://bsky.app/profile/${esc(actorPath(st.person.did))}/post/${esc(String(postUri).split('/').pop())}" rel="noopener">see your post →</a>` : ''}
      <a href="https://pdsls.dev/at/${esc(actorPath(st.person.did))}/${STRAND_NSID}/${esc(rkey)}" rel="noopener">the record →</a></div>
    <p>Change your mind about the words? Come back to this page and publish again —
    it updates the same strand.</p>`;
  show($('done'));
  $('done').scrollIntoView({ block: 'start' });
}

/* ---------- start ---------- */
$('ask').addEventListener('submit', (e) => {
  e.preventDefault();
  const who = $('who').value.trim().replace(/^@/, '');
  if (!who) return;
  location.search = `?dir=${encodeURIComponent(st.dir)}&who=${encodeURIComponent(who)}`;
});

async function boot() {
  let draft = null, returning = false, returnError = null;
  if (oauth.pendingCallback()) {
    returning = true;
    draft = loadDraft();
    try { await oauth.completeLogin(); } catch (err) { returnError = err.message; }
    if (draft) history.replaceState(null, '', `${location.pathname}?dir=${encodeURIComponent(draft.dir)}&who=${encodeURIComponent(draft.who)}`);
  }
  const q = new URLSearchParams(location.search);
  st.dir = validDirectory(q.get('dir')) ? q.get('dir') : (draft?.dir || 'frieze-week-london');
  const who = q.get('who') || draft?.who;

  st.listing = await loadListing(st.dir);
  if (!who) {
    const s = oauth.session();
    $('who').value = s?.handle || '';
    say('');
    $('crumbs').innerHTML = `<a href="/events/">Events</a> / <a href="/events/${esc(st.dir)}/">${esc(dirName())}</a> / My week`;
    $('wk-title').textContent = `My ${dirName()}.`;
    show($('ask'));
    return;
  }

  say('Reading the week…');
  Object.assign(st, await loadPerson(who));
  if (!renderWeek()) return;
  say('');
  openForm(draft && draft.who === st.person.handle ? draft : null);

  if (returnError) return fail($('pub-error'), `Sign-in didn’t finish: ${returnError}. Your words are still here — try again.`);
  if (returning && draft?.autopublish) {
    const s = oauth.session();
    if (!s) return fail($('pub-error'), 'Sign-in didn’t finish. Try again.');
    if (s.did !== st.person.did) {
      await oauth.signOut();
      return fail($('pub-error'), 'You signed in with a different account. Only the account that holds these beads can publish this week.');
    }
    if (!coversStrand(s.scope, { post: draft.post })) {
      if (!sessionStorage.getItem(RETRIED)) {
        sessionStorage.setItem(RETRIED, '1');
        if (s.issuer) oauth.markGenericOnly(s.issuer);
        return signIn(draft, 'atproto transition:generic');
      }
      return fail($('pub-error'), 'Your account didn’t grant permission to write the strand. Try signing in again.');
    }
    await publish(readDraft());
  }
}

boot().catch((err) => say(`<h2>Something went wrong</h2><p>${esc(err?.message || err)}</p>
  <p><a href="/events/">Browse the events →</a></p>`));
