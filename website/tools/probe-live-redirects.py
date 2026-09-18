#!/usr/bin/env python3
"""Ask the live WordPress site what it does with every URL we know about.

    python3 website/tools/probe-live-redirects.py

Rank Math keeps its redirects in its own database table, which is not readable
from outside WP Admin. This gets the same answer a different way: request every
URL we know of and record what actually comes back.

That is better than a Rank Math export in one important way -- it captures every
redirect that is really in force, whoever configured it: Rank Math, WordPress's
own URL guessing, the host, or a rule someone added years ago and forgot.

Sources for the URL list:
  - the live sitemaps
  - Search Console (341 URLs, 16 months)
  - the left-hand side of config/_redirects
  - known live pages that are in no sitemap

Writes _archive/wordpress-era/live-redirect-map.md (readable) and .json (exact).
Run it BEFORE the domain moves. Afterwards the answers are gone for good.
"""
import os, re, csv, json, sys, time, urllib.request, urllib.error
from http.client import HTTPResponse

HERE = os.path.dirname(os.path.abspath(__file__))
WEB  = os.path.dirname(HERE)
GDB  = os.path.dirname(WEB)
SITE = "https://granddesignbuild.com"
DEST = os.path.join(GDB, "_archive", "wordpress-era")
UA   = {"User-Agent": "gdb-migration/1.0"}

EXTRA = ["/material-selections/", "/my-account/", "/thank-you/", "/cart/",
         "/checkout/", "/privacy-policy/", "/shop/", "/grand-design-build-blog/"]


class NoRedirect(urllib.request.HTTPRedirectHandler):
    def redirect_request(self, *a, **k):
        return None


opener = urllib.request.build_opener(NoRedirect)


def candidates():
    urls = set(EXTRA)

    for name in ("page-sitemap.xml", "post-sitemap.xml"):
        try:
            xml = urllib.request.urlopen("%s/%s" % (SITE, name), timeout=30).read().decode()
            for loc in re.findall(r"<loc>([^<]+)</loc>", xml):
                urls.add(loc.replace(SITE, "") or "/")
        except Exception as e:
            print("  could not read %s: %s" % (name, e), file=sys.stderr)

    gsc = os.path.join(GDB, "marketing", "research", "audit-data",
                       "raw", "gsc", "unzipped", "Pages.csv")
    if os.path.exists(gsc):
        with open(gsc) as fh:
            for row in csv.reader(fh):
                if row and row[0].startswith("http"):
                    urls.add(row[0].replace(SITE, "") or "/")

    rd = os.path.join(WEB, "config", "_redirects")
    if os.path.exists(rd):
        for line in open(rd):
            line = line.strip()
            if line and not line.startswith("#"):
                urls.add(line.split()[0])

    return sorted(urls)


def follow(path, max_hops=6):
    """Return the full hop chain for one URL."""
    chain, url = [], SITE + path
    for _ in range(max_hops):
        req = urllib.request.Request(url, headers=UA, method="HEAD")
        try:
            r = opener.open(req, timeout=30)
            code, loc = r.status, r.headers.get("Location")
        except urllib.error.HTTPError as e:
            code, loc = e.code, e.headers.get("Location")
        except Exception as e:
            chain.append({"url": url, "status": "ERR", "note": str(e)})
            return chain
        chain.append({"url": url, "status": code, "location": loc})
        if code in (301, 302, 307, 308) and loc:
            url = loc if loc.startswith("http") else SITE + loc
            continue
        return chain
    chain.append({"url": url, "status": "TOO MANY HOPS"})
    return chain


def main():
    os.makedirs(DEST, exist_ok=True)
    urls = candidates()
    print("probing %d URLs against the live site\n" % len(urls))

    results = []
    for n, p in enumerate(urls, 1):
        chain = follow(p)
        results.append({"from": p, "chain": chain})
        if n % 40 == 0:
            print("  %d/%d" % (n, len(urls)))
        time.sleep(0.12)

    json.dump(results, open(os.path.join(DEST, "live-redirect-map.json"), "w"), indent=1)

    redirects, ok, gone, errs = [], [], [], []
    for r in results:
        first = r["chain"][0]
        last  = r["chain"][-1]
        if first["status"] in (301, 302, 307, 308):
            redirects.append((r["from"],
                              last["url"].replace(SITE, "") or "/",
                              first["status"], len(r["chain"]) - 1,
                              last["status"]))
        elif first["status"] == 200:
            ok.append(r["from"])
        elif first["status"] in (404, 410):
            gone.append(r["from"])
        else:
            errs.append((r["from"], first["status"]))

    out = os.path.join(DEST, "live-redirect-map.md")
    with open(out, "w") as f:
        f.write("# What the live WordPress site actually does with every URL\n\n")
        f.write("Captured by `website/tools/probe-live-redirects.py` on the live site.\n")
        f.write("This is the real, in-force redirect behaviour -- Rank Math's rules, "
                "WordPress's own URL guessing and anything else, all together.\n\n")
        f.write("**%d URLs probed: %d redirect, %d return 200, %d are already gone, "
                "%d other.**\n\n" % (len(results), len(redirects), len(ok), len(gone), len(errs)))

        f.write("## Redirects in force — every one of these must be reproduced in "
                "`website/config/_redirects`\n\n")
        f.write("| From | Lands on | Code | Hops | Final |\n|---|---|---|---:|---|\n")
        for a, b, code, hops, final in sorted(redirects):
            flag = " ⚠️ **chain**" if hops > 1 else ""
            dead = " 🔴 **ends in %s**" % final if final not in (200,) else ""
            f.write("| `%s` | `%s` | %s | %d%s%s |  |\n" % (a, b, code, hops, flag, dead))

        f.write("\n## Return 200 — real pages that need a home on the new site\n\n")
        for u in sorted(ok):
            f.write("- `%s`\n" % u)

        f.write("\n## Already 404/410 on WordPress — safe to ignore\n\n")
        for u in sorted(gone):
            f.write("- `%s`\n" % u)

        if errs:
            f.write("\n## Other responses — look at these by hand\n\n")
            for u, s in sorted(errs):
                f.write("- `%s` — %s\n" % (u, s))

    print("\n%d redirect / %d live / %d gone / %d other" % (len(redirects), len(ok), len(gone), len(errs)))
    chains = [r for r in redirects if r[3] > 1]
    dead   = [r for r in redirects if r[4] != 200]
    if chains: print("%d redirects take more than one hop" % len(chains))
    if dead:   print("%d redirects do not end on a 200" % len(dead))
    print("\nwritten to %s" % out)


if __name__ == "__main__":
    main()
