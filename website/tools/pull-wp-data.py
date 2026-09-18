#!/usr/bin/env python3
"""Export the structured data behind the WordPress site: posts, pages, categories,
tags, authors and navigation.

    python3 website/tools/pull-wp-data.py

This is the part the rendered HTML does not give you cleanly - slugs, publish
dates, which post belongs to which category, which image is the featured image,
who wrote what. Saved as raw JSON so nothing is lost in interpretation, plus
readable summaries.

Everything goes to _archive/wordpress-era/wp-data/.
"""
import os, sys, json, time, urllib.request, urllib.error

HERE = os.path.dirname(os.path.abspath(__file__))
WEB  = os.path.dirname(HERE)
GDB  = os.path.dirname(WEB)
SITE = "https://granddesignbuild.com"
DEST = os.path.join(GDB, "_archive", "wordpress-era", "wp-data")
UA   = {"User-Agent": "gdb-migration/1.0"}

COLLECTIONS = ["posts", "pages", "categories", "tags", "users", "comments",
               "menu-items", "menus", "types", "taxonomies"]


def fetch_all(endpoint):
    """Page through a REST collection, keyed by id so pagination cannot lose rows."""
    items, page = {}, 1
    while page < 40:
        url = "%s/wp-json/wp/v2/%s?per_page=100&page=%d&orderby=id&order=asc" % (
            SITE, endpoint, page)
        try:
            rows = json.load(urllib.request.urlopen(
                urllib.request.Request(url, headers=UA), timeout=60))
        except urllib.error.HTTPError as e:
            if e.code in (400, 401, 403, 404):
                return list(items.values()), e.code
            raise
        except Exception as e:
            return list(items.values()), str(e)
        if not isinstance(rows, list) or not rows:
            break
        for r in rows:
            items[r.get("id", len(items))] = r
        if len(rows) < 100 and page > 1 and not items:
            break
        page += 1
        time.sleep(0.25)
    return [items[k] for k in sorted(items, key=str)], None


def main():
    os.makedirs(DEST, exist_ok=True)
    summary = {}

    for name in COLLECTIONS:
        rows, err = fetch_all(name)
        if rows:
            json.dump(rows, open(os.path.join(DEST, "%s.json" % name), "w"), indent=1)
        summary[name] = {"count": len(rows), "error": err}
        print("  %-14s %4d %s" % (name, len(rows), "" if not err else "(%s)" % err))

    json.dump(summary, open(os.path.join(DEST, "_summary.json"), "w"), indent=1)

    # A readable index of every post and page: what it is, where it lives, when.
    lines = ["# Every post and page on the WordPress site\n",
             "Exported by `website/tools/pull-wp-data.py`. Raw JSON is beside this file.\n"]

    cats = {}
    cpath = os.path.join(DEST, "categories.json")
    if os.path.exists(cpath):
        cats = {c["id"]: c["name"] for c in json.load(open(cpath))}

    for kind in ("pages", "posts"):
        p = os.path.join(DEST, "%s.json" % kind)
        if not os.path.exists(p):
            continue
        rows = json.load(open(p))
        lines.append("\n## %s — %d\n" % (kind.capitalize(), len(rows)))
        lines.append("| Published | URL | Title | Categories |")
        lines.append("|---|---|---|---|")
        for r in sorted(rows, key=lambda x: x.get("date", "")):
            url = (r.get("link") or "").replace(SITE, "") or "/"
            title = (r.get("title") or {}).get("rendered", "").replace("|", "\\|")
            cnames = ", ".join(cats.get(c, str(c)) for c in (r.get("categories") or []))
            lines.append("| %s | `%s` | %s | %s |"
                         % ((r.get("date") or "")[:10], url, title, cnames))

    open(os.path.join(DEST, "content-index.md"), "w").write("\n".join(lines) + "\n")
    print("\nwritten to %s" % DEST)


if __name__ == "__main__":
    main()
