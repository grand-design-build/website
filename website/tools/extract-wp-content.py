#!/usr/bin/env python3
"""Turn the saved WordPress HTML into things a person can actually work from.

    python3 website/tools/extract-wp-content.py

Reads _archive/wordpress-era/pages-html/ and writes, into
_archive/wordpress-era/extracted/:

  content/<page>.md      the real copy of each page, nav and footer stripped out,
                         headings kept. This is what a rebuilt page gets written
                         from, because the Elementor export does not contain it.
  seo-meta.csv/.md       title, meta description, canonical, robots, H1, word
                         count - one row per page. The parity checklist: the new
                         page should be at least as complete as the old one.
  internal-links.md      which page links to which. Rankings depend on this, and
                         it is the easiest thing to lose in a rebuild.
  image-usage.md         every image, the pages it appears on, and its alt text.
  page-weight.md         how heavy each old page is, for the before/after.

Deliberately does NOT touch structured data / schema - that is being handled
separately, and nothing here should collide with it.
"""
import os, re, csv, json, html, sys
from collections import defaultdict

HERE = os.path.dirname(os.path.abspath(__file__))
WEB  = os.path.dirname(HERE)
GDB  = os.path.dirname(WEB)
SRC  = os.path.join(GDB, "_archive", "wordpress-era", "pages-html")
DEST = os.path.join(GDB, "_archive", "wordpress-era", "extracted")
SITE = "https://granddesignbuild.com"

STRIP = re.compile(r"<(script|style|noscript|svg|iframe)\b.*?</\1>", re.S | re.I)
TAG   = re.compile(r"<[^>]+>")


def text_of(fragment):
    t = STRIP.sub(" ", fragment)
    t = TAG.sub(" ", t)
    t = html.unescape(t)
    return re.sub(r"[ \t]+", " ", t).strip()


def meta(h, name=None, prop=None):
    if name:
        m = re.search(r'<meta[^>]+name=["\']%s["\'][^>]+content=["\']([^"\']*)' % name, h, re.I)
    else:
        m = re.search(r'<meta[^>]+property=["\']%s["\'][^>]+content=["\']([^"\']*)' % prop, h, re.I)
    return html.unescape(m.group(1)) if m else ""


def main():
    if not os.path.isdir(SRC):
        sys.exit("FATAL: %s not found - run pull-wp-pages.py first." % SRC)
    os.makedirs(os.path.join(DEST, "content"), exist_ok=True)

    index = {}
    p = os.path.join(SRC, "_index.json")
    if os.path.exists(p):
        index = {v: k for k, v in json.load(open(p)).get("saved_as", {}).items()}

    rows, links, images = [], defaultdict(set), defaultdict(lambda: defaultdict(set))

    files = sorted(f for f in os.listdir(SRC) if f.endswith(".html"))
    for fn in files:
        h = open(os.path.join(SRC, fn), encoding="utf-8", errors="replace").read()
        url = index.get(fn, "/" + fn[:-5].replace("__", "/") + "/")
        if fn == "index.html":
            url = "/"

        m = re.search(r"<main[^>]*id=[\"']pxl-content-main[\"'][^>]*>(.*?)</main>", h, re.S | re.I)
        body = m.group(1) if m else h

        title  = html.unescape(re.search(r"<title[^>]*>(.*?)</title>", h, re.S).group(1).strip()) \
                 if re.search(r"<title[^>]*>(.*?)</title>", h, re.S) else ""
        canon  = (re.search(r'<link[^>]+rel=["\']canonical["\'][^>]+href=["\']([^"\']*)', h, re.I)
                  or [None, ""])[1] if re.search(r'rel=["\']canonical["\']', h, re.I) else ""
        cm = re.search(r'<link[^>]+rel=["\']canonical["\'][^>]+href=["\']([^"\']*)', h, re.I)
        canon = cm.group(1) if cm else ""

        h1s = [text_of(x) for x in re.findall(r"<h1[^>]*>(.*?)</h1>", body, re.S | re.I)]
        h2s = [text_of(x) for x in re.findall(r"<h2[^>]*>(.*?)</h2>", body, re.S | re.I)]
        h3s = [text_of(x) for x in re.findall(r"<h3[^>]*>(.*?)</h3>", body, re.S | re.I)]

        plain = text_of(body)
        words = len(plain.split())

        rows.append({
            "url": url,
            "title": title,
            "title_len": len(title),
            "meta_description": meta(h, name="description"),
            "desc_len": len(meta(h, name="description")),
            "robots": meta(h, name="robots"),
            "canonical": canon,
            "og_title": meta(h, prop="og:title"),
            "og_image": meta(h, prop="og:image"),
            "h1": " | ".join(h1s),
            "h1_count": len(h1s),
            "h2_count": len(h2s),
            "words": words,
            "page_bytes": len(h),
            "file": fn,
        })

        # ---- readable copy of the page
        out = ["# %s" % (h1s[0] if h1s else title),
               "",
               "> Source: `%s`  ·  %d words  ·  saved from WordPress" % (url, words),
               "> Title tag: %s" % title,
               "> Meta description: %s" % (meta(h, name="description") or "(none)"),
               "",
               "---", ""]
        # walk headings and paragraphs in document order
        for tag, content in re.findall(r"<(h[1-6]|p|li)[^>]*>(.*?)</\1>", body, re.S | re.I):
            t = text_of(content)
            if not t or len(t) < 2:
                continue
            tl = tag.lower()
            if tl.startswith("h"):
                out.append("\n%s %s\n" % ("#" * int(tl[1]), t))
            elif tl == "li":
                out.append("- %s" % t)
            else:
                out.append("%s\n" % t)
        name = (fn[:-5] or "index") + ".md"
        open(os.path.join(DEST, "content", name), "w").write("\n".join(out) + "\n")

        # ---- internal links
        for href in re.findall(r'<a[^>]+href=["\']([^"\']+)', body, re.I):
            if href.startswith(SITE):
                href = href.replace(SITE, "") or "/"
            if href.startswith("/") and not href.startswith("//"):
                links[url].add(href.split("#")[0])

        # ---- images and alt text
        for tag_html in re.findall(r"<img[^>]*>", body, re.I):
            src = re.search(r'src=["\']([^"\']+)', tag_html)
            alt = re.search(r'alt=["\']([^"\']*)', tag_html)
            if src:
                images[src.group(1)][url].add(html.unescape(alt.group(1)) if alt else "")

    # ---------------------------------------------------------------- outputs
    cols = list(rows[0].keys())
    with open(os.path.join(DEST, "seo-meta.csv"), "w", newline="") as f:
        w = csv.DictWriter(f, fieldnames=cols)
        w.writeheader()
        w.writerows(rows)

    rows.sort(key=lambda r: -r["words"])
    with open(os.path.join(DEST, "seo-meta.md"), "w") as f:
        f.write("# The old site's SEO, page by page\n\n")
        f.write("Every title, description and heading WordPress is serving today, and how "
                "much copy each page carries.\n\n")
        f.write("**The parity rule: the new page must be at least as complete as the old "
                "one.** If a page had 1,800 words and the rebuild has 600, the reason it "
                "ranks has been thrown away.\n\n")
        f.write("Flags: 🔴 no meta description · ⚠️ title over 60 or under 25 characters · "
                "⚠️ not exactly one H1\n\n")
        f.write("| Words | URL | Title | Title len | Meta description | H1 |\n")
        f.write("|---:|---|---|---:|---|---|\n")
        for r in rows:
            flags = ""
            if not r["meta_description"]:
                flags += " 🔴"
            if r["title_len"] > 60 or r["title_len"] < 25:
                flags += " ⚠️"
            if r["h1_count"] != 1:
                flags += " ⚠️H1×%d" % r["h1_count"]
            f.write("| %d | `%s` | %s%s | %d | %s | %s |\n" % (
                r["words"], r["url"], r["title"].replace("|", "\\|")[:70], flags,
                r["title_len"],
                (r["meta_description"].replace("|", "\\|")[:80] or "**MISSING**"),
                r["h1"].replace("|", "\\|")[:60]))

    inbound = defaultdict(set)
    for src, dsts in links.items():
        for d in dsts:
            inbound[d].add(src)
    with open(os.path.join(DEST, "internal-links.md"), "w") as f:
        f.write("# Internal links on the old site\n\n")
        f.write("Which page links to which. Rankings depend on this and it is the easiest "
                "thing to lose in a rebuild — a page nobody links to sinks, however good "
                "it is.\n\n")
        f.write("## Most linked-to pages\n\n| Links in | Page |\n|---:|---|\n")
        for d, srcs in sorted(inbound.items(), key=lambda x: -len(x[1]))[:40]:
            f.write("| %d | `%s` |\n" % (len(srcs), d))
        f.write("\n## Pages with no internal links pointing at them\n\n")
        orphans = sorted(set(links) - set(inbound))
        if orphans:
            for o in orphans:
                f.write("- `%s`\n" % o)
        else:
            f.write("None.\n")
        f.write("\n## Every page's outbound internal links\n\n")
        for src in sorted(links):
            f.write("\n### `%s` — %d links out\n\n" % (src, len(links[src])))
            for d in sorted(links[src]):
                f.write("- `%s`\n" % d)

    with open(os.path.join(DEST, "image-usage.md"), "w") as f:
        f.write("# Which image is used where, and what its alt text says\n\n")
        f.write("Alt text is per-use, not per-file — the same photo can be described "
                "differently on two pages. Carry it across, and write it where it is "
                "missing: it is free SEO and it is what a screen reader reads out.\n\n")
        noalt = sum(1 for s in images for u in images[s] if not any(images[s][u]))
        f.write("**%d distinct images across the site. %d uses have no alt text.**\n\n"
                % (len(images), noalt))
        f.write("| Image | Used on | Alt text |\n|---|---|---|\n")
        for src in sorted(images):
            short = src.split("/")[-1][:60]
            for url in sorted(images[src]):
                alts = [a for a in images[src][url] if a]
                f.write("| `%s` | `%s` | %s |\n" % (
                    short, url, (alts[0].replace("|", "\\|")[:70] if alts else "**none**")))

    with open(os.path.join(DEST, "page-weight.md"), "w") as f:
        f.write("# How heavy each old page is\n\n")
        f.write("Raw HTML bytes as WordPress serves them, before images. Keep this as the "
                "before half of the before/after — it is the clearest way to show what the "
                "rebuild bought.\n\n| HTML size | Words | URL |\n|---:|---:|---|\n")
        for r in sorted(rows, key=lambda x: -x["page_bytes"]):
            f.write("| %.0f KB | %d | `%s` |\n" % (r["page_bytes"] / 1024, r["words"], r["url"]))

    print("%d pages extracted" % len(rows))
    print("  content/          %d markdown files" % len(rows))
    print("  seo-meta.md/.csv  %d rows" % len(rows))
    print("  internal-links.md %d pages, %d link targets" % (len(links), len(inbound)))
    print("  image-usage.md    %d distinct images" % len(images))
    print("\nwritten to %s" % DEST)
    print("\nNOTE: structured data / schema deliberately not touched.")


if __name__ == "__main__":
    main()
