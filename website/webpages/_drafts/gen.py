# -*- coding: utf-8 -*-
"""Build website/webpages/locations/*.html from the live granddesignbuild.com copy.

MARKUP COMES FROM global/templates/location.html — the master template. Every
block below is one of the template's named sections, emitted verbatim apart from
the copy poured into it. The template's header sets the running order for a
location page:

    Hero, Intro, Topic Breakdown, Why Us (short), Testimonials, FAQ,
    Cross-Link, Final CTA -- dropping Subtype Grid and Data Table.

Process Steps is kept where the live page actually has a process section, and the
Portfolio Teaser is kept where the live page has real project photography.

Content source: _archive/wordpress-era/wp-data/pages.json.
"""
import html, os, io


def e(s):
    return html.escape(s, quote=False)


SERVICES = [
    ("✎", "Design &amp; Permits",  "/services/design-and-permits/"),
    ("⌂", "Home Renovation",       "/services/home-renovation/"),
    ("＋", "Home Addition",         "/services/home-addition/"),
    ("◆", "Custom Build",          "/services/custom-build/"),
    ("▢", "Laneway Suites",        "/services/laneway-housing/"),
    ("✦", "Project Management",    "/services/project-management/"),
]

# Real Google reviews, per the template's note on the testimonials block.
REVIEWS = [
    ('"Grand Design Build exceeded every expectation we had. From the very first '
     'consultation, they were professional, transparent, and truly passionate about their work."',
     'Will', 'Custom Build'),
    ('"I had a really good experience working with Grand Design Build on my home '
     'renovation and rear addition project."',
     'Hasan G.', 'Renovation &amp; Addition'),
    ('"Organized, kept us informed through each step. Reliable with timelines and '
     'very clear about costs and materials."',
     'Lima Rodwesko', 'Renovation'),
]

HEAD = '''<!DOCTYPE html>
<html lang="en-CA">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>{title}</title>
<meta name="description" content="{desc}">
<link rel="canonical" href="https://granddesignbuild.com/{slug}/">
<meta property="og:type" content="website">
<meta property="og:site_name" content="Grand Design Build">
<meta property="og:title" content="{title}">
<meta property="og:description" content="{desc}">
<meta property="og:url" content="https://granddesignbuild.com/{slug}/">
<meta property="og:image" content="https://granddesignbuild.com{hero}">
<meta name="twitter:card" content="summary_large_image">

<!-- #include head -->
<!-- /include head -->

<!-- #include schema -->
<!-- /include schema -->

<script type="application/ld+json">
{{
  "@context": "https://schema.org",
  "@graph": [
    {{
      "@type": "Service",
      "name": "Custom Home Building in {place}",
      "provider": {{
        "@id": "https://granddesignbuild.com/#business"
      }},
      "areaServed": {{
        "@type": "Place",
        "name": "{place}"
      }},
      "url": "https://granddesignbuild.com/{slug}/",
      "description": "{desc}"
    }},
    {{
      "@type": "BreadcrumbList",
      "itemListElement": [
        {{
          "@type": "ListItem",
          "position": 1,
          "name": "Home",
          "item": "https://granddesignbuild.com/"
        }},
        {{
          "@type": "ListItem",
          "position": 2,
          "name": "Locations",
          "item": "https://granddesignbuild.com/our-portfolio/"
        }},
        {{
          "@type": "ListItem",
          "position": 3,
          "name": "{place}",
          "item": "https://granddesignbuild.com/{slug}/"
        }}
      ]
    }}
  ]
}}
</script>
<!-- TODO: FAQPage schema. The questions and answers on this page are the real
     ones from the live site, but the copy is not signed off yet -- add the
     markup once it is, not before. -->

</head>
<body>

<!-- #include header -->
<!-- /include header -->


<div class="breadcrumb">
  <a href="/">Home</a><span class="sep">/</span><a href="/our-portfolio/">Locations</a><span class="sep">/</span><span class="here">{place}</span>
</div>

<!-- ===================== HERO ===================== -->
<div class="hero" style="background-image:url({hero});">
  <div class="hero-inner">
    <p class="eyebrow">{eyebrow}</p>
    <h1>{h1}</h1>
    <p>{herosub}</p>
    <div class="hero-ctas">
      <a class="btn" href="/contact-us/">Start Your Project</a>
      <a class="btn outline" href="/contact-us/">Book Consultation</a>
    </div>
  </div>
</div>

<!-- ===================== TRUST BAR ===================== -->
<div class="trust-strip">
  HCRA Licensed &amp; Fully Insured<span class="sep">·</span>15+ Years in Business<span class="sep">·</span>250+ Projects Completed<span class="sep">·</span><span class="star">★★★★★</span> 4.9 (30 Google Reviews)
</div>
'''

FINAL = '''
<!-- ===================== FINAL CTA ===================== -->
<div class="final">
  <p class="eyebrow">Ready When You Are</p>
  <h2>{cta_title}</h2>
  <p>{cta_body}</p>
  <div class="final-grid">
    <form class="final-form" onsubmit="return false;">
      <div class="field"><label>Name</label><input type="text" placeholder="Your name"></div>
      <div class="field"><label>Email or Phone</label><input type="text" placeholder="How we reach you"></div>
      <div class="field"><label>Postal Code</label><input type="text" placeholder="e.g. M5M 3X5"></div>
      <div class="field">
        <label>What are you looking for?</label>
        <select>
          <option>Renovation</option>
          <option>Addition</option>
          <option>Custom Home Build</option>
          <option>Laneway or Garden Suite</option>
          <option>Multiplex</option>
          <option>Property Management</option>
          <option>Commercial</option>
          <option>Other</option>
        </select>
      </div>
      <button type="submit">Send My Details</button>
    </form>
    <div>
      <div class="final-contact-card">
        <div class="c-item"><div class="icon">☎</div><div><b>Call Us</b><span class="val">(416) 920-6066</span><span class="note">Real person, not a call centre</span></div></div>
        <div class="c-item"><div class="icon">✉</div><div><b>Email Us</b><span class="val">info@granddesignbuild.com</span><span class="note">Response within 24 hours</span></div></div>
        <div class="c-item"><div class="icon">⌂</div><div><b>Visit the Design Centre</b><span class="val">1558 Avenue Road, North York</span><span class="note">Materials and selections, one visit</span></div></div>
        <div class="c-item"><div class="icon">◔</div><div><b>Hours</b><span class="val">Mon–Fri, 8am–4pm</span><span class="note">Saturdays by appointment only</span></div></div>
      </div>
      <div class="final-map">
        <div class="pin">📍</div>
        <div class="tag"><span>1558 Avenue Road, North York</span><a href="/contact-us/">Directions</a></div>
      </div>
    </div>
  </div>
</div>


<!-- #include footer -->
<!-- /include footer -->

</body>
</html>
'''


def head(b, first, banner):
    """Open a template section, with its comment banner."""
    o = '\n<!-- ===================== %s ===================== -->\n' % banner
    o += '<section%s>\n  <div class="wrap%s">\n' % (
        '' if first else ' style="padding-top:0;"',
        b.get('wrapclass', ''))
    if b.get('eyebrow'):
        o += '    <p class="eyebrow">%s</p>\n' % e(b['eyebrow'])
    if b.get('title'):
        o += '    <h2 class="sec-title">%s</h2>\n' % e(b['title'])
    if b.get('sub'):
        o += '    <p class="sec-sub">%s</p>\n' % e(b['sub'])
    return o


def close():
    return '  </div>\n</section>\n'


# --------------------------------------------------------------------- INTRO
def block_intro(b, first):
    o = head(dict(b, wrapclass=' intro'), first, 'INTRO')
    for p in b['paras']:
        o += '    <p>%s</p>\n' % e(p)
    return o + close()


# ------------------------------------------------- SECOND DETAIL CARD GRID
def block_cards(b, first):
    o = head(b, first, 'DETAIL CARD GRID')
    o += '    <div class="card-grid">\n'
    for h3, body in b['items']:
        o += '      <div class="card"><h3>%s</h3><p>%s</p></div>\n' % (e(h3), e(body))
    o += '    </div>\n'
    return o + close()


# ----------------------------------------------------------- PORTFOLIO TEASER
def block_portfolio(b, first):
    o = head(b, first, 'PORTFOLIO TEASER')
    # One or two photographs share the row instead of sitting at a third width.
    n = len(b['items'])
    o += '    <div class="card-grid%s">\n' % (' photos-%d' % n if n < 3 else '')
    for src, alt, w, h in b['items']:
        o += ('      <div class="card" style="padding:0;"><div class="photo" style="margin:0;">'
              '<img src="%s" alt="%s" width="%s" height="%s" loading="lazy" decoding="async">'
              '</div></div>\n' % (src, e(alt), w, h))
    o += '    </div>\n'
    o += ('    <p style="text-align:center; margin-top:28px;"><a href="/our-portfolio/" '
          'style="color:var(--accent); font-weight:700; font-size:0.9rem; text-decoration:none;">'
          'View Full Portfolio →</a></p>\n')
    return o + close()


# ------------------------------------------------------ EXPANDABLE TOPIC BLOCKS
def block_expand(b, first):
    o = head(dict(b, wrapclass='" style="max-width:820px;'), first, 'EXPANDABLE TOPIC BLOCKS')
    for i, (h3, body) in enumerate(b['items']):
        paras = body if isinstance(body, list) else [body]
        o += '    <div class="expand-block%s" data-expand>\n' % (' open' if i == 0 else '')
        o += '      <div class="expand-head"><h3>%s</h3><span class="chevron">▾</span></div>\n' % e(h3)
        o += '      <div class="expand-body">%s</div>\n' % ''.join('<p>%s</p>' % e(p) for p in paras)
        o += '    </div>\n'
    return o + close()


# --------------------------------------------------------- SHORT FEATURE LIST
def block_features(b, first):
    inner = head(b, False if b.get('tinted') else first, 'SHORT FEATURE LIST')
    inner += '    <ul class="feature-list">\n'
    for i, item in enumerate(b['items'], 1):
        if isinstance(item, tuple):
            # The lead sits on its own line as the point's heading, so the
            # trailing colon or full stop it carried inline has to go.
            body = '<b>%s</b> %s' % (e(item[0].rstrip('.:')), e(item[1]))
        else:
            body = e(item)
        inner += '      <li><span class="mark">%02d</span><span>%s</span></li>\n' % (i, body)
    inner += '    </ul>\n'
    if b.get('after'):
        inner += '    <p class="sec-sub" style="margin:36px auto 0;">%s</p>\n' % e(b['after'])
    inner += close()
    if b.get('tinted'):
        return ('\n<div style="background:var(--bg-soft); border-top:1px solid var(--rule); '
                'border-bottom:1px solid var(--rule);">' + inner + '</div>\n')
    return inner


# ----------------------------------------------------------------- Q&A CALLOUT
def block_qa(b, first):
    o = head(b, first, 'STANDALONE Q&A CALLOUT')
    o += '    <div class="qa-callout">\n      <h3>%s</h3>\n' % e(b['q'])
    for p in b['paras']:
        o += '      <p>%s</p>\n' % e(p)
    o += '    </div>\n'
    return o + close()


# --------------------------------------------------------------- PROCESS STEPS
def block_steps(b, first):
    o = head(b, first, 'PROCESS STEPS')
    for s in b.get('subs', []):
        o += '    <p class="sec-sub">%s</p>\n' % e(s)
    o += '    <div class="steps">\n'
    for i, (h3, body) in enumerate(b['items'], 1):
        o += '      <div class="step"><div class="n">%02d</div><h3>%s</h3><p>%s</p></div>\n' % (i, e(h3), e(body))
    o += '    </div>\n'
    o += ('    <div style="text-align:center; margin-top:40px;">\n'
          '      <div class="hero-ctas">\n'
          '        <a class="btn" href="/contact-us/">Start Your Project</a>\n'
          '        <a class="btn outline" href="/contact-us/">Book Consultation</a>\n'
          '      </div>\n    </div>\n')
    return o + close()


# ---------------------------------------------------------------- TESTIMONIALS
def block_reviews(b, first):
    o = '\n<!-- ===================== TESTIMONIALS ===================== -->\n'
    o += ('<div style="background:var(--bg-soft); border-top:1px solid var(--rule); '
          'border-bottom:1px solid var(--rule);">\n')
    o += '<section>\n  <div class="wrap">\n'
    o += '    <p class="eyebrow">Proof, Not Promises</p>\n'
    o += '    <h2 class="sec-title">What Our Clients Say</h2>\n'
    o += '    <div class="reviews-grid">\n'
    for quote, who, tag in REVIEWS:
        o += ('      <div class="rev-card"><div class="stars">★★★★★</div><p>%s</p>'
              '<cite>— %s</cite><span class="tag">%s</span></div>\n' % (e(quote), e(who), tag))
    o += '    </div>\n' + close() + '</div>\n'
    return o


# --------------------------------------------------------- CROSS-LINK (AREAS)
def block_nearby(b, first):
    o = head(b, first, 'CROSS-LINK: NEARBY AREAS')
    o += '    <div class="crosslink-grid">\n'
    for label, href in b['items']:
        if href:
            o += '      <a class="crosslink-item" href="%s"><span class="icon">⌂</span>%s</a>\n' % (href, e(label))
        else:
            o += ('      <span class="crosslink-item" style="opacity:0.65;">'
                  '<span class="icon">⌂</span>%s</span>\n' % e(label))
    o += '    </div>\n'
    if b.get('after'):
        o += '    <p class="sec-sub" style="margin:28px auto 0;">%s</p>\n' % e(b['after'])
    return o + close()


BLOCKS = {
    'intro': block_intro, 'cards': block_cards, 'portfolio': block_portfolio,
    'expand': block_expand, 'features': block_features, 'qa': block_qa,
    'steps': block_steps, 'reviews': block_reviews, 'nearby': block_nearby,
}


def faq_section(page):
    o = '\n<!-- ===================== FAQ ===================== -->\n'
    o += '<section>\n  <div class="wrap">\n'
    o += '    <p class="eyebrow">Questions</p>\n'
    o += '    <h2 class="sec-title">%s</h2>\n' % e(page.get('faq_title', 'FAQs'))
    o += '    <div class="faq">\n'
    for i, (q, a) in enumerate(page['faqs']):
        paras = a if isinstance(a, list) else [a]
        o += '      <div class="faq-item%s" data-faq>\n' % (' open' if i == 0 else '')
        o += ('        <button class="faq-q" type="button"><span>%s</span>'
              '<span class="chevron">▾</span></button>\n' % e(q))
        o += '        <div class="faq-a">%s</div>\n' % ''.join('<p>%s</p>' % e(p) for p in paras)
        o += '      </div>\n'
    o += '    </div>\n'
    return o + close()


def crosslinks():
    o = '\n<!-- ===================== CROSS-LINK: EXPLORE OTHER SERVICES ===================== -->\n'
    o += '<section style="padding-top:0;">\n  <div class="wrap">\n'
    o += '    <p class="eyebrow">Explore</p>\n    <h2 class="sec-title">Our Services</h2>\n'
    o += '    <div class="crosslink-grid">\n'
    for icon, label, href in SERVICES:
        o += '      <a class="crosslink-item" href="%s"><span class="icon">%s</span>%s</a>\n' % (href, icon, label)
    o += '    </div>\n'
    return o + close()


def render(page):
    out = HEAD.format(
        title=e(page['title']), desc=e(page['desc']), slug=page['slug'],
        place=e(page['place']), hero=page['hero'], eyebrow=e(page['eyebrow']),
        h1=e(page['h1']), herosub=e(page['herosub']),
    )
    first = True
    for b in page['blocks']:
        out += BLOCKS[b['type']](b, first)
        first = False
    out += block_reviews({}, False)
    out += faq_section(page)
    out += crosslinks()
    out += FINAL.format(cta_title=e(page['cta_title']), cta_body=e(page['cta_body']))
    return out


def build(pages, outdir):
    for p in pages:
        path = os.path.join(outdir, p['file'])
        with io.open(path, 'w', encoding='utf-8') as f:
            f.write(render(p))
        print('wrote %-28s %6d bytes' % (p['file'], os.path.getsize(path)))
