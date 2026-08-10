# Pocket Totem — deployed copy

**Canonical source lives in `cultureblocs-string/pocket/`.** Copy outward
only; do not edit here.

    cp ../cultureblocs-string/pocket/* pocket/

This copy exists because ATProto OAuth needs the app at a stable HTTPS
URL: the **client id is the URL of `client-metadata.json`**, and the
redirect URI must be listed inside it. Both are hard-coded to
`https://www.cultureblocs.com/pocket/` — the apex domain 308-redirects to
`www`, and an OAuth redirect through a 308 fails, so `www` it is.

Moving this app means changing three things together:
`client-metadata.json` (client_id + redirect_uris), the
`<link rel="atproto-client">` tag in `index.html`, and this note.
