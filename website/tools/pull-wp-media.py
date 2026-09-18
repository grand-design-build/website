#!/usr/bin/env python3
"""Download the WordPress media library into _archive/wordpress-era/media/.

    python3 website/tools/pull-wp-media.py

Saves every original file under its real upload path, e.g.

    _archive/wordpress-era/media/2026/03/custom-home-build-cliffcrest.png

Keeping the /YYYY/MM/ structure matters: it is the same path WordPress serves
from, so an old /wp-content/uploads/... URL can always be traced back to a file,
and image redirects can be written mechanically if we ever need them.

Resumable — a file already on disk with the right size is skipped, so it is safe
to re-run after an interruption.

Reads media-index.json (the API listing). Regenerate that with --index.
"""
import os, sys, json, time, urllib.request, urllib.error

HERE  = os.path.dirname(os.path.abspath(__file__))
WEB   = os.path.dirname(HERE)
GDB   = os.path.dirname(WEB)
DEST  = os.path.join(GDB, "_archive", "wordpress-era", "media")
INDEX = os.path.join(DEST, "media-index.json")
SITE  = "https://granddesignbuild.com"
UA    = {"User-Agent": "gdb-migration/1.0"}


def build_index():
    """Page through the REST API, keyed by id so unstable pagination cannot lose rows."""
    items, page = {}, 1
    while page < 30:
        url = ("%s/wp-json/wp/v2/media?per_page=100&page=%d&orderby=id&order=asc"
               "&_fields=id,date,slug,link,source_url,mime_type,media_type,title,"
               "alt_text,caption,media_details,post" % (SITE, page))
        try:
            rows = json.load(urllib.request.urlopen(
                urllib.request.Request(url, headers=UA), timeout=60))
        except urllib.error.HTTPError as e:
            if e.code == 400:      # past the last page
                break
            raise
        if not rows:
            break
        for r in rows:
            items[r["id"]] = r
        print("  page %-3d %3d rows   running total %d" % (page, len(rows), len(items)))
        page += 1
        time.sleep(0.3)
    return [items[k] for k in sorted(items)]


def rel_path(source_url):
    """/wp-content/uploads/2026/03/x.png -> 2026/03/x.png"""
    marker = "/uploads/"
    i = source_url.find(marker)
    return source_url[i + len(marker):] if i != -1 else \
           os.path.join("_unsorted", source_url.rsplit("/", 1)[-1])


def main():
    os.makedirs(DEST, exist_ok=True)

    if "--index" in sys.argv or not os.path.exists(INDEX):
        print("Building media index from the API...")
        media = build_index()
        json.dump(media, open(INDEX, "w"), indent=1)
    else:
        media = json.load(open(INDEX))
    print("%d media items in the index\n" % len(media))

    got = skipped = failed = 0
    bytes_now = 0
    problems = []

    for n, item in enumerate(media, 1):
        src = item.get("source_url")
        if not src:
            problems.append((item.get("id"), "no source_url"))
            failed += 1
            continue
        out = os.path.join(DEST, rel_path(src))
        expected = (item.get("media_details") or {}).get("filesize")

        if os.path.exists(out) and (not expected or os.path.getsize(out) == expected):
            skipped += 1
            continue

        os.makedirs(os.path.dirname(out), exist_ok=True)
        try:
            with urllib.request.urlopen(
                    urllib.request.Request(src, headers=UA), timeout=120) as r:
                data = r.read()
            open(out, "wb").write(data)
            got += 1
            bytes_now += len(data)
        except Exception as e:
            problems.append((item.get("id"), "%s  %s" % (src, e)))
            failed += 1

        if n % 50 == 0:
            print("  %d/%d   downloaded %d, already had %d, failed %d  (%.0f MB this run)"
                  % (n, len(media), got, skipped, failed, bytes_now / 1e6))

    print("\ndownloaded %d   already had %d   failed %d" % (got, skipped, failed))
    print("%.1f MB fetched this run" % (bytes_now / 1e6))
    print("saved under %s" % DEST)

    if problems:
        log = os.path.join(DEST, "_failed.txt")
        with open(log, "w") as f:
            for i, msg in problems:
                f.write("%s\t%s\n" % (i, msg))
        print("\n%d failures listed in %s" % (len(problems), log))
    return 1 if failed else 0


if __name__ == "__main__":
    sys.exit(main())
