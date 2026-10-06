#!/usr/bin/env python3
"""Publish the feeds in feeds/feeds.json as app.bsky.feed.generator records
in the publisher's repository (cultureblocs.com), so people can find them,
pin them and open them in Bluesky.

Run AFTER the site is deployed: Bluesky checks the service at publish time
and when people open the feed, so https://www.cultureblocs.com/.well-known/did.json
and /xrpc/app.bsky.feed.describeFeedGenerator must already answer.

    export ATP_HANDLE=cultureblocs.com
    export ATP_APP_PASSWORD=xxxx-xxxx-xxxx-xxxx
    python3 tools/feeds/publish_feeds.py            # dry run: checks + shows the records
    python3 tools/feeds/publish_feeds.py --apply    # publishes (create or update)

Re-running updates the records in place (same rkey, same feed URI). No
third-party dependencies.
"""
import argparse, json, os, sys, urllib.error, urllib.parse, urllib.request
from datetime import datetime, timezone
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
ENTRYWAY = os.environ.get("ATP_ENTRYWAY", "https://bsky.social")
NSID = "app.bsky.feed.generator"


def call(base, nsid, token=None, body=None, params=None, raw=None, ctype=None):
    url = f"{base}/xrpc/{nsid}" + (f"?{urllib.parse.urlencode(params)}" if params else "")
    data = raw if raw is not None else (json.dumps(body).encode() if body is not None else None)
    req = urllib.request.Request(url, data=data, method="POST" if data is not None else "GET")
    req.add_header("Content-Type", ctype or "application/json")
    if token:
        req.add_header("Authorization", f"Bearer {token}")
    try:
        with urllib.request.urlopen(req, timeout=30) as r:
            return json.loads(r.read() or b"{}")
    except urllib.error.HTTPError as e:
        if e.code in (400, 404) and nsid == "com.atproto.repo.getRecord":
            return None
        sys.exit(f"{nsid} failed: HTTP {e.code} {e.read().decode(errors='replace')}")


def check_live(cfg):
    """The service must already be deployed, or Bluesky will reject the feed."""
    problems = []
    for path in ("/.well-known/did.json", "/xrpc/app.bsky.feed.describeFeedGenerator"):
        try:
            with urllib.request.urlopen(cfg["endpoint"] + path, timeout=20) as r:
                body = json.loads(r.read())
            if path.endswith("did.json") and body.get("id") != cfg["service"]:
                problems.append(f"{path} has id {body.get('id')!r}, expected {cfg['service']!r}")
            if path.endswith("describeFeedGenerator") and body.get("did") != cfg["service"]:
                problems.append(f"{path} reports did {body.get('did')!r}")
        except Exception as e:  # noqa: BLE001
            problems.append(f"{cfg['endpoint']}{path} not reachable ({e}) — deploy the site first")
    return problems


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--apply", action="store_true")
    ap.add_argument("--skip-live-check", action="store_true", help="publish even if the service isn't answering yet")
    a = ap.parse_args()
    cfg = json.loads((ROOT / "feeds" / "feeds.json").read_text(encoding="utf-8"))

    problems = check_live(cfg)
    for p in problems:
        print("!", p)
    if problems and not a.skip_live_check:
        sys.exit("Service not live yet. Deploy, then run again (or --skip-live-check).")
    if not problems:
        print(f"Service {cfg['service']} is live at {cfg['endpoint']}")

    pw = os.environ.get("ATP_APP_PASSWORD")
    if not pw:
        sys.exit("Set ATP_APP_PASSWORD (an app password, not the account password).")
    sess = call(ENTRYWAY, "com.atproto.server.createSession",
                body={"identifier": os.environ.get("ATP_HANDLE", cfg["publisherHandle"]), "password": pw})
    did, token = sess["did"], sess["accessJwt"]
    if did != cfg["publisher"]:
        sys.exit(f"Signed in as {did}, but feeds.json says the publisher is {cfg['publisher']}.")
    pds = next((s["serviceEndpoint"] for s in sess.get("didDoc", {}).get("service", [])
                if s.get("id", "").endswith("#atproto_pds")), ENTRYWAY).rstrip("/")

    for f in cfg["feeds"]:
        existing = call(pds, "com.atproto.repo.getRecord", token,
                        params={"repo": did, "collection": NSID, "rkey": f["rkey"]})
        record = {
            "$type": NSID,
            "did": cfg["service"],
            "displayName": f["displayName"][:24],
            "description": f["description"][:300],
            "createdAt": (existing or {}).get("value", {}).get("createdAt")
                         or datetime.now(timezone.utc).isoformat().replace("+00:00", "Z"),
        }
        uri = f"at://{did}/{NSID}/{f['rkey']}"
        print(f"\n{'update' if existing else 'create'} {uri}")
        print(json.dumps({k: v for k, v in record.items() if k != "$type"}, ensure_ascii=False, indent=2))
        if not a.apply:
            continue
        if f.get("avatar"):
            img = (ROOT / f["avatar"]).read_bytes()
            record["avatar"] = call(pds, "com.atproto.repo.uploadBlob", token, raw=img, ctype="image/png")["blob"]
        call(pds, "com.atproto.repo.putRecord", token,
             body={"repo": did, "collection": NSID, "rkey": f["rkey"], "record": record})
        print(f"published. Open it: https://bsky.app/profile/{did}/feed/{f['rkey']}")

    if not a.apply:
        print("\nDry run — nothing written. Re-run with --apply.")


if __name__ == "__main__":
    main()
