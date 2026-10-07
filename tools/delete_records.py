#!/usr/bin/env python3
"""Delete records from your own ATProto repository (your PDS).

Dry run by default: lists what would go. Nothing is deleted without --apply.

  export ATP_HANDLE=you.bsky.social            # or cultureblocs.com
  export ATP_APP_PASSWORD=xxxx-xxxx-xxxx-xxxx  # Bluesky Settings > App passwords

  # everything in one collection (e.g. all your beads)
  python3 tools/delete_records.py com.cultureblocs.bead
  python3 tools/delete_records.py com.cultureblocs.bead --apply

  # every com.cultureblocs.* collection in the account
  python3 tools/delete_records.py 'com.cultureblocs.*'

  # specific records only
  python3 tools/delete_records.py community.lexicon.calendar.event --rkey 3msuzfkqnkpc3 --apply

Deletes are permanent in your repo. Indexes that follow the network
(Constellation, the Bluesky app) drop them as they see the delete.
No third-party dependencies.
"""
import argparse, fnmatch, json, os, sys, urllib.error, urllib.parse, urllib.request

ENTRYWAY = os.environ.get("ATP_ENTRYWAY", "https://bsky.social")
BATCH = 50


def call(base, nsid, token=None, body=None, params=None):
    url = f"{base}/xrpc/{nsid}" + ("?" + urllib.parse.urlencode(params) if params else "")
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


def pds_of(did_doc):
    for s in did_doc.get("service", []):
        if s.get("id", "").endswith("#atproto_pds"):
            return s["serviceEndpoint"].rstrip("/")
    return None


def list_rkeys(pds, did, coll):
    out, cursor = [], None
    while True:
        p = {"repo": did, "collection": coll, "limit": 100}
        if cursor:
            p["cursor"] = cursor
        r = call(pds, "com.atproto.repo.listRecords", params=p)
        out += [(x["uri"].rsplit("/", 1)[-1], x.get("value", {})) for x in r.get("records", [])]
        cursor = r.get("cursor")
        if not cursor or not r.get("records"):
            return out


def label(value):
    for k in ("name", "title", "note", "text", "displayName"):
        if isinstance(value.get(k), str) and value[k].strip():
            return value[k].strip().replace("\n", " ")[:60]
    return value.get("$type", "")


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("collection", help="NSID, or a pattern such as 'com.cultureblocs.*'")
    ap.add_argument("--rkey", action="append", help="only these record keys (repeatable)")
    ap.add_argument("--apply", action="store_true", help="actually delete (default is a dry run)")
    a = ap.parse_args()

    handle = os.environ.get("ATP_HANDLE")
    pw = os.environ.get("ATP_APP_PASSWORD")
    if not handle or not pw:
        sys.exit("Set ATP_HANDLE and ATP_APP_PASSWORD (an app password, not your account password).")

    sess = call(ENTRYWAY, "com.atproto.server.createSession", body={"identifier": handle, "password": pw})
    did, token = sess["did"], sess["accessJwt"]
    pds = pds_of(sess.get("didDoc", {})) or ENTRYWAY
    print(f"{handle} -> {did} on {pds}")

    colls = call(pds, "com.atproto.repo.describeRepo", params={"repo": did}).get("collections", [])
    wanted = [c for c in colls if fnmatch.fnmatchcase(c, a.collection)]
    if not wanted:
        sys.exit(f"No collection matches {a.collection!r}. This account has: {', '.join(colls) or 'none'}")

    writes = []
    for coll in wanted:
        recs = list_rkeys(pds, did, coll)
        if a.rkey:
            missing = set(a.rkey) - {k for k, _ in recs}
            if missing:
                print(f"  not found in {coll}: {', '.join(sorted(missing))}")
            recs = [(k, v) for k, v in recs if k in a.rkey]
        print(f"{coll}: {len(recs)} record(s)")
        for k, v in recs:
            print(f"  {k}  {label(v)}")
            writes.append({"$type": "com.atproto.repo.applyWrites#delete", "collection": coll, "rkey": k})

    if not writes:
        print("Nothing to delete.")
        return
    if not a.apply:
        print(f"\nDry run: {len(writes)} record(s) would be deleted. Add --apply to delete them.")
        return
    for i in range(0, len(writes), BATCH):
        call(pds, "com.atproto.repo.applyWrites", token, body={"repo": did, "writes": writes[i:i + BATCH]})
    print(f"\nDeleted {len(writes)} record(s).")


if __name__ == "__main__":
    main()
