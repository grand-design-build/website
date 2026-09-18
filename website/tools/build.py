#!/usr/bin/env python3
"""Build granddesignbuild.com from website/ into website/_site/.

    python3 website/tools/build.py

What it does, in order:

1. Stamps the shared partials (head, schema, header, footer) from
   `global/partials/` into every page that asks for them. A page asks with a
   marker pair:

       <!-- #include header -->
       <!-- /include header -->

   Everything between the markers is GENERATED. Edit the partial, never the
   page.

2. Maps each source file to its real web address. The folder tree is arranged
   for humans; the URLs must stay exactly as WordPress serves them today or we
   lose the rankings. That mapping is URLS below and it is the one thing in
   this file that must never be casually changed.

3. Copies `global/` to `/assets/`, plus images, brand files and the library.

4. Checks every internal link resolves, and reports the ones that do not.

5. Writes sitemap.xml.

Exits non-zero if anything is broken, so a bad build is caught here and not by
a visitor.
"""
import os, re, sys, shutil, datetime, json, hashlib

HERE = os.path.dirname(os.path.abspath(__file__))
WEB  = os.path.dirname(HERE)                 # website/
GDB  = os.path.dirname(WEB)                  # GDB/
PAGES   = os.path.join(WEB, "webpages")
GLOBAL  = os.path.join(WEB, "global")
CONFIG  = os.path.join(WEB, "config")
LIBRARY = os.path.join(GDB, "library")
OUT     = os.path.join(WEB, "_site")
SITE    = "https://granddesignbuild.com"

# ---------------------------------------------------------------- the map
# source file (relative to webpages/)   ->   published URL
# Locations publish at the ROOT, not under /locations/, because that is where
# Google has indexed them. Do not "tidy" this.
URLS = {
    "index.html":     "/",
    "about.html":     "/about-us/",
    "portfolio.html": "/our-portfolio/",
    "contact.html":   "/contact-us/",
    "blog/index.html": "/blogs/",
}
for f in ("design-and-permits", "home-renovation", "home-addition", "custom-build",
          "laneway-housing", "multiplex", "project-management", "property-management"):
    URLS["services/%s.html" % f] = "/services/%s/" % f
for f in ("forest-hill", "bayview-village", "bloor-west-village", "cliffcrest", "danforth",
          "leaside", "ledbury-park", "north-york", "rosedale", "the-beaches", "willowdale"):
    URLS["locations/%s.html" % f] = "/custom-home-builder-%s/" % f

def article_url(rel):
    """Any blog file that is not the landing page publishes under /blogs/."""
    return "/blogs/%s/" % os.path.basename(rel)[:-5]

# Pages the site links to that do not exist yet. Reported as TO BUILD rather
# than BROKEN. This list must be EMPTY before the DNS cutover or those links
# are real 404s for real visitors.
TO_BUILD = {
    "/services/": "live",
    "/custom-home-builder-old-toronto/": "new",
    "/custom-home-builder-downtown/": "new",
    "/custom-home-builder-leslieville/": "new",
    "/blogs/house-extension-cost-in-toronto-2026/": "live",
    "/blogs/renovating-toronto-neighbours-noise-bylaw/": "live",
    "/blogs/second-storey-addition-cost-toronto-2026/": "live",
    "/blogs/ontario-building-code-guide/": "live",
    "/privacy/": "new",
    "/terms/": "new",
}

errors, warnings = [], []

# ------------------------------------------------------------------ pages
def sources():
    for dp, dn, fn in os.walk(PAGES):
        dn[:] = [d for d in dn if not d.startswith("_")]
        for f in sorted(fn):
            if f.endswith(".html"):
                yield os.path.relpath(os.path.join(dp, f), PAGES).replace(os.sep, "/")

def url_for(rel):
    if rel in URLS:
        return URLS[rel]
    if rel.startswith("blog/"):
        return article_url(rel)
    errors.append("No published URL is defined for %s. Add it to URLS in build.py." % rel)
    return None

def load_partials():
    p = {}
    for name in ("head", "schema", "header", "footer"):
        fp = os.path.join(GLOBAL, "partials", "%s.html" % name)
        if os.path.exists(fp):
            p[name] = open(fp, encoding="utf-8").read().strip()
    return p

def stamp(html, partials, rel):
    for name, content in partials.items():
        open_m  = "<!-- #include %s -->" % name
        close_m = "<!-- /include %s -->" % name
        if open_m not in html:
            continue
        if close_m not in html:
            html = html.replace(open_m, open_m + "\n" + close_m, 1)
        pat = re.compile(re.escape(open_m) + r".*?" + re.escape(close_m), re.S)
        html = pat.sub(lambda m: open_m + "\n" + content + "\n" + close_m, html)
    return html

def mark_active(html, url):
    """Give the current page's nav link .active so the underline shows."""
    return html.replace('<a href="%s">' % url, '<a href="%s" class="active">' % url, 1)

# ------------------------------------------------------------------ build
def main():
    if os.path.exists(OUT):
        shutil.rmtree(OUT)
    os.makedirs(OUT)

    partials = load_partials()
    if "header" not in partials:
        errors.append("global/partials/header.html is missing.")

    # ------------------------------------------------------------- assets
    # global/ is served flat at /assets/ -- that is what the partials link to.
    adest = os.path.join(OUT, "assets")
    os.makedirs(adest, exist_ok=True)
    for sub in ("styles", "scripts"):
        src = os.path.join(GLOBAL, sub)
        if not os.path.isdir(src):
            continue
        for f in os.listdir(src):
            shutil.copy2(os.path.join(src, f), os.path.join(adest, f))
    for sub, into in (("brand", "assets/img/brand"), ("images", "images"), ("media", "media")):
        src = os.path.join(GLOBAL, sub)
        if os.path.isdir(src):
            shutil.copytree(src, os.path.join(OUT, into), dirs_exist_ok=True)

    # Fingerprint the stylesheets and scripts with a hash of their contents, so a
    # visitor who already has the old file is guaranteed to get the new one. Without
    # this a browser happily serves yesterday's CSS for a week and the site looks
    # broken for exactly the people who have been here before.
    fingerprints = {}
    for f in sorted(os.listdir(adest)):
        fp = os.path.join(adest, f)
        if os.path.isfile(fp) and f.endswith((".css", ".js")):
            h = hashlib.md5(open(fp, "rb").read()).hexdigest()[:8]
            fingerprints["/assets/" + f] = "/assets/%s?v=%s" % (f, h)

    def fingerprint(html):
        for plain, stamped in fingerprints.items():
            html = html.replace(plain + '"', stamped + '"')
        return html

    built = {}          # url -> output file
    for rel in sources():
        url = url_for(rel)
        if not url:
            continue
        html = open(os.path.join(PAGES, rel), encoding="utf-8").read()
        if "<!DOCTYPE" not in html:
            errors.append("%s is a fragment, not a document (no <!DOCTYPE>)." % rel)
        html = fingerprint(mark_active(stamp(html, partials, rel), url))

        dest = os.path.join(OUT, "index.html") if url == "/" \
               else os.path.join(OUT, url.strip("/"), "index.html")
        os.makedirs(os.path.dirname(dest), exist_ok=True)
        open(dest, "w", encoding="utf-8").write(html)
        built[url] = dest

    if os.path.isdir(LIBRARY):
        shutil.copytree(LIBRARY, os.path.join(OUT, "material-selections"),
                        dirs_exist_ok=True,
                        ignore=shutil.ignore_patterns("tools", "*.md", "netlify.toml"))

    for f in ("_redirects", "_headers", "robots.txt"):
        fp = os.path.join(CONFIG, f)
        if os.path.exists(fp):
            shutil.copy2(fp, os.path.join(OUT, f))

    # -------------------------------------------------------------- links
    for url, dest in sorted(built.items()):
        html = open(dest, encoding="utf-8").read()
        for href in set(re.findall(r'href="(/[^"#?]*)', html)):
            if href.startswith(("/assets/", "/images/", "/media/")):
                if not os.path.exists(os.path.join(OUT, href.strip("/"))):
                    errors.append("%s -> missing file %s" % (url, href))
                continue
            if href in built or href in TO_BUILD:
                continue
            if os.path.exists(os.path.join(OUT, href.strip("/"), "index.html")):
                continue
            errors.append("%s -> BROKEN internal link %s" % (url, href))

    # ------------------------------------------------------------ sitemap
    today = datetime.date.today().isoformat()
    urls = "\n".join(
        "  <url><loc>%s%s</loc><lastmod>%s</lastmod></url>" % (SITE, u, today)
        for u in sorted(built))
    open(os.path.join(OUT, "sitemap.xml"), "w", encoding="utf-8").write(
        '<?xml version="1.0" encoding="UTF-8"?>\n'
        '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n'
        + urls + "\n</urlset>\n")

    # ------------------------------------------------------------- report
    print("built %d pages -> %s" % (len(built), os.path.relpath(OUT, GDB)))
    if TO_BUILD:
        print("\n%d pages still TO BUILD (must be empty before the DNS cutover):" % len(TO_BUILD))
        for u, kind in sorted(TO_BUILD.items()):
            print("   %-52s %s" % (u, kind))
    for w in warnings:
        print("  warning: %s" % w)
    if errors:
        print("\n%d PROBLEM(S):" % len(errors))
        for e in errors:
            print("   %s" % e)
        return 1
    print("\nno broken links. ok.")
    return 0

if __name__ == "__main__":
    sys.exit(main())
