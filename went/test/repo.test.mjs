import { test } from 'node:test';
import assert from 'node:assert/strict';
import { postsToBluesky } from '../lib/repo.js';

const json = (body, status = 200) => ({ ok: status < 400, status, json: async () => body });
const PDS = 'https://pds.example';

test('an active Bluesky account with no profile record still gets the post option', async () => {
  // Mark's real account: posts, likes and follows, but never set a profile.
  const fetchFn = async (url) => url.includes('describeRepo')
    ? json({ collections: ['app.bsky.feed.like', 'app.bsky.feed.post', 'app.bsky.graph.follow', 'com.cultureblocs.bead'] })
    : json({ error: 'RecordNotFound' }, 400);
  assert.equal(await postsToBluesky(PDS, 'did:plc:me', { fetchFn }), true);
});

test('an account with no Bluesky records does not', async () => {
  const fetchFn = async (url) => url.includes('describeRepo')
    ? json({ collections: ['com.whtwnd.blog.entry'] })
    : json({ error: 'RecordNotFound' }, 400);
  assert.equal(await postsToBluesky(PDS, 'did:plc:me', { fetchFn }), false);
});

test('if describeRepo is unavailable, a profile record still counts', async () => {
  const fetchFn = async (url) => url.includes('describeRepo')
    ? json({ error: 'nope' }, 500)
    : json({ uri: 'at://did:plc:me/app.bsky.actor.profile/self', value: {} });
  assert.equal(await postsToBluesky(PDS, 'did:plc:me', { fetchFn }), true);
});
