#!/usr/bin/env python3
"""Publish Frieze Week event records to the cultureblocs.com ATProto repo.

Usage (from anywhere; paths resolve relative to this repo):
  export ATP_HANDLE=cultureblocs.com
  export ATP_APP_PASSWORD=xxxx-xxxx-xxxx-xxxx   # Bluesky Settings > App passwords
  python3 tools/events/publish_frieze_events.py                 # dry run (default): shows create/update plan
  python3 tools/events/publish_frieze_events.py --apply         # actually writes
  python3 tools/events/publish_frieze_events.py --apply --only frieze-london-2026,pad-london-2026

Behaviour:
  - Logs in, resolves the account DID and its PDS endpoint from the DID document.
  - Lists existing records in the collection; new rkeys -> create, existing -> update
    (so re-running after editing the JSON is safe and idempotent).
  - Sends only each entry's `record` (sidecar fields are never published).
  - Writes in applyWrites batches (atomic per batch).
  - Writes DID-based `atUri`s and the returned CIDs back into the listing
    (events/frieze-week-london/events.json) — commit that file afterwards.
No third-party dependencies.
"""
import argparse, json, os, sys, urllib.parse, urllib.request, urllib.error

DATA = str(__import__("pathlib").Path(__file__).resolve().parents[2] / "events" / "frieze-week-london" / "events.json")
ENTRYWAY = os.environ.get("ATP_ENTRYWAY", "https://bsky.social")
BATCH = 50


def call(base, nsid, token=None, body=None, params=None):
    url = f"{base}/xrpc/{nsid}"
    if params:
        url += "?" + urllib.parse.urlencode(params)
    data = json.dumps(body).encode() if body is not None else None
    req = urllib.request.Request(url, data=data, method="POST" if data else "GET")
    req.add_header("Content-Type", "application/json")
    if token:
        req.add_header("Authorization", f"Bearer {token}")
    try:
        with urllib.request.urlopen(req, timeout=30) as r:
            return json.loads(r.read() or b"{}")
    except urllib.error.HTTPError as e:
        sys.exit(f"{nsid} failed: HTTP {e.code} {e.read().decode(errors='replace')}")


def pds_from_did_doc(doc):
    for s in doc.get("service", []):
        if s.get("id", "").endswith("#atproto_pds"):
            return s["serviceEndpoint"].rstrip("/")
    return None


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--apply", action="store_true", help="write records (default is dry run)")
    ap.add_argument("--only", help="comma-separated slugs to publish")
    ap.add_argument("--file", default=DATA)
    a = ap.parse_args()

    handle = os.environ.get("ATP_HANDLE", "cultureblocs.com")
    pw = os.environ.get("ATP_APP_PASSWORD")
    if not pw:
        sys.exit("Set ATP_APP_PASSWORD (use an app password, not the account password).")

    doc = json.load(open(a.file, encoding="utf-8"))
    coll = doc["meta"]["collection"]
    entries = doc["records"]
    if a.only:
        want = set(a.only.split(","))
        entries = [e for e in entries if e["slug"] in want]
        missing = want - {e["slug"] for e in entries}
        if missing:
            sys.exit(f"Unknown slugs: {', '.join(sorted(missing))}")

    # Session + PDS discovery
    sess = call(ENTRYWAY, "com.atproto.server.createSession",
                body={"identifier": handle, "password": pw})
    did, token = sess["did"], sess["accessJwt"]
    pds = pds_from_did_doc(sess.get("didDoc", {})) or ENTRYWAY
    print(f"Account {handle} -> {did} on {pds}")

    # Existing rkeys in the collection
    existing, cursor = set(), None
    while True:
        p = {"repo": did, "collection": coll, "limit": 100}
        if cursor:
            p["cursor"] = cursor
        page = call(pds, "com.atproto.repo.listRecords", token, params=p)
        existing |= {r["uri"].rsplit("/", 1)[-1] for r in page.get("records", [])}
        cursor = page.get("cursor")
        if not cursor:
            break

    writes = []
    for e in entries:
        op = "update" if e["rkey"] in existing else "create"
        writes.append((e, {"$type": f"com.atproto.repo.applyWrites#{op}",
                           "collection": coll, "rkey": e["rkey"], "value": e["record"]}))
        print(f"  {op:6} {e['rkey']}  {e['slug']}")
    print(f"{sum(1 for _, w in writes if w['$type'].endswith('create'))} create, "
          f"{sum(1 for _, w in writes if w['$type'].endswith('update'))} update")

    if not a.apply:
        print("Dry run — nothing written. Re-run with --apply.")
        return

    cids = {}
    for i in range(0, len(writes), BATCH):
        chunk = writes[i:i + BATCH]
        res = call(pds, "com.atproto.repo.applyWrites", token,
                   body={"repo": did, "validate": False, "writes": [w for _, w in chunk]})
        for (e, _), r in zip(chunk, res.get("results", [])):
            cids[e["slug"]] = {"uri": r.get("uri"), "cid": r.get("cid")}
        print(f"  batch {i // BATCH + 1}: {len(chunk)} written")

    # Update the dataset with DID-based URIs and CIDs
    full = json.load(open(a.file, encoding="utf-8"))
    full["meta"]["did"] = did
    for e in full["records"]:
        e["atUri"] = f"at://{did}/{coll}/{e['rkey']}"
        if e["slug"] in cids:
            e["cid"] = cids[e["slug"]]["cid"]
    json.dump(full, open(a.file, "w", encoding="utf-8"), ensure_ascii=False, indent=2)
    print(f"Done. DID-based URIs and CIDs written back to {a.file} — commit it.")


if __name__ == "__main__":
    main()
