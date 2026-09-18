# -*- coding: utf-8 -*-
"""Map the transcribed content onto the master template's blocks and running order.

The template sets the order for a location page:
    Hero, Intro, Topic Breakdown, Why Us (short), Testimonials, FAQ,
    Cross-Link, Final CTA
Process Steps and the Portfolio Teaser are kept where the live page has them.
"""

def normalize(page):
    intros, topic, steps, whyus, nearby, photos = [], [], [], [], [], []

    for b in page['blocks']:
        t = b['type']
        if t == 'context':                       # prose section -> INTRO block
            intros.append(dict(b, type='intro'))
        elif t == 'figure':                      # loose photo -> PORTFOLIO TEASER
            photos.append(b['image'])
        elif t == 'gallery':
            photos.extend(b['items'])
        elif t in ('cards', 'expand'):
            topic.append(b)
        elif t == 'features':
            if b.get('tinted'):
                whyus.append(b)
            elif b.get('title') in AS_TOPIC_BLOCKS:
                topic.append(as_topic(b))
            else:
                topic.append(b)
        elif t == 'steps':
            steps.append(b)
        elif t == 'areas':
            nearby.append(dict(b, type='nearby'))
        elif t == 'reviews':
            pass                                 # testimonials are now sitewide
        else:
            raise ValueError('unknown block type %r' % t)

    photos = [p for p in photos if is_project_photo(p)]
    portfolio = []
    if photos:
        portfolio = [{'type': 'portfolio', 'eyebrow': 'See the Work',
                      'title': 'Our %s Projects' % page['place'],
                      'items': photos}]

    # The first intro carries no eyebrow/title: it is the lead paragraph block.
    if intros:
        intros[0] = {k: v for k, v in intros[0].items() if k not in ('eyebrow', 'title')}

    page = dict(page)
    page['blocks'] = intros + topic + portfolio + steps + whyus + nearby
    return page


# Blocks whose live copy is a set of headed topics with real paragraphs under
# them are the template's "Topic Breakdown", so they belong in EXPANDABLE TOPIC
# BLOCKS rather than the SHORT FEATURE LIST. Listed by title so the choice is
# visible rather than guessed at from string lengths.
AS_TOPIC_BLOCKS = {
    'Requirements to Build in Bayview Village',
    'What a Ledbury Park Build Involves',
    'What Working on a Semi Actually Means',
    'What Willowdale Projects Actually Involve',
}


def as_topic(b):
    """features -> expand, turning each '<Lead.> <body>' bullet into a headed block."""
    items = []
    for lead, body in b['items']:
        items.append((lead.rstrip('.:'), body))
    return {'type': 'expand', 'eyebrow': b.get('eyebrow', 'Good To Know'),
            'title': b['title'], 'sub': b.get('sub'), 'items': items}


# Photographs of the Avenue Road design centre, not of a project. The live
# pages use them as section imagery; under a heading that says "Our <Place>
# Projects" they read as a false claim, so they are kept out of the teaser.
DESIGN_CENTRE_PHOTOS = (
    'showroom-3', 'showroom-4', 'GDB-ground-floor', '1558-avenue-rd',
)


def is_project_photo(item):
    src = item[0]
    return not any(k in src for k in DESIGN_CENTRE_PHOTOS)
