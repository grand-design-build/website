import json, re, sys, html
from html.parser import HTMLParser

TEXT_TAGS = {'h1','h2','h3','h4','h5','h6','p','li','summary','blockquote','figcaption'}

class Ex(HTMLParser):
    def __init__(self):
        super().__init__(convert_charrefs=True)
        self.out=[]
        self.stack=[]   # open text tags (tag, buf, cls)
        self.depth_skip=0
    def handle_starttag(self, tag, attrs):
        a=dict(attrs)
        cls=a.get('class','')
        if tag=='img':
            src=a.get('src','')
            src=re.sub(r'\?.*$','',src)
            self.out.append(('IMG', f"{src} | alt={a.get('alt','')} | {a.get('width','')}x{a.get('height','')}"))
            return
        if tag in TEXT_TAGS:
            self.stack.append([tag, [], cls])
        elif ('accordion-title' in cls or 'toggle-title' in cls
              or 'e-n-accordion-item-title-text' in cls or 'elementor-tab-title' in cls):
            self.stack.append(['ACC', [], cls])
        elif tag=='div' and ('text-base' in cls or 'description' in cls or 'icon-list-text' in cls):
            self.stack.append(['TXT', [], cls])
    def handle_endtag(self, tag):
        if not self.stack: return
        # close innermost matching-ish
        top=self.stack[-1]
        if top[0]==tag or (top[0]=='TXT' and tag=='div') or (top[0]=='ACC' and tag in ('span','div','a','summary')):
            t,buf,cls=self.stack.pop()
            txt=re.sub(r'\s+',' ',''.join(buf)).strip()
            if txt:
                self.out.append((t.upper(), txt))
    def handle_data(self, d):
        if self.stack:
            self.stack[-1][1].append(d)

def run(slug):
    pages=json.load(open('_archive/wordpress-era/wp-data/pages.json'))
    p=[x for x in pages if x['slug']==slug][0]
    c=p['content']['rendered']
    c=re.sub(r'<(script|style)\b.*?</\1>','',c,flags=re.S|re.I)
    e=Ex(); e.feed(c)
    print(f"### SLUG: {slug}")
    print(f"### TITLE: {html.unescape(p['title']['rendered'])}")
    print(f"### LINK: {p['link']}")
    print(f"### MODIFIED: {p['modified']}")
    print('---')
    seen=set()
    for k,v in e.out:
        key=(k,v)
        if k!='IMG' and key in seen: continue
        seen.add(key)
        print(f"[{k}] {v}")

for s in sys.argv[1:]:
    run(s); print('\n'+'='*90+'\n')
