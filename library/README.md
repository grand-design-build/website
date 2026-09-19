# Material Library — Grand Design Build

A standalone, static material-selection library with a team dashboard behind it.
Clients sign in, browse finishes room by room, build a palette and compare
options side by side. The team adds and removes products, hands out access, and
watches what each client is choosing — all from `/admin.html`.

Storage is a blob store behind the API: nobody on the team opens a spreadsheet,
and there is no spreadsheet to open.

**No framework, no bundler.** Four files of CSS/JS on the front, one Netlify
Function behind. The site's build step is a python script that stamps the shared
header and footer into each page.

---

## Deploying

The library is **part of the main site**, not a separate deploy. `build.py`
copies this folder into `website/_site/material-selections/`, and the API runs
as a Netlify Function beside it.

Connect the repo to Netlify. `netlify.toml` at the repo root already declares
everything:

| Setting | Value |
| --- | --- |
| Build command | `python3 website/tools/build.py` |
| Publish directory | `website/_site` |
| Functions directory | `netlify/functions` |

No database, no second account, no connection string. Blob storage is created
on the first write.

All asset paths inside the library are relative, so it does not care what path
it is served at — only that `index.html` and `assets/` stay together.

---

## How it fits together

```
Netlify Blobs  ──  /api  (one function)  ──  index.html   (clients)
(catalogue,        login, catalogue,      └─  admin.html  (your team)
 clients,          selections, and
 selections,       everything the
 settings)         dashboard writes
```

Same origin, so there is no CORS hop and no third party in the path.

**Nothing is public.** The catalogue is not bundled with the site and is not
served until someone has signed in. An early build shipped all 436 products as
a JSON file with the sheet's URL and key in the page source; both are long gone.
The supplier link on a product is stripped before the catalogue leaves the
server — where we buy it is ours, not the client's.

## Status — where it runs

The library used to run on Google Apps Script with a spreadsheet behind it. It
does not any more. **It is one Netlify Function with blob storage**, served from
the same origin as the site, and it is roughly five hundred times faster.

| | Apps Script + Sheet | now |
| --- | --- | --- |
| sign in | 2–3s | 8ms |
| load the catalogue | 6–10s | 12ms |
| overview | 2.5–4s | 5ms |

Speed was not the only reason. Apps Script runs **one execution at a time per
account**, so two calls queued instead of overlapping. A new deployment 404s for
a minute or two. Under load a POST comes back with the *health-check* reply, or
a Google error page. And a spreadsheet's own data-validation can reject a write
**after** the response has been sent, which reaches the browser as a network
failure with nothing to diagnose — that is what blocked four rooms from being
imported at all.

### What is where

| | |
| --- | --- |
| `netlify/functions/api.mjs` | every action, in one file |
| `netlify/functions/lib/store.mjs` | Netlify Blobs, or local JSON files in dev |
| `netlify/functions/lib/auth.mjs` | HMAC-signed session tokens |
| `netlify.toml` (repo root) | build command, publish dir, functions dir, `/api` |
| `website/tools/dev-api.mjs` | the same handler, locally, serving the site too |

Data is four kinds of blob: `catalogue`, `clients`, `settings`, and one key per
client for their selections — so two clients choosing at the same moment write
to different places and cannot overwrite each other.

### Running it locally

```
GDB_LOCAL_STORE=/tmp/gdb-blobs node website/tools/dev-api.mjs
```

That serves `website/_site` **and** `/api` on one origin, which is how Netlify
serves it, so what you test is what ships. Build the site first.

### Deploying

Connect this repo to Netlify. Nothing else — no database, no second account, no
connection string. `netlify.toml` already declares the build command, the
publish directory and where the function lives. Blob storage is created on
first write.

## Giving a client access

**Clients → Add a client.** Name, email, project. Leave the access code blank and
one is made for you; **Copy invite** puts the link, the email and the code on your
clipboard ready to paste into a message.

Codes are per client, so you always know whose selections are whose.

### Taking access away

There are three steps, and only the last one loses anything.

| | What happens | Selections |
| --- | --- | --- |
| Untick **Access is open** | They cannot sign in. Still on the client list. | Kept |
| **Remove client** | Off the client list. Shown at the bottom as *Removed — record kept*, still openable, still exportable. | Kept |
| **Delete record** | Only offered on a client who is already removed. | Gone |

**Adding someone back with the same email hands them everything they had.** The
email is the key, so their selections reattach on their own — and they get a new
access code, because the old one went with them.

## The dashboard

`/admin.html`, opened with the team password. One password for everyone; change
it on the Settings page whenever somebody leaves.

**Overview** — products live, clients with access, who is choosing right now, and
the value of everything selected. Underneath: the last few clients to touch
anything, the products being picked most often, and a nudge for how many products
are still missing a photo or a price (clicking one filters the catalogue to them).

**Clients** — everyone with access, what they have chosen, what it comes to, and
whether their access is open. Open a client for their palette grouped by room
with subtotals, an estimated total, **Copy invite** and **Download CSV**.

**Products** — the whole catalogue. Search, filter by room, by live or archived,
or by what is missing. Click any row to edit it; *Add a product* for a new one.

**Settings** — the team password and how long a client session lasts.

### Adding and editing products

The form writes straight back to the room's tab. Two things worth knowing:

- **Where a room's sheet has a dropdown on Category or Subcategory, the form
  offers exactly that list.** Typing past one of those is what the sheet refuses,
  so it is not offered. A product already holding a value outside the list keeps
  it rather than being retyped by opening the form.
- **A column the tab has never had gets added the first time you fill it in.** A
  room with no Lead Time column gets one the moment somebody types a lead time.

**Pausing and deleting are separate.** *Hide from clients* takes a product out of
the library and keeps it on file — which is what you want for anything somebody
has already chosen, because their selection still reads back with a name and a
price. It is also the *Show this to clients* tick in the form, and the **Hidden
from clients** filter finds everything you have paused. *Delete* takes the row
out for good.

### Photos

Paste a link, or use **Upload a photo**: it lands in a Drive folder and the link
fills itself in. Give it a minute — Google does not serve a freshly written file
straight away, so a new photo can look broken at first. Cut out on white looks
best; that is how the client-facing cards are built.

### How fast it is

Fast enough not to think about: a few milliseconds a call. The catalogue is
still fetched once per sign-in and held for the session, so switching between
Overview, Clients and Products costs nothing at all. **Refresh** in the header
re-reads when you want to be certain.

Everything lives behind the dashboard. There is no second place to go and look.

## What clients can and cannot do

They can browse, compare, select finishes, and send their palette to you. Their
selections follow them across devices, because they live in the sheet rather
than in one browser.

They cannot print, export or save a schedule — that was removed. **They can
still screenshot, and a determined person can read the network tab.** No web
page can prevent that. What this does prevent is the catalogue being downloadable
by anyone with the URL, which is the part that actually mattered.

Sessions last **12 hours** (`SESSION_HOURS` on the Settings tab) and live in
`sessionStorage`, so closing the tab signs them out.

## Settings

In `assets/js/data.js`:

| Setting | What it does |
| --- | --- |
| `API` | Where the library's API lives. `/api` — same origin as the page. |
| `SHOW_PRICES` | `false` hides every price from clients. |
| `COMPARE_MAX` | How many items compare side by side. Default 3. |

On the sheet's **Settings** tab:

| Key | What it does |
| --- | --- |
| `ADMIN_CODE` | The team's password for `/admin.html`. Easier to change on the dashboard's Settings page. |
| `SESSION_HOURS` | How long a client stays signed in. Default 12. Also on that page. |
| `DRIVE_FOLDER` | Where uploaded photos go. Created for you — leave it alone. |
| `TOKEN_SECRET` | Signs the session tokens. Generated for you — leave it alone. Changing it signs everyone out. |

**After editing CSS or JS, bump the `?v=` number** on the asset links in
`index.html` and `admin.html`. That is what forces browsers to pick the change up.

## Palette and type

Everything comes from `brand-assets/`. No colour is invented.

| Token | Value | Brand role |
| --- | --- | --- |
| `--ink` | `#000000` | Black — headings, deep text |
| `--ink-soft` | `#54595F` | Charcoal — body text, structure |
| `--accent` | `#F78C1E` | **Signal Orange — the one accent** |
| `--accent-deep` | `#CB7319` | Orange, Deep — hover / active |
| `--accent-tint` | `#FEEEDD` | Orange, Tint — badges, highlights |
| `--paper` | `#F6F7F7` | Off-White — page ground |
| `--paper-raised` | `#FFFFFF` | White — panels |
| `--surface` | `#EEEEEF` | Stone — cards, section blocks |
| `--ink-2` | `#1D1F21` | Charcoal, Deep — the dark theme's ground |

Type is **Playfair Display** for display and **Lato** for everything else — the
brand reference identifies Playfair as the closest match to the wordmark's
high-contrast serif, and Lato as what already runs on the live site.

> Note: the homepage redesign draft currently uses Cormorant Garamond for some
> headings and Playfair for others. This follows the brand reference. If you
> settle on Cormorant instead, it is one line — `--serif` in `app.css`.

**Orange stays rare**, as the brand reference insists: one accent, spent on the
action that matters. On a 320-card grid exactly eight elements carry it — the
selections count, the rule under the intro, the "all brands" link, the added
state of a card, and the compare controls. Brand names on cards, hairlines and
section rules are all charcoal-grey. If you find yourself reaching for orange to
decorate something, reach for `--faint` or `--line` instead.

All of it is the `:root` block at the top of `assets/css/app.css`.

## Light and dark

The library follows the same contract as the rest of the site: it tracks the
system setting via `prefers-color-scheme`, and an explicit `data-theme` on
`<html>` overrides it in both directions. Set `data-theme="dark"` or
`data-theme="light"` from the site's own theme toggle and the library follows —
there is nothing to wire up.

Dark inverts onto the brand's own dark ground: `--paper:#1D1F21` (Charcoal,
Deep), `--ink:#F6F7F7`, with Signal Orange unchanged — it carries on both.

**One deliberate exception: the image plate stays white in both themes.** Most
product photography in the catalogue is a cut-out on a white background, so on a
dark tile those pictures become white rectangles. Keeping the plate white
(`--plate`, with `--plate-ink` / `--plate-faint` for anything drawn on top of
it) reads as a gallery light box rather than a mistake. Room covers are
full-bleed photographs and are unaffected either way.

The printed schedule does not follow the screen theme — paper is paper — but it
uses the same brand literals.

The wordmark swaps too: `logo.png` on light, `logo-dark.png` (the white mark) on
dark, driven by the same two rules.

## Brand assets

Taken from `brand-assets/` in the repo, resized for the web:

| File | Source | Used for |
| --- | --- | --- |
| `assets/img/brand/logo.png` | `Logos/Logo.png` | The wordmark, light theme |
| `assets/img/brand/logo-dark.png` | `Logos/GDB white logo 1.png` | The wordmark, dark theme |
| `assets/img/brand/mark-180.png` | `Logos/logo icon.png` | Apple touch icon |
| `assets/img/brand/favicon-32.png` | `Logos/logo icon.png` | Favicon |
| `assets/img/rooms/*.jpg` | `Shortlist Photos/` | Room tile covers |

**The logo files ship with a real transparent background.** The originals in
`brand-assets/Logos/` are dark artwork sitting on opaque white — an alpha
channel is present but every pixel is filled, so on the cream page they read as
a white box. (`GDB white logo 1.png` *is* genuinely transparent, but it is the
white-on-dark version and disappears on a light ground.) The white was keyed out
and the artwork un-matted, preserving the orange dot between DESIGN and BUILD.
The script that did it is kept at `tools/dewhite.py` — rerun it if the logo is
ever reissued. It detects a mark that is *already* transparent (the white one)
and only trims and downscales it, rather than keying its artwork away:

```bash
python3 tools/dewhite.py "brand-assets/Logos/Logo.png" assets/img/brand/logo.png 520
```

**The room tiles use Grand Design Build's own project photography**, not the
stock URLs that had found their way into the sheet's Areas tab. The mapping is
`GDB.ROOM_PHOTO` at the top of `assets/js/data.js` — add a room there and drop a
matching jpg in `assets/img/rooms/` to change a cover. A room with no entry
falls back to the sheet, then to one of its own product photos.

Current mapping: Kitchen → Kitchen 5, Bathroom → Bath 1, Flooring → Kitchen 1,
Doors → Custom 7, Windows → Laneway 2, Trims → Living, Hardware → Kitchen 2,
Lighting → Bath 5, Railing → Custom 1, Exterior Finishes → Custom 5. Swap any of
them for better shots as the portfolio grows.

**After editing CSS or JS, bump the `?v=` number on the asset links in
`index.html`.** That is what forces browsers to pick the change up.

---

## The interaction layer

`assets/js/motion.js` is entirely decoration. Switch it off and the library
works identically.

- **Rulers** — two graduated rules track the cursor with a slight lag: a fine
  tick every 8px, a heavier one every 40px, like a scale rule laid over the
  plan. They sit **behind the page** (`z-index:-1`), so product names, images
  and panels cover them — underlay, never overlay. Over a tile they snap to its
  edges and warm to gold, which lines them up with the grid. No labels, no
  readout. Clients can toggle them from the top bar and the choice is
  remembered.

  **They run across the whole content area** — over headings, over the empty
  space beside the grid — and are kept out of four zones only. Each zone is
  marked in `index.html` with `data-ruler-block`, and each pushes in one edge of
  the field:

  | Attribute | On | Effect |
  | --- | --- | --- |
  | `data-ruler-block="top"` | the sticky header, the breadcrumb | pushes the top edge down |
  | `data-ruler-block="left"` | the filter rail | pushes the left edge in |
  | `data-ruler-block="bottom"` | the footer | pulls the bottom edge up |

  A zone that has scrolled out of view, or is off-canvas on a small screen,
  stops pushing — so the field grows back on its own. Add or move the attribute
  to change which areas are off limits; no JavaScript needs editing.

  The clipping is applied synchronously on pointer move rather than inside the
  animation frame. `requestAnimationFrame` is paused in a background tab, and a
  stalled frame would otherwise leave the layer clipped to a stale rect.

  **Hovering a card hands the ruler over to the card.** The two axis rules fade
  out entirely and the ruler travels around the card's whole perimeter instead —
  top left-to-right, down the right side, back along the bottom, up the left, one
  continuous circuit at 135ms a side. Move off and the perimeter goes, the axis
  rules come back. It sits ~9px outside the card (`FRAME_PAD` in `motion.js`) so
  it lands in the grid gutter and stays clear of the artwork. Room tiles get it
  too. Under reduced-motion the perimeter still appears; only the travel is
  skipped.

  The rules are pure CSS gradients on two empty elements, so there is no markup
  and nothing to lay out. Their contrast lives in `.rule` / `.rule-h` /
  `.rule-v` in `app.css` if you want them louder or quieter.

- **Axis values** — a small `X` / `Y` readout tracks the cursor and reports
  where the rules are, so over a tile the numbers give that tile's edge rather
  than the raw pointer position. Unlike the rules, this sits *above* the page
  (`.axis`, `z-index:70`) with a paper-coloured halo, so it stays legible over a
  photograph.

  The rules and the numbers appear on load whether or not the pointer ever
  moves, and nothing hides them afterwards — not going idle, and not moving the
  cursor out of the window.
- **Reveals** — content rises into place as it scrolls in; the headline arrives
  word by word. Grid items stagger.
- **Magnetic buttons** — a few pixels of lean toward the cursor.
- **Loupe** — hold over the detail image to magnify around the pointer.
- **Scroll meter** — a gold hairline at the very top.

It disables itself on touch devices and under `prefers-reduced-motion`. There
is no on/off control in the header: the rules are simply part of the page on a
device that has a pointer, and absent on one that does not.

---

## Notes for whoever builds the rest of the site

- `admin.html` shares `app.css` for palette and type, and adds `admin.css`. It
  has its own session key, so signing out of one side does not sign out the other.
- **Comparison** is a real spec table: a label column, one column per material,
  every attribute on an aligned row. Rows whose values disagree are tinted and
  marked with a dot, so the eye goes to what actually separates the options.
  Prices carry a `LOWEST` badge and a `+$x` delta against the cheapest in the
  set. Where the sheet records nothing for an attribute across all the items,
  the row is dropped and named in a line beneath the table rather than silently
  omitted — so a thin comparison reads as a data gap, not a broken tool. Fill
  those columns in the sheet and the rows appear on their own.
- Deep links work: `#/Kitchen`, `#/Kitchen/Countertop`, `#/all`. Shareable.
- Selections live in the sheet, keyed to the client's email, so they survive a
  new device or a cleared browser. The local copy is only a cache for speed.
- If this is dropped into a page that already has a fixed header, the library
  measures it at runtime and offsets its own sticky bar. No hard-coded heights.
- Everything is scoped loosely but the markup is plain; if you integrate it into
  a larger design system, `app.css` is the only file to reconcile.
- The sheet still needs a data pass: many products have no photo, and only about
  a quarter carry a price. The library handles both gracefully, but the library
  is only ever as good as the sheet.
