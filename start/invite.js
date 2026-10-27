/* Invite links for the Start journey. The invite is encoded into the link
 * (see encodeInvite in lib/records.js); this page only builds it. */
import { encodeInvite } from './lib/records.js';

const form = document.getElementById('invite');
const out = document.getElementById('link');
const BASE = 'https://www.cultureblocs.com/start/';

try { form.from.value = localStorage.getItem('start:from') || ''; } catch { /* fine */ }

function paint() {
  const f = Object.fromEntries(new FormData(form).entries());
  try { localStorage.setItem('start:from', f.from || ''); } catch { /* fine */ }
  const link = `${BASE}?i=${encodeInvite(f)}`;
  out.textContent = link;
  document.getElementById('open').href = link.replace(BASE, `${location.origin}/start/`);
}
form.addEventListener('input', paint);
paint();

document.getElementById('copy').onclick = async (e) => {
  try { await navigator.clipboard.writeText(out.textContent); e.target.textContent = 'Copied'; }
  catch { e.target.textContent = 'Select the link and copy it'; }
  setTimeout(() => { e.target.textContent = 'Copy link'; }, 1600);
};
