#!/usr/bin/env python3
"""Copy DID-based at:// URIs and CIDs from the live repository into a
directory's events.json — read-only, no login needed.

Run after publishing (the publish script does this itself; this covers
records published another way, or a listing that has drifted):

    python3 tools/events/sync_from_repo.py                       # frieze-week-london
    python3 tools/events/sync_from_repo.py --dir <name> --check  # report only
"""
import argparse, json, sys, urllib.parse, urllib.request
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]


def get(url):
    with urllib.request.urlopen(url, timeout=30) as r:
        return json.load(r)


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--dir", default="frieze-week-london")
    ap.add_argument("--check", action="store_true", help="report differences, write nothing")
    a = ap.parse_args()
    path = ROOT / "events" / a.dir / "events.json"
    doc = json.loads(path.read_text(encoding="utf-8"))
    coll, repo = doc["meta"]["collection"], doc["meta"]["repo"]

    did = repo if repo.startswith("did:") else get(
        "https://public.api.bsky.app/xrpc/com.atproto.identity.resolveHandle?handle="
        + urllib.parse.quote(repo))["did"]
    plc = get(f"https://plc.directory/{did}")
    pds = next(s["serviceEndpoint"] for s in plc["service"] if s["id"].endswith("#atproto_pds"))

    live, cursor = {}, ""
    while True:
        q = urllib.parse.urlencode({"repo": did, "collection": coll, "limit": 100,
                                    **({"cursor": cursor} if cursor else {})})
        page = get(f"{pds}/xrpc/com.atproto.repo.listRecords?{q}")
        for r in page.get("records", []):
            live[r["uri"].rsplit("/", 1)[-1]] = r
        cursor = page.get("cursor")
        if not cursor:
            break

    changed, missing, drifted = 0, [], []
    for e in doc["records"]:
        r = live.get(e["rkey"])
        if not r:
            missing.append(e["slug"])
            continue
        if r["value"] != e["record"]:
            drifted.append(e["slug"])
        if e.get("atUri") != r["uri"] or e.get("cid") != r["cid"]:
            e["atUri"], e["cid"] = r["uri"], r["cid"]
            changed += 1
    doc["meta"]["did"] = did

    print(f"{did} on {pds}: {len(live)} live records")
    print(f"{changed} entries updated with DID URIs/CIDs")
    if missing:
        print("not published yet:", ", ".join(missing))
    if drifted:
        print("live record differs from the listing (republish or rebuild):", ", ".join(drifted))
    if a.check:
        return 1 if (changed or missing) else 0
    path.write_text(json.dumps(doc, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    print(f"wrote {path.relative_to(ROOT)}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
