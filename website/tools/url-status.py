#!/usr/bin/env python3
"""Regenerate website/LAUNCH-url-status.md.

    python3 website/tools/url-status.py

Answers one question: for every URL the live WordPress site serves today, does the
new site have a page at that address, a redirect to a real page, or nothing at all?

"Nothing at all" means a 404 on launch day and a lost ranking. Run this after every
batch of migration work. It exits non-zero while anything is still MISSING or
pointing at a redirect target that does not exist, so it can gate the launch.

Reads the live sitemaps over the network. Falls back to the saved copies in
marketing/research/audit-data/ if the network is unavailable.
"""
import os, re, sys, csv, json, time, urllib.request

HERE = os.path.dirname(os.path.abspath(__file__))
WEB  = os.path.dirname(HERE)
GDB  = os.path.dirname(WEB)
SITE = "https://granddesignbuild.com"

# Live, return 200, and in NO sitemap. Found by probe-live-redirects.py.
# The blog category archives especially - they are real indexable pages.
EXTRA_LIVE = [
    "/material-selections/", "/my-account/", "/thank-you/",
    "/construction-guides/", "/design-and-planning/",
    "/industry-insights/", "/permits-and-regulations/",
    "/permits-and-regulations/page/2/", "/blogs/2/",
]


def live_urls():
    found = {}
    # A sitemap that fails to load has to be fatal. Carrying on regardless writes a
    # short list that looks fine and hides real 404s - which is the single mistake
    # this whole file exists to prevent. It has already happened once.
    for name in ("page-sitemap.xml", "post-sitemap.xml"):
        xml = None
        for attempt in range(3):
            try:
                xml = urllib.request.urlopen(
                    urllib.request.Request("%s/%s" % (SITE, name),
                                           headers={"User-Agent": "gdb-migration/1.0"}),
                    timeout=30).read().decode()
                break
            except Exception as e:
                print("  %s attempt %d failed: %s" % (name, attempt + 1, e), file=sys.stderr)
                time.sleep(3)
        if xml is None:
            sys.exit("FATAL: could not read %s after 3 tries. Refusing to write a "
                     "partial list - re-run when the site responds." % name)
        locs = re.findall(r"<loc>([^<]+)</loc>", xml)
        if not locs:
            sys.exit("FATAL: %s returned no URLs." % name)
        for loc in locs:
            found[loc.replace(SITE, "") or "/"] = "sitemap"
        print("  %-20s %d URLs" % (name, len(locs)))
    # The REST export is the authoritative list of what is published. The sitemaps
    # are not: /services/ and /cost-estimator/ are both live and in neither.
    for coll in ("pages", "posts"):
        f = os.path.join(GDB, "_archive", "wordpress-era", "wp-data", "%s.json" % coll)
        if os.path.exists(f):
            n = 0
            for r in json.load(open(f)):
                link = r.get("link") or ""
                if link.startswith(SITE) and r.get("status") == "publish":
                    found.setdefault(link.replace(SITE, "") or "/", "REST (%s)" % coll)
                    n += 1
            print("  %-20s %d published" % (coll + ".json", n))

    for u in EXTRA_LIVE:
        found.setdefault(u, "live, not in sitemap")
    return found


def built_urls():
    """Every URL the new site will actually serve. Mirrors URLS in build.py."""
    out = {"/", "/about-us/", "/our-portfolio/", "/contact-us/", "/blogs/"}
    services = os.path.join(WEB, "webpages", "services")
    if os.path.isdir(services):
        for fn in os.listdir(services):
            if fn.endswith(".html"):
                out.add("/services/%s/" % fn[:-5])
    locations = os.path.join(WEB, "webpages", "locations")
    if os.path.isdir(locations):
        for fn in os.listdir(locations):
            if fn.endswith(".html"):
                out.add("/custom-home-builder-%s/" % fn[:-5])
    # build.py copies library/ to /material-selections/, so that URL is served.
    if os.path.isdir(os.path.join(GDB, "library")):
        out.add("/material-selections/")

    blog = os.path.join(WEB, "webpages", "blog")
    if os.path.isdir(blog):
        for fn in os.listdir(blog):
            if fn.endswith(".html") and fn != "index.html":
                out.add("/blogs/%s/" % fn[:-5])
    return out


def redirects():
    out = {}
    path = os.path.join(WEB, "config", "_redirects")
    for line in open(path):
        line = line.strip()
        if line and not line.startswith("#"):
            parts = line.split()
            if len(parts) >= 2:
                out[parts[0]] = parts[1]
    return out


def clicks():
    out = {}
    path = os.path.join(GDB, "marketing", "research", "audit-data",
                        "raw", "gsc", "unzipped", "Pages.csv")
    if not os.path.exists(path):
        return out
    with open(path) as fh:
        for row in csv.reader(fh):
            if len(row) >= 2 and row[0].startswith("http"):
                try:
                    out[row[0].replace(SITE, "") or "/"] = int(row[1])
                except ValueError:
                    pass
    return out


def main():
    live, built, red, clk = live_urls(), built_urls(), redirects(), clicks()
    if not live:
        sys.exit("no live URLs found - check the network and the sitemap")

    rows = []
    for url, source in live.items():
        if url in built:
            status, action = "BUILT", "Verify content parity"
        elif url in red:
            target = red[url]
            if target.startswith("http") or target in built:
                status, action = "REDIRECT", "Redirects to `%s`" % target
            else:
                status = "BROKEN REDIRECT"
                action = "Target `%s` does not exist - build it or change the target" % target
        else:
            status = "MISSING"
            action = "Build the page, or redirect to the closest relevant page"
        rows.append((clk.get(url, 0), url, source, status, action))
    rows.sort(key=lambda r: (-r[0], r[1]))

    missing = [r for r in rows if r[3] == "MISSING"]
    broken  = [r for r in rows if r[3] == "BROKEN REDIRECT"]

    out = os.path.join(WEB, "LAUNCH-url-status.md")
    with open(out, "w") as f:
        f.write("# Every live URL, and whether the new site has a home for it\n\n")
        f.write("Generated by `tools/url-status.py` from the live sitemaps, "
                "`config/_redirects` and the pages in `webpages/`.\n")
        f.write("Clicks are 16 months of Search Console data (2025-05 to 2026-09).\n\n")
        f.write("**%d live URLs. %d have nothing on the new site. "
                "%d more redirect to a page that does not exist.**\n\n"
                % (len(rows), len(missing), len(broken)))
        f.write("Regenerate after every batch of work. "
                "The site does not launch until MISSING and BROKEN REDIRECT are both zero.\n\n")
        f.write("| | Clicks | Live URL | Status | What to do |\n|---|---:|---|---|---|\n")
        for c, u, _s, st, ac in rows:
            f.write("| [ ] | %d | `%s` | **%s** | %s |\n" % (c, u, st, ac))

    print("%d live URLs -> %s" % (len(rows), out))
    print("  built/redirected: %d" % (len(rows) - len(missing) - len(broken)))
    print("  MISSING:          %d" % len(missing))
    print("  BROKEN REDIRECT:  %d" % len(broken))
    if missing or broken:
        print("\nNOT READY TO LAUNCH - %d URLs would 404." % (len(missing) + len(broken)))
        return 1
    print("\nEvery live URL has a home on the new site.")
    return 0


if __name__ == "__main__":
    sys.exit(main())
