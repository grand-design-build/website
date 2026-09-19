# Launch Plan — moving granddesignbuild.com off WordPress

**Written 2026-09-17. Everything in here was checked against the live site, the live DNS,
the Search Console export and the files in this folder — not assumed.**

The goal: on cutover day nothing breaks, nothing gets lost, and Google sees a site that
moved cleanly rather than a site that disappeared.

Read this top to bottom once. Then work the stages in order. Do not skip Stage 0.

---

## What we are actually moving from

The live site is **not self-hosted WordPress**. It is **WordPress.com (Atomic hosting)**.
That changes several things, so it is worth being precise:

| Thing | What it actually is |
|---|---|
| Hosting | WordPress.com Business/Commerce (`host-header: WordPress.com`, `192.0.78.x`) |
| DNS | **WordPress.com nameservers** — `ns1/ns2/ns3.wordpress.com` |
| Domain registrar | Almost certainly WordPress.com too (`_domainconnect` points at their API) |
| SEO plugin | **Rank Math** (it writes the sitemaps, meta tags and schema) |
| Images | Served through **Jetpack's CDN** (`i0.wp.com`) — not from your own domain |
| Forms | **HubSpot** embedded forms (portal `48981094`) |
| Chat / tracking | **HubSpot tracking script** (`js.hs-scripts.com/48981094`) |
| Analytics | **Google Tag Manager `GTM-5X6T52PR`** + Jetpack Stats (`stats.wp.com`) |
| Email | **Google Workspace** (`MX → smtp.google.com`) |
| Shop plumbing | **WooCommerce is installed** — `/my-account/`, `/cart/`, `/checkout/` exist |
| Client tool | `/material-selections/` — a live page backed by a Google Apps Script |

Everything that could be pulled off the old site is saved in **`_archive/wordpress-era/`** —
media, page HTML, the copy, SEO meta, the link graph, the redirects, the plugin list.
Start at that folder's `README.md`; it indexes the lot and lists what still needs a
WordPress login. The plugin-by-plugin inventory is in **`wordpress-inventory.md`**. Read it before Stage 1 — it contains
three things this plan did not originally account for.

**Live page count: 77 URLs in the sitemap** (23 pages + 54 blog posts), plus at least
three more that are live but not in the sitemap: `/material-selections/`, `/my-account/`,
`/thank-you/`. Search Console has tracked **341 URLs** over 16 months.

---

## The five things that will break a site like this

Every failed migration we could learn from breaks on one of these. They are the spine of
this plan.

1. **URLs that stop existing.** Google keeps sending people to a page; the page is gone;
   the ranking dies within weeks.
2. **DNS changed carelessly.** The website moves and the **email goes down with it**,
   because the mail records lived on the same nameservers.
3. **Forms that quietly stop submitting.** The site looks perfect. No lead has arrived in
   three days and nobody notices until Friday.
4. **Tracking that stops or double-counts.** You lose the ability to prove whether the new
   site is better or worse.
5. **Images that vanish.** They were being served by the old host's CDN, and that CDN
   switches off with the old host.

---

## 🔴 The single biggest problem right now

**57 of the 77 live URLs have no page on the new site and no redirect either.**

If we launched today, every one of those is a hard 404. That includes:

- **`/blogs/most-expensive-homes-in-canada/` — 1,971 clicks, the single highest-traffic
  page on the entire site.** It would 404.
- **48 more blog posts** that are live and indexed today.
- **6 neighbourhood pages that are live today**: Leaside, Ledbury Park, North York,
  Rosedale, The Beaches, Willowdale. Only 5 of the 11 neighbourhoods have been built.
- `/material-selections/` — the page clients use.
- `/my-account/` and `/thank-you/`.

There is a second, quieter version of the same problem: **several of the 36 redirect rules
in `config/_redirects` point at pages that do not exist on the new site.** A redirect to a
404 is still a 404 — it just takes two hops to get there.

And a third, which is the biggest of the lot: 🔴 **the live site is serving 239 redirects.
`config/_redirects` has 36. 208 rules currently in force are missing from our file.**
Launch as-is and every one of those URLs stops redirecting and starts 404-ing.
They are captured in `_archive/wordpress-era/redirects-from-live-site.DRAFT`, already
flattened to single hops and sorted by how much they matter.

And four rules point *backwards*, from a new `/blogs/…` URL to an old
`/grand-design-build-blog/…` URL that will not exist after launch. Those need reversing.

**Nothing else in this plan matters until that gap is closed.** It is Stage 2.

The full list, URL by URL, ordered by how much traffic each one gets, is in
**`LAUNCH-url-status.md`** next to this file. Regenerate it after every batch of work:

```
python3 website/tools/url-status.py
```

It exits non-zero while anything is still missing, so it can gate the launch.

---

# Stage 0 — Freeze and photograph the old site

*Do this first. It is the thing you cannot go back and do later.*
*Owner: ______  Target date: ______*

The point of this stage is simple: once the domain moves, the old site becomes hard or
impossible to read. Take the photograph while you still can.

- [ ] **Pick a launch date** and put a content freeze on WordPress two weeks before it.
      No new posts, no page edits after the freeze — or the new site launches missing them.
- [ ] **Full WordPress export.** Tools → Export → All content. Save the XML file to
      `_archive/wordpress-era/`.
- [ ] 🔴 **Do not trust that export for page content.** The site is built in **Elementor**,
      which stores page content as its own JSON in the post meta, not in the field the
      exporter writes. A standard export of this site looks complete and contains almost
      none of the page copy. **The saved HTML of the live pages is your real source** —
      see the next item, and `_archive/wordpress-era/wordpress-inventory.md`.
- [ ] **Check for custom post types.** The Bravis Addons plugin registers its own; content
      in them appears in neither the Pages nor the Posts list and is easy to miss entirely.
- [x] **Download the media library.** ✅ **Done 2026-09-17** — 642 files, ~425 MB, saved to
      `_archive/wordpress-era/media/` with the original `/YYYY/MM/` paths intact.
      Re-run `python3 website/tools/pull-wp-media.py` any time to pick up new uploads.
- [x] **Save the full HTML of every live page.** ✅ **Done** — 87 pages, 28 MB, in
      `_archive/wordpress-era/pages-html/`. Because of Elementor this is not a nice-to-have
      reference, it is **the real source for rebuilding page content.**
- [x] **Extract the copy into something workable.** ✅ **Done** — 87 markdown files,
      ~97,000 words, in `_archive/wordpress-era/extracted/content/`. Nav and footer stripped,
      headings kept. Write the new pages from these.
- [x] **Export the structured data behind the site.** ✅ **Done** — 54 posts, 27 pages,
      4 categories, 6 tags, 2 authors in `_archive/wordpress-era/wp-data/`, with a readable
      index at `wp-data/content-index.md`.
- [ ] **Export Rank Math's redirect list.** WP Admin → Rank Math → Redirections →
      Import & Export → Export as CSV. Save to `_archive/wordpress-era/rankmath-redirects.csv`.
      **This one needs a human with a WP Admin login** — the table is not readable from
      outside, and the WordPress.com management API does not expose it.
      *(We already have the same answer from the other direction: `live-redirect-map.md`
      records what the live site actually does with every URL we know of. Get the Rank Math
      export anyway — it may hold rules for URLs that are not on our list.)*
- [ ] **Export the rest of Rank Math's settings** while you are in there.
- [ ] **Screenshot every page**, desktop and mobile. Cheap insurance, ends arguments.
      *(The saved HTML covers the words; screenshots cover the layout.)*
- [x] **List every installed plugin.** ✅ **Done** — all 22, with what each does and what
      has to happen to it, in `_archive/wordpress-era/wordpress-inventory.md`. Read it: three
      of them do real work nobody had accounted for.
- [ ] **Export Search Console data** fresh, close to launch: Performance → last 16 months,
      plus the Pages, Queries and Index Coverage reports.
      *(The 2026-09-09 export is already in `audit-data/raw/gsc/`.)*
- [ ] **Export GA4 data** you will want to compare against later: pages, channels, events.
      *(Also already saved, same folder.)*
- [ ] **Record the current DNS zone in full** — every record, exact values, TTLs. Screenshot
      it. See Stage 6 for what we already know is there.
- [ ] **Confirm who controls the domain registration** and that you can log in. If the
      domain is registered at WordPress.com, decide now whether you are moving the
      registration out or just repointing DNS. *(You do not have to move the registration.
      Repointing is lower risk. But you must be able to log in either way.)*
- [ ] **Confirm who controls the Netlify account** and that it is under a company login,
      not a personal one.
- [ ] **Do not cancel the WordPress.com plan.** Keep it paid and running for **90 days**
      after launch. It is your rollback.

---

# Stage 1 — Take stock of what has to come off WordPress

*Owner: ______  Target date: ______*

This is the inventory. Every line is a thing that lives on WordPress today and needs a
home on the new site or a decision to drop it.

### Content

- [ ] **54 blog posts** — decide for each: rebuild, merge into another post, or retire and
      redirect. The audit already did this analysis: 203 of 341 tracked URLs have never
      had a single click. Those are safe to redirect rather than rebuild.
      *(See `audit-data/findings/page-migration-plan-2026-09-15.md`.)*
- [ ] **11 neighbourhood pages** — 5 built, 6 still live on WordPress and not yet built.
- [ ] **8 service pages** — all 8 built. Check the copy matches or improves on the live one.
- [ ] **Home, About, Portfolio, Contact, Blog index** — all built.
- [ ] **`/thank-you/`** — the form confirmation page. Must exist on the new site,
      and the form must actually land on it (see Stage 3 — it is currently broken).
- [ ] **Privacy policy and Terms.** Live site has `/privacy-policy/` (currently redirecting).
      The new site lists `/privacy/` and `/terms/` as "to build" and neither exists.
      **You need a privacy policy at launch** — you collect personal data through a form
      and run analytics. See Stage 5.
- [ ] **Portfolio project photography** — confirm every image used on the live portfolio is
      in `brand-assets/` and re-published from your own domain.
- [ ] **Any PDF, brochure or download** linked from the site.

### Things that are not pages

- [ ] **`/material-selections/`** — live client tool with its own Apps Script backend.
      The new library in `library/` replaces it. Decide the new URL, redirect the old one,
      and **tell every client whose bookmark will break.**
- [ ] **WooCommerce — resolved, and it is good news.** The plugin list shows it is **not
      installed**. `/cart/`, `/checkout/` and `/shop/` already redirect; they are leftovers.
      Nothing is being sold and there is no order or customer data to rescue.
- [ ] **`/my-account/` is not WooCommerce — it is a page called "My Portal" with a
      Forminator login form on it (form `17139`).** Find out what it gates and who uses it
      before it disappears.
- [ ] **Jetpack Stats.** You will lose the historical Jetpack numbers. Export or screenshot
      anything you care about. (GA4 is your real analytics — this is a nice-to-have.)
- [ ] **Comments**, if any posts have them.
- [ ] **Any WordPress user account** that someone outside the company holds.

### Images — the trap

Every image on the live site is served from `i0.wp.com` (Jetpack's CDN), including your
`og:image` social preview. **Those URLs die with the WordPress plan.**

- [ ] Every image must be re-served from `granddesignbuild.com` on the new site.
- [ ] Any image URL used *outside* the site — in an email template, a social post, a
      HubSpot email, a directory listing — must be found and updated.
- [ ] Old `/wp-content/uploads/…` image URLs are indexed in Google Images. Either keep the
      same paths, or add redirects for the handful that matter.

---

# Stage 2 — Close the 404 gap 🔴

*This is the critical path. Nothing launches until this stage is fully ticked.*
*Owner: ______  Target date: ______*

The rule: **every URL that returns 200 on WordPress today must, on the new site, either
return 200 at the same address or 301-redirect to the closest genuinely relevant page.**

"Closest genuinely relevant" matters. Redirecting 48 blog posts to the homepage is treated
by Google as a soft 404 and throws the value away. A kitchen cost article redirects to the
kitchen/renovation page, not to `/`.

- [ ] **Build or redirect all 48 unbuilt blog posts.** Start with the traffic order from
      the migration plan — `most-expensive-homes-in-canada` (1,971 clicks) first.
- [ ] **Build the 6 missing neighbourhood pages** (Leaside, Ledbury Park, North York,
      Rosedale, The Beaches, Willowdale) — they are live and indexed today.
- [ ] **Build `/services/` and `/locations/`** index pages — the nav links to both and
      neither exists on the new site. Those are 404s in the main menu.
      ⚠️ **`/services/` already exists on WordPress** ("Service Parent Page", live, 200) —
      it is in neither sitemap, so it was missed. Its copy is saved in
      `_archive/wordpress-era/extracted/content/services.md`. Carry it across rather than
      writing a new one. `/locations/` is genuinely new.
- [ ] **Decide what happens to `/cost-estimator/`** — "Cost Calculator", live, returns 200,
      set to `noindex`, gated behind Forminator form `17139`. It is in no sitemap and no
      earlier plan. Not an SEO asset, but possibly a working lead tool. **Find out who uses
      it before it disappears.**
- [ ] **Build `/privacy/` and `/terms/`.**
- [ ] **Build `/thank-you/`.**
- [ ] **Fix the 21 redirect rules that point at pages that do not exist.** Either build the
      target or change the target.
- [ ] **Reverse the 4 backwards rules** that send `/blogs/…` back to `/grand-design-build-blog/…`.
- [ ] **Fix the trailing-slash conflict.** `_redirects` has
      `/services/laneway-housing/ → /services/laneway-housing` while the build publishes
      `/services/laneway-housing/`. That is a redirect loop. Pick one convention —
      **trailing slash, to match WordPress** — and make every rule and every internal
      link obey it.
- [ ] **Add redirects for `/my-account/`, `/cart/`, `/checkout/`, `/material-selections/`.**
- [ ] **Add redirects for the 203 zero-click URLs** from Search Console. They are low value
      but they are cheap to handle and they keep the 404 report clean.
- [ ] **Merge the 208 missing rules** from `_archive/wordpress-era/redirects-from-live-site.DRAFT`
      into `config/_redirects`. Work the "REAL CONTENT MOVES" block (125 rules) first —
      that is where the ranking value is. **Check each target exists before pasting the rule.**
- [ ] **Read the "sent to the homepage" block before copying it.** Some of those were real
      pages someone deleted: four portfolio project pages, an FAQ, a reviews page, a
      testimonials page, a commercial renovation service, and a HubSpot lead-magnet
      download. Decide whether the content should come back rather than carrying a
      soft-404 rule across.
- [ ] **Handle the live blog category archives** — `/construction-guides/`,
      `/design-and-planning/`, `/industry-insights/`, `/permits-and-regulations/`
      (and `/page/2/`), `/blogs/2/`. They return 200 today, they are in no sitemap, and the
      new site has no equivalent. Rebuild or redirect — but decide.
- [ ] **Redirect the `?hs_amp=true` and `?hsLang=en` variants to the clean URL.** They
      return **200** on the live site today, so they are indexable duplicates of your
      biggest pages. The comment in `_redirects` assumes path rules cover them; they do not.
- [ ] **Add the Rank Math redirect list** exported in Stage 0 into `_redirects`, so any rule
      that is not in our probe list keeps working too.
- [ ] **`TO_BUILD` in `tools/build.py` must be empty.** That list is the build's own record
      of links pointing at nothing. Empty list, or those are real 404s for real visitors.
- [ ] **Run the automated check**: crawl the live sitemap, request every URL against the
      staging site, and confirm each returns 200 or a single 301 to a 200.
      **Zero 404s. Zero redirect chains longer than one hop. Zero loops.**

### Redirect rules that are easy to get wrong

- [ ] 301 (permanent), never 302. A 302 tells Google "this is temporary, keep the old one."
- [ ] One hop. `A → B → C` loses value and is slow. Rewrite to `A → C`.
- [ ] Redirect to the **specific** equivalent page, never a blanket homepage rule.
- [ ] **No catch-all rule to `/`.** A missing page must return a real 404.
      *(The current `_redirects` file already notes this and gets it right.)*
- [ ] Both `http://` and `https://`, both `www.` and bare, all land on one canonical version.
      Today the canonical is **`https://granddesignbuild.com`** with no `www`. Keep it.

---

# Stage 3 — Re-wire every integration

*Owner: ______  Target date: ______*

This is where the "it looks fine but no leads are arriving" failure lives.

### HubSpot — forms, tracking, and the CRM

HubSpot portal **48981094**. The contact form is form ID
`11c76bbd-16bc-4c2c-bb45-db75a1361b2b`, region `na1`.

- [ ] **The HubSpot tracking script (`js.hs-scripts.com/48981094`) is not on the new site
      yet.** Add it, or HubSpot stops attributing visits to contacts entirely.
- [ ] **Embed the HubSpot form on the new contact page** and on every page that has a form
      today. Use the official embed, not a hand-rolled copy.
- [ ] **Add `granddesignbuild.com` to HubSpot's allowed domains** if the portal restricts
      form embedding by domain — a form on an unknown domain silently fails.
- [ ] **Shorten the form to 3–4 fields**, as already decided. 75% of people who start it
      never finish (139 starts, 35 submits).
- [ ] **Fix the thank-you page.** GA4 shows 35 form submits but only 11 thank-you page
      views. The redirect after submission does not fire reliably. This is a known,
      confirmed bug — fix it in the rebuild, do not carry it over.
- [ ] **Add GA4's client ID as a hidden field** on the form. This is the one change that
      lets you connect "which channel sent this lead" to "did this lead sign." It is in the
      audit's 30-day plan and it belongs in the rebuild, not after it.
- [ ] **Send a real test lead** through the new form on staging. Confirm it appears in
      HubSpot **and** in Buildertrend, with the right owner and status, within the hour.
- [ ] **Confirm the HubSpot ↔ Buildertrend sync is actually working.** It was broken for
      three straight months (Jan–Mar 2026): 23 leads in Buildertrend, zero in HubSpot.
      Test it with evidence, not a verbal assurance.
- [ ] **HubSpot marketing email is authorised through your SPF record**
      (`48981094.spf01.hubspotemail.net`). That record must survive the DNS change — see Stage 6.
- [ ] If HubSpot chat / chatflows are live on any page, confirm they still load.

### Google Tag Manager and GA4

Container **GTM-5X6T52PR** — already in `global/partials/head.html`. Good.

- [ ] **Open the GTM container and read every tag in it.** Some will be configured for
      WordPress-specific triggers (page paths, element IDs, WordPress classes) that will
      not exist on the new site. Each one needs re-checking, not just copying.
- [ ] **Add the `<noscript>` GTM iframe** immediately after `<body>`. The head snippet is
      there; the body snippet is not.
- [ ] **Confirm GA4 is fired by GTM, not hard-coded as well.** If both, you double-count
      every pageview and your traffic appears to jump 100% at launch.
- [ ] **Re-create the events**: `page_view`, `scroll`, `click`, `form_start`, `form_submit`,
      `file_download`.
- [ ] **Mark `form_start`, `form_submit` and call-click as GA4 Key Events.** They fire today
      but are not flagged as conversions, so GA4's own reporting does not treat a lead as a
      lead. This is a five-minute settings toggle and it has been outstanding since the audit.
- [ ] **Add call-click tracking** on every `tel:` link.
- [ ] **Add a GA4 annotation on launch day.** Future-you will need to know why the numbers
      changed shape.
- [ ] **Turn off Jetpack Stats' script** — it dies with WordPress anyway, but do not carry
      the tag over.
- [ ] **Verify in GTM Preview mode on staging** before launch. Then verify again in GA4
      Realtime on the live site within an hour of cutover.
- [ ] **Find out what "leadsgo.io" is.** It shows up as the 8th most-viewed "page" on the
      site — 501 views, 501 users, an exact 1:1 ratio no real page produces. It is almost
      certainly a third-party widget or lead tool injecting itself. **Before launch, find
      it, and decide deliberately whether it comes across.** Do not let an unidentified
      third-party script migrate by accident.

### Google Search Console

- [ ] **Verification must not break.** The domain is verified by a TXT record
      (`google-site-verification=o1hymz…`). Keep that record. Better: also add an HTML-file
      or meta-tag verification on the new site as a second method **before** cutover.
- [ ] **Submit the new sitemap** the day of launch.
- [ ] **Do not use the Change of Address tool** — the domain is not changing, only the
      hosting. That tool is for domain-to-domain moves.
- [ ] Have the **Index Coverage / Pages** report open daily for the first two weeks.
- [ ] Use **URL Inspection → Request Indexing** on the top 10 pages on launch day.

### Google Business Profile

- [ ] Confirm the website link still resolves.
- [ ] **Name, address, phone and hours on the site must match GBP character for character.**
      Right now the site schema says `1558 Avenue Road, North York, ON M5M 3X5` and
      `+1-416-920-6066`. Verify that is exactly what GBP says.
- [ ] GBP interactions, calls and direction requests were declining Apr–Aug. Take a
      screenshot of the current baseline before launch so you can tell a launch effect from
      the existing trend.

### Google Workspace / email

- [ ] **Email is Google Workspace (`MX 1 smtp.google.com`). The mail records live in the
      same DNS zone as the website.** This is the highest-consequence item in the whole
      migration. If the zone is replaced rather than edited, email stops. See Stage 6.

### The material library

- [ ] The build already publishes it at **`/material-selections/`** — the same URL
      WordPress serves today. That is the right answer: every client bookmark keeps working.
      Confirm the built output actually lands there before launch.
- [ ] **`library/netlify.toml` sets `publish = "."`** — that is written for deploying the
      library on its own. If it is published as part of the main site, that setting is wrong
      and will fight the main build. Reconcile them.
- [ ] Confirm the Apps Script endpoint still answers from the new domain — **check the
      Apps Script's allowed origins / CORS**. A new host is a new origin as far as the
      browser is concerned.
- [ ] **The old bound Apps Script serving the WordPress `/material-selections/` page dies
      with WordPress.** The URL stays the same but what sits behind it changes completely —
      confirm the new standalone script ("Material Library API", Version 3) is the one in
      use, and that nothing still depends on the old bound script.
- [ ] Test a real client login end to end on staging.
- [ ] `admin.html` must be `noindex` **and** not linked from anywhere public.

### Forms and popups you may not know are there 🔴

The live site runs **three** form systems at once, not one. Only HubSpot is in the plan
so far.

- [ ] **Forminator** is active and loaded on every page, and it is the login form on
      `/my-account/`. **Its submissions are stored in the WordPress database and are NOT
      in a WordPress content export.** Export every entry (Forminator → Submissions →
      Export) before the plan lapses, or they are gone.
- [ ] **Hustle** is active — popups, slide-ins and opt-in forms. Export anything it has
      collected. Then decide deliberately whether popups come across to the new site.
- [ ] Work out which form is actually the contact form people use. If leads arrive through
      Forminator as well as HubSpot, that is a second intake path nobody is watching — and
      a plausible partial explanation for leads that never reach the CRM.

### The custom plugin 🔴

- [ ] **"GDB Script Manager" is a plugin written specifically for you.** Its description:
      *"Conditionally loads Buildertrend and HubSpot scripts."* **Get a copy of its source
      code before launch.** It is the only record of how and where those scripts load, it
      is not in any export, and it dies with WordPress.
- [ ] It also confirms **Buildertrend has a script running on the site.** Nothing in this
      plan accounted for that. Find out what it does — a chat widget, a lead form, a
      tracking pixel — and decide whether it comes across.

### Everything else on the page today

- [ ] Social links: Facebook, Instagram, LinkedIn, TikTok, Pinterest, Reddit, WhatsApp.
      **`site.json` has all three social fields empty.** Fill them in or drop the icons.
- [ ] The embedded Google Map on the contact page.
- [ ] Any review widget or badge.
- [ ] Any cookie banner (see Stage 5).
- [ ] The WhatsApp click-to-chat link, if it is being used.

---

# Stage 4 — SEO parity

*Owner: ______  Target date: ______*

The standard to hold yourself to: **for every page that carries over, the new page is at
least as complete as the old one.** Not "looks better" — as complete. Google reads the old
page's content, links and markup, and any of it you drop is a signal you gave up.

### Per-page checks — do this for the top 20 pages minimum

**You do not have to go and look these up.** `_archive/wordpress-era/extracted/seo-meta.md`
already lists every old page's title, meta description, H1 and word count, sorted by how
much copy it carries. Check the new page against its row.

What that file already shows about the old site, all of it free to fix while rebuilding:

- **35 titles are longer than 60 characters** — they get cut off in search results
- **7 pages have no meta description** at all
- **8 pages have no H1**
- **12 pages are under 300 words**
- The site carries **96,661 words** across 87 pages, median 1,076 per page. That is the
  bar for parity, page by page.
- **Average page weight: 331 KB of HTML before a single image.** Measure the new site the
  same way — that number is the whole case for the rebuild.


- [ ] Title tag carried across (and improved where the audit flagged it).
- [ ] Meta description carried across.
- [ ] H1 present, one per page, and matching the topic.
- [ ] The full body copy carried across. **Not a shortened "cleaner" version.** If a page
      had 1,800 words and the new one has 600, you have thrown away the reason it ranks.
- [ ] Internal links carried across. Rankings depend on which pages link to which — the
      old site's full link graph is in `_archive/wordpress-era/extracted/internal-links.md`,
      including which pages nothing links to.
- [ ] Image `alt` text carried across — `_archive/wordpress-era/extracted/image-usage.md`
      has every image, the pages it appears on, and what its alt text says today. Most uses
      have none. Write them while rebuilding; it is free.
- [ ] Image `alt` text carried across.
- [ ] Canonical tag on every page, self-referencing, absolute URL, `https://`, no `www`.
- [ ] `og:title`, `og:description`, `og:image` on every page, with the image on your own
      domain (not `i0.wp.com`).
- [ ] The `/blogs/kitchen-renovation-cost-in-canada-2026/` title and meta description are
      rewritten. That page gets 160,001 impressions and 103 clicks — a 0.06% click rate at
      position 5.3. It is the cheapest win available.

### Structured data (schema)

The new site's `global/partials/schema.html` is a real improvement — the live site has no
LocalBusiness markup at all. Two things to check:

- [ ] **Validate every page** in Google's Rich Results Test and Schema.org validator.
- [ ] 🔴 **The `aggregateRating` (4.9, 30 reviews) in the site-wide schema is a risk.**
      Google's policy does not allow a business to mark up its own overall rating on its own
      site. It is a known cause of a structured-data manual action. Your real Google reviews
      already show in the Business Profile without this. **Recommend removing it** unless
      you have a specific reason and accept the risk.
- [ ] The FAQ content on the live homepage is marked up as `FAQPage`. Carry the content
      across; the markup no longer earns a rich result for a business site, so it is
      optional.
- [ ] Add `BlogPosting` schema to blog posts, `Service` to service pages, `BreadcrumbList`
      sitewide.
- [ ] **Every fact in the schema must match `site.json` and Google Business Profile exactly.**
      A mismatched phone number or address is the single most common local-SEO own goal.

### Sitemap and robots

- [ ] **Generate `sitemap.xml` from the build**, listing only real, indexable, 200-status
      canonical URLs. No redirects in it, no 404s, no noindexed pages.
- [ ] 🔴 **Delete `Disallow: /` from `robots.txt` at go-live.** It currently blocks the
      entire site. Leaving it in place means the new site is never indexed and the traffic
      goes to zero.
- [ ] 🔴 **Delete the `X-Robots-Tag: noindex, nofollow, noarchive` line from `_headers`.**
      Same consequence. **These are two separate locks in two separate files and both must
      be lifted.** The files themselves say so — read the comments at the top of each.
- [ ] Reference the sitemap from `robots.txt`.
- [ ] Keep `/_partials/` and `/_content/` noindexed. Better: do not publish them at all.
- [ ] Old WordPress paths that should stay blocked: `/wp-admin/`, `/wp-json/`.

### Performance — the reason you are doing this

- [ ] Run Lighthouse and PageSpeed Insights on staging, mobile and desktop. Record the
      numbers. Run the same on the current live WordPress site. **You should be dramatically
      faster. If you are not, something is wrong with the build.**
- [ ] Core Web Vitals: LCP under 2.5s, CLS under 0.1, INP under 200ms.
- [ ] All images in modern formats (WebP/AVIF), correctly sized, with `width` and `height`
      set so nothing jumps as it loads.
- [ ] Lazy-load below-the-fold images; **never** lazy-load the hero image.
- [ ] Fonts: `font-display: swap`, preconnect set. *(Already in `head.html`. Consider
      self-hosting the fonts — it removes a third-party dependency and is faster still.)*
- [ ] No render-blocking scripts.

### Settle these before you build the remaining pages

Two inconsistencies are flagged in the README and still unresolved. Fix them now, not after
19 more pages have been built on top of them.

- [ ] **Typeface.** Brand reference says Playfair Display + Lato. Some page files load
      Cormorant Garamond. Pick one.
- [ ] **Accent colour.** Brand palette says Signal Orange `#F78C1E`. `tokens.css` carries
      terracotta `#BF5B25`. The library uses `#F78C1E`. Pick one.

---

# Stage 5 — Security and privacy

*Owner: ______  Target date: ______*

A static site is dramatically safer than WordPress — no database, no plugins, no login page
to attack. That is a real win. These are the things that still need doing.

### Headers

The current `_headers` file has a reasonable start. Add:

- [ ] `Strict-Transport-Security: max-age=31536000; includeSubDomains` — the live site
      already sends HSTS, so **dropping it is a downgrade**. Carry it over.
- [ ] `Content-Security-Policy`. This is the one that takes thought, because you load
      scripts from Google Tag Manager, HubSpot, Google Fonts and Google Maps. Start in
      `Content-Security-Policy-Report-Only` mode, watch what breaks for a week on staging,
      then enforce.
- [ ] `Permissions-Policy` — switch off camera, microphone, geolocation, payment. You do
      not use them.
- [ ] Keep `X-Frame-Options`, `X-Content-Type-Options`, `Referrer-Policy` as they are.
- [ ] Verify the result at securityheaders.com. Aim for an A.

### Certificates and transport

- [ ] HTTPS on from the first minute. Netlify provisions the certificate automatically,
      but **it cannot do so until DNS points at Netlify** — so there is a window. Plan the
      cutover so the certificate is issued before you announce anything (Stage 7).
- [ ] Every `http://` link on the site rewritten to `https://`. No mixed content.
- [ ] Add a **CAA record** — there is none today. It limits which certificate authorities
      can issue for your domain. Small, cheap hardening.

### Secrets — check this properly

- [ ] **No API key, Apps Script URL, sheet ID, admin code or token in any file that gets
      published.** The library README notes the old build leaked the sheet URL and key into
      the page source and that this was fixed — confirm it stayed fixed.
- [ ] `library/admin.html` must not be discoverable: `noindex`, not in the sitemap, not
      linked. Consider putting it behind Netlify password protection as well as the
      admin code.
- [ ] Rotate `ADMIN_CODE` at launch, on principle.
- [ ] If the repo ever goes to GitHub, check the **whole history** for secrets, not just
      the current files.

### Privacy and law — you are in Ontario, serving Canadians

- [ ] 🔴 **Publish a privacy policy before launch. There is not one today** — `/privacy-policy/`
      redirects to the homepage, so this is new work, not a migration.
- [ ] **Write it properly:** You collect names, emails and phone
      numbers through a form, run Google Analytics, and run HubSpot tracking. PIPEDA applies.
      It must say what you collect, why, who it is shared with (Google, HubSpot), and how
      someone asks for their data to be deleted.
- [ ] **Publish terms of use.**
- [ ] **Cookie consent.** GA4 and HubSpot both set cookies. Canada is less strict than the
      EU, but if you get any European traffic, or want to be straightforward about it,
      a simple banner with a real "decline" that actually blocks the tags is the right call.
      **Decide deliberately** — do not let it be an accident.
- [ ] Confirm the form's consent language, and that ticking it is recorded in HubSpot.
- [ ] Confirm no personal data ends up in a URL, a query string, or a GA4 event parameter.
- [ ] The audit exports in `audit-data/raw/` contain real contact
      records. **Those never go near the published site or a public repo.**

### Email deliverability — since you are touching DNS anyway

- [ ] **SPF exists** and covers both WordPress.com mail and HubSpot. After launch, the
      `_spf.wpcloud.com` include is no longer needed — but **only remove it once you are
      certain nothing sends mail through WordPress.com.**
- [ ] **DKIM appears not to be set up.** No record at `google._domainkey`. Turn on DKIM in
      the Google Workspace admin console and add the record. Free, ten minutes, materially
      improves whether your email reaches people.
- [ ] **DMARC is `p=none`** — monitoring only, enforcing nothing. Once SPF and DKIM are
      both confirmed passing, move to `p=quarantine`. Not urgent, but you are in the zone
      file anyway.

### Accounts and access

- [ ] Netlify account under a company login, 2FA on, at least two people with access.
- [ ] Domain registrar login: 2FA on, **registrar lock on**, recovery email that someone
      still reads.
- [ ] Google Workspace, GA4, GSC, GTM, HubSpot, Buildertrend — confirm you (the company,
      not one person) hold owner-level access to each. This is the moment to find out that
      a former contractor is the only owner of the GTM container.
- [ ] Remove access for anyone who has left.

---

# Stage 6 — DNS, planned in advance

*Owner: ______  Target date: ______*
*This is the stage where a mistake takes the phones down, so it gets its own stage.*

**Your DNS is hosted at WordPress.com** — `ns1.wordpress.com`, `ns2`, `ns3`. The website
records and the **email records are in the same zone.**

### What is in the zone right now

| Type | Value | What it does | Action |
|---|---|---|---|
| `A` | `192.0.78.244`, `192.0.78.162` | Points the site at WordPress.com | **Change to Netlify** |
| `CNAME www` | `granddesignbuild.com` | www → bare domain | **Change to Netlify** |
| `MX` | `1 smtp.google.com` | **Your email** | 🔴 **DO NOT TOUCH** |
| `TXT` | `v=spf1 include:_spf.wpcloud.com include:48981094.spf01.hubspotemail.net ~all` | Authorises your email senders | 🔴 **KEEP** |
| `TXT` | `google-site-verification=o1hymz…` | Search Console verification | 🔴 **KEEP** |
| `TXT _dmarc` | `v=DMARC1;p=none;` | Email policy | **KEEP** |
| `CNAME _domainconnect` | `public-api.wordpress.com/…` | WordPress.com's own plumbing | Can go after launch |

### Two ways to do it — pick one now

**Option A — keep WordPress.com's nameservers, change only the A/CNAME records.**
Lower risk. Email records are never touched because you are not replacing the zone. This
is the recommended route. It does mean keeping the WordPress.com domain service alive.

**Option B — move nameservers to Netlify (or Cloudflare).**
Cleaner long-term, one less dependency on the old host. But you must **rebuild the entire
zone by hand first**, including MX, SPF, DMARC and the Google verification, and verify it
before switching. Getting one MX record wrong takes your email down, and it takes hours to
come back.

- [ ] **Decision made and written down:** Option ____.
- [ ] **Lower the TTL to 300 seconds at least 48 hours before cutover.** This is what lets
      you roll back in minutes instead of a day. It is easy to forget and impossible to do
      retroactively.
- [ ] If Option B: build the new zone, and have a second person check the MX, SPF, DMARC
      and verification records against the table above, line by line.
- [ ] Add the domain in Netlify and complete its verification **before** cutover day.
- [ ] Confirm the redirect from `www` to the bare domain (or the reverse — just pick one and
      make it consistent with the canonical tags).

### One inconsistency to resolve first

The comments in `config/_redirects` refer to **Cloudflare Pages**, and the deployment target
in `library/README.md` and this plan is **Netlify**. The `_redirects` and `_headers` file
formats are Netlify's. Someone has been planning for two different hosts.

- [ ] **Confirm the host is Netlify**, and correct the comments in `_redirects` so the next
      person is not misled.
- [ ] **`website/config/netlify.toml` is the material library's file**, not the website's —
      it is headed "Grand Design Build -- Material Library" and sets `publish = "."`.
      Write a real one for the website build.

---

# Stage 7 — Staging: the full dress rehearsal

*Owner: ______  Target date: ______*
*Nothing on this list can be done on launch day. All of it happens on a staging URL first.*

- [ ] Deploy the complete site to a Netlify preview URL.
- [ ] **Password-protect the staging deploy.** Do not rely on `robots.txt` alone — a
      crawler that obeys `Disallow` never fetches the page and so never sees your `noindex`
      header, and Google can still list a bare URL it finds linked elsewhere. The `robots.txt`
      in this repo already explains this; act on it.
- [ ] **Run the full URL test**: every one of the 77 live URLs, plus the 341 from Search
      Console, requested against staging. **Zero unexpected 404s.**
- [ ] Every internal link resolves. `tools/build.py` does this and reports every broken
      link — the build must exit clean, with `TO_BUILD` empty.
- [ ] Every external link resolves.
- [ ] Every image loads, from your own domain.
- [ ] Forms submit, land in HubSpot, land in Buildertrend, and reach `/thank-you/`.
- [ ] GTM Preview shows every tag firing on the right pages.
- [ ] Material library: real client login, selections save, admin dashboard opens.
- [ ] Mobile, tablet, desktop. Safari, Chrome, Firefox, Edge. **iPhone Safari specifically.**
- [ ] Keyboard-only navigation works. Colour contrast passes. Every image has alt text.
      Every form field has a label.
- [ ] Print a page — the material library schedule especially.
- [ ] 404 page exists, looks right, and returns a **real 404 status** (not 200).
- [ ] Favicon and Apple touch icon present.
- [ ] Lighthouse run and recorded.
- [ ] **Someone who did not build it reads every page for typos and wrong facts.**
- [ ] Phone number, address and hours correct on every page and in the schema.
- [ ] Rollback plan written down, one page, in plain steps (Stage 9).

---

# Stage 8 — Cutover day

*Owner: ______  Target date/time: ______*

**Launch on a Tuesday or Wednesday morning.** Never a Friday, never before a holiday. You
want the whole team available for the next 48 hours.

### The day before

- [ ] TTL confirmed at 300s (set 48h ago).
- [ ] Final WordPress content freeze — genuinely final.
- [ ] Final content sync: anything published on WordPress since the freeze is now on the
      new site.
- [ ] Final full backup of WordPress.
- [ ] Team told: what is changing, when, and who to tell if something looks wrong.
- [ ] The staging site passes every check in Stage 7.

### Launch sequence — in this order

1. [ ] **Deploy the production build to Netlify.**
2. [ ] 🔴 **Remove `Disallow: /` from `robots.txt`.**
3. [ ] 🔴 **Remove `X-Robots-Tag: noindex…` from `_headers`.**
4. [ ] **Verify both are actually gone from the deployed site** — fetch `robots.txt` and
       check the response headers. Do not assume.
5. [ ] **Change the DNS A record and the www CNAME to Netlify.**
6. [ ] **Watch for the HTTPS certificate to be issued.** Do not announce until it is.
7. [ ] **Confirm the site loads** on `https://granddesignbuild.com` and on `www`.
8. [ ] **Send a test email to and from an @granddesignbuild.com address.** Email first —
       it is the thing that hurts most if it is broken.
9. [ ] **Submit a real test lead** through the live form. Confirm HubSpot, confirm
       Buildertrend, confirm it reached `/thank-you/`.
10. [ ] **GA4 Realtime** shows your own visit.
11. [ ] **Spot-check 20 redirects** from the live list — including
        `most-expensive-homes-in-canada`, which is your highest-traffic URL.
12. [ ] **Submit the new sitemap in Search Console.**
13. [ ] **Request indexing** on the homepage and the top 10 pages.
14. [ ] **Add the GA4 annotation.**
15. [ ] **Test the material library login** as a real client would.
16. [ ] **Check the Google Business Profile link** resolves to the new site.

### Within the first hour

- [ ] Run a crawl of the whole live site. Zero 404s, zero broken images, zero redirect chains.
- [ ] Check the site on a phone on mobile data, not office wifi.
- [ ] Check one page in an incognito window — no stale cache fooling you.
- [ ] Check the Netlify deploy log for warnings.

---

# Stage 9 — The first 48 hours, then the first 30 days

*Owner: ______*

### Every few hours for two days

- [ ] Search Console → Pages report, for new 404s and crawl errors.
- [ ] GA4 Realtime — traffic still arriving.
- [ ] A test lead through the form each day. **This is the one people forget.**
- [ ] Email still sending and receiving.
- [ ] Netlify analytics or logs for 404 spikes.

### Week one

- [ ] Compare daily sessions against the same weekday last month. A dip of 5–15% for a
      week or two is normal while Google recrawls. **A drop over 30%, or a drop that is
      still there after three weeks, means something is wrong — go and find it.**
- [ ] Watch Search Console Coverage: indexed pages should climb toward 77 and stay there.
- [ ] Watch average position on your top 20 queries.
- [ ] Every 404 in the logs gets a redirect the same day.
- [ ] Check Core Web Vitals in Search Console as field data starts arriving.

### Weeks two to four

- [ ] Rankings should be back to baseline or better by week four. If not, diagnose properly:
      missing redirects first, then missing content, then missing internal links.
- [ ] Confirm lead volume in HubSpot matches or beats the pre-launch rate.
- [ ] Fix any redirect chains that showed up.
- [ ] **Only once everything is stable for 30 days**, retire the WordPress.com plan —
      and keep the export files forever.

### Rollback — write this out before launch day

If the site is badly broken and cannot be fixed within the hour:

1. Change the DNS A record and www CNAME back to `192.0.78.244` / `192.0.78.162`.
2. With a 300s TTL, most visitors are back on WordPress within 5–15 minutes.
3. The WordPress site is still there, still paid for, unchanged.
4. Fix the problem on staging. Do not relaunch the same day.

**This only works if you kept the WordPress plan alive and lowered the TTL in advance.**
Both are in this plan for exactly this reason.

---

## Owners and dates

Fill this in. A checklist with no name against it is a wish.

| Stage | What | Owner | Target | Done |
|---|---|---|---|---|
| 0 | Freeze and export everything off WordPress | | | ☐ |
| 1 | Inventory of content and integrations | | | ☐ |
| 2 | 🔴 Close the 404 gap — build or redirect all 57 | | | ☐ |
| 3 | Re-wire HubSpot, GTM/GA4, GSC, GBP, library | | | ☐ |
| 4 | SEO parity, schema, performance | | | ☐ |
| 5 | Security headers, privacy policy, secrets, access | | | ☐ |
| 6 | DNS plan decided, TTL lowered | | | ☐ |
| 7 | Staging dress rehearsal, all green | | | ☐ |
| 8 | Cutover | | | ☐ |
| 9 | 48-hour watch, then 30-day watch | | | ☐ |

---

## The short version, if you read nothing else

1. **Do not launch until the 57 missing URLs are built or redirected.** Everything else is
   recoverable. That one is what kills rankings.
2. **Do not touch the MX or SPF records.** The website and the email share a zone.
3. **Remove the two noindex locks** — `robots.txt` and `_headers`. Both. Verify both.
4. **Lower the TTL 48 hours ahead and keep WordPress paid for 90 days.** That is your
   undo button.
5. **Test a real lead through the real form on the real site on launch day**, and again
   every day that week.
