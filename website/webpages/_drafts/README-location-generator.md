# How the location pages were built (2026-09-17)

The eleven files in `webpages/locations/` were generated, not hand-written, so
that every neighbourhood page carries the template's blocks in the template's
order.

**The markup comes from `global/templates/location.html`** — the master
template. Its header sets the running order for a location page:

> Hero, Intro, Topic Breakdown, Why Us (short), Testimonials, FAQ, Cross-Link,
> Final CTA — dropping Subtype Grid, Process and Data Table.

Process Steps is kept where the live page actually has a process section, and
the Portfolio Teaser where the page has real project photography.

## The files

- `extract.py` — pulls the live copy out of
  `_archive/wordpress-era/wp-data/pages.json`. Use this rather than
  `_archive/wordpress-era/extracted/content/*.md`, which drops accordion bodies
  and FAQ questions.
- `content1.py` … `content5.py` — the copy itself, one dict per page.
- `normalize.py` — maps that copy onto the template's blocks and running order.
- `gen.py` — emits the template markup.

## The CSS that came with it

The template's component rules (`.feature-list`, `.card-grid`, `.expand-block`,
the FAQ accordion, `.crosslink-grid`, `.qa-callout`, `.alt-row`, `.data-table`)
lived only inside the template's own `<style>`. They are now in
`global/styles/site.css` under "COMPONENT BLOCKS", against the real tokens, and
the accordion behaviour is in `global/scripts/site.js`. Pages no longer inline a
style block — which is how Forest Hill had been carrying a stale Cormorant
Garamond and terracotta palette.

## Regenerating

Editing the HTML in `locations/` directly is fine and expected. These scripts
are kept as the record of where the words came from; they are not part of the
build. To run them again, from the repo root:

    python3 - <<\'PY\'
    import sys; sys.path.insert(0, 'website/webpages/_drafts')
    import gen
    from normalize import normalize
    from content1 import PAGES1
    from content2 import PAGES2
    from content3 import PAGES3
    from content4 import PAGES4
    from content5 import PAGES5
    pages = PAGES1 + PAGES2 + PAGES3 + PAGES4 + PAGES5
    gen.build([normalize(p) for p in pages], 'website/webpages/locations')
    PY

## Layout notes (2026-09-17, second pass)

Two things were wrong in the first pass and are now fixed in `site.css`, so they
apply to the service pages as well:

- **Point lists were a tall left-aligned stack.** `.feature-list`,
  `.card-grid`, `.reviews-grid` and `.crosslink-grid` are now centred wrapping
  rows rather than fixed grids. Three to a row, and a short final row centres
  itself — five points read as 3 + 2, four as 3 + 1 — instead of hanging off
  the left with a hole on the right. Flex is used rather than CSS grid
  specifically to get that centred last row.
- **Hero headlines were unreadable.** `.hero` declared its darkening scrim as a
  background-image layer, so any page setting
  `style="background-image:url(photo)"` replaced the scrim. The scrim now lives
  on `.hero::before`, guarded by `:not(:has(.hero-scrim))` so the homepage's
  video scrim is not applied twice. A page only has to name its photograph.

A portfolio teaser with one or two photographs gets `.photos-1` / `.photos-2`
so the images share the row instead of sitting at a third width. Photographs of
the Avenue Road design centre are kept out of the teaser entirely — under a
heading reading "Our <Place> Projects" they read as a false claim.
