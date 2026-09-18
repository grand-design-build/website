#!/usr/bin/env python3
"""Save the rendered HTML of every live page, while the site still exists.

    python3 website/tools/pull-wp-pages.py

Why this matters more than the WordPress export: the site is built in Elementor,
which keeps page content as its own JSON in the post meta, not in the field the
WordPress exporter writes. A normal export of this site looks complete and
contains almost none of the page copy.

The rendered HTML is therefore the only faithful record of what each page says.
Saved to _archive/wordpress-era/pages-html/, one file per URL, named after the
path so it is obvious which is which.

Resumable. Re-run it any time before the domain moves; afterwards it is too late.
"""
import os, re, sys, json, time, urllib.request, urllib.error

HERE = os.path.dirname(os.path.abspath(__file__))
WEB  = os.path.dirname(HERE)
GDB  = os.path.dirname(WEB)
SITE = "https://granddesignbuild.com"
DEST = os.path.join(GDB, "_archive", "wordpress-era", "pages-html")
MAP  = os.path.join(GDB, "_archive", "wordpress-era", "live-redirect-map.json")
UA   = {"User-Agent": "gdb-migration/1.0"}


def targets():
    """Every URL that returns 200 - from the probe if we have it, else the sitemaps."""
    urls = set()

    if os.path.exists(MAP):
        for r in json.load(open(MAP)):
            first = r["chain"][0]
            if first["status"] == 200:
                u = r["from"]
                if "#" in u:            # anchors are the same document
                    continue
                if "?" in u:            # ?hs_amp= / ?hsLang= duplicates
                    continue
                urls.add(u)

    # The REST API is the authoritative list of what is published. The sitemaps
    # are not - /services/ and /cost-estimator/ are both live and in neither.
    for coll in ("pages", "posts"):
        f = os.path.join(GDB, "_archive", "wordpress-era", "wp-data", "%s.json" % coll)
        if os.path.exists(f):
            for r in json.load(open(f)):
                link = r.get("link") or ""
                if link.startswith(SITE):
                    urls.add(link.replace(SITE, "") or "/")

    for name in ("page-sitemap.xml", "post-sitemap.xml"):
        try:
            xml = urllib.request.urlopen(
                urllib.request.Request("%s/%s" % (SITE, name), headers=UA),
                timeout=30).read().decode()
            for loc in re.findall(r"<loc>([^<]+)</loc>", xml):
                urls.add(loc.replace(SITE, "") or "/")
        except Exception as e:
            print("  warning: could not read %s (%s)" % (name, e), file=sys.stderr)

    return sorted(urls)


def filename(path):
    if path == "/":
        return "index.html"
    name = path.strip("/").replace("/", "__")
    return name + ".html"


def main():
    os.makedirs(DEST, exist_ok=True)
    urls = targets()
    if not urls:
        sys.exit("FATAL: no URLs to crawl.")
    print("saving %d pages\n" % len(urls))

    got = skipped = failed = 0
    problems = []

    for n, path in enumerate(urls, 1):
        out = os.path.join(DEST, filename(path))
        if os.path.exists(out) and os.path.getsize(out) > 2000:
            skipped += 1
            continue
        try:
            html = urllib.request.urlopen(
                urllib.request.Request(SITE + path, headers=UA), timeout=60).read()
            open(out, "wb").write(html)
            got += 1
        except Exception as e:
            problems.append((path, str(e)))
            failed += 1
        if n % 20 == 0:
            print("  %d/%d   saved %d, had %d, failed %d" % (n, len(urls), got, skipped, failed))
        time.sleep(0.2)

    json.dump({"urls": urls, "saved_as": {u: filename(u) for u in urls}},
              open(os.path.join(DEST, "_index.json"), "w"), indent=1)

    print("\nsaved %d   already had %d   failed %d" % (got, skipped, failed))
    print("written to %s" % DEST)
    for p, e in problems:
        print("  FAILED %s  %s" % (p, e))
    return 1 if failed else 0


if __name__ == "__main__":
    sys.exit(main())
