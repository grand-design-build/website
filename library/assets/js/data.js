/* ==========================================================================
   MATERIAL LIBRARY -- data layer
   The Google Sheet is the CMS. This fetches it, repairs the messy bits, and
   hands the app a clean catalogue. Nothing here touches the DOM.
   ========================================================================== */
window.GDB = window.GDB || {};

GDB.CFG = {
  /* The library's own API, running as a Netlify Function beside the site. It is
     the same origin as the page, so there is no CORS hop and no third party in
     the path. It replaced a Google Apps Script backend that read the catalogue
     out of a spreadsheet: that took six to ten seconds and could only run one
     request at a time per account, so calls queued behind each other. */
  API: "/api",

  SHOW_PRICES: true,
  COMPARE_MAX: 3,
  STORE: "gdb_material_library_v3",
  SESSION: "gdb_material_session"
};

/* ------------------------------------------------------------------ session */
/* The token is minted and signed by the backend and lives in sessionStorage,
   so it is gone when the tab closes. Nothing is readable without one -- the
   catalogue included. */
GDB.session = {
  get: function(){
    try{ return JSON.parse(sessionStorage.getItem(GDB.CFG.SESSION) || "null"); }
    catch(e){ return null; }
  },
  set: function(v){
    try{ sessionStorage.setItem(GDB.CFG.SESSION, JSON.stringify(v)); }catch(e){}
  },
  clear: function(){
    try{ sessionStorage.removeItem(GDB.CFG.SESSION); }catch(e){}
    try{ localStorage.removeItem(GDB.CFG.STORE); }catch(e){}
  }
};

/* Apps Script has no CORS preflight, so everything goes as text/plain -- that
   keeps the request "simple" and the browser sends it without an OPTIONS hop. */
GDB.call = function(action, body, again){
  var payload = body || {};
  payload.action = action;
  var ses = GDB.session.get();
  if(ses && ses.token && !payload.token) payload.token = ses.token;

  return fetch(GDB.CFG.API, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload)
  })
  .then(function(r){ return r.text(); })
  .then(function(text){
    var d;
    /* A slow call can come back as Google's own HTML page rather than JSON. */
    try{ d = JSON.parse(text); }
    catch(e){ throw new Error("__stale__"); }

    /* Under load Apps Script follows a POST's redirect as a GET and answers
       with the health check. EVERY real reply names the action it answers --
       errors included -- so one that does not is not an answer to this call.
       This has to be tested before d.error, or the health check's own "Use
       POST" message gets shown to the person as though it were their problem. */
    if(d && !d.forAction) throw new Error("__stale__");
    if(d && d.forAction !== action) throw new Error("__stale__");
    if(d && d.error) throw new Error(d.error);
    return d;
  })
  .catch(function(err){
    /* A dropped connection looks the same from here and deserves the same
       second chance -- on a cold Apps Script the first call often loses. */
    var stale = err.message === "__stale__" || /Failed to fetch|NetworkError|Load failed/i.test(err.message);
    if(!stale) throw err;
    /* Every action here can be repeated without leaving a mark: the reads
       obviously, and save because it rewrites the whole palette rather than
       adding to it. */
    if(!again) return GDB.call(action, body, true);
    throw new Error("The library did not answer. Check your connection and try again.");
  });
};

/* Room tiles use Grand Design Build's own project photography, not the stock
   URLs that ended up in the sheet. Add a room here and drop a matching jpg in
   assets/img/rooms/ to change the cover. */
GDB.ROOM_PHOTO = {
  "Kitchen":            "assets/img/rooms/kitchen.jpg",
  "Bathroom":           "assets/img/rooms/bathroom.jpg",
  "Flooring":           "assets/img/rooms/flooring.jpg",
  "Doors":              "assets/img/rooms/doors.jpg",
  "Windows":            "assets/img/rooms/windows.jpg",
  "Trims":              "assets/img/rooms/trims.jpg",
  "Hardware":           "assets/img/rooms/hardware.jpg",
  "Lighting":           "assets/img/rooms/lighting.jpg",
  "Railing":            "assets/img/rooms/railing.jpg",
  "Exterior Finishes":  "assets/img/rooms/exterior-finishes.jpg"
  /* Tiles and Paint arrived with the Houzz library and have no photograph of
     their own yet. Drop a jpg in assets/img/rooms/ and name it here; until
     then their tile falls back to the plain card. */
};

/* Rooms appear in this order; anything unlisted follows, alphabetically. */
GDB.ROOM_ORDER = ["Kitchen","Bathroom","Tiles","Flooring","Doors","Windows",
                  "Trims","Hardware","Lighting","Railing","Exterior Finishes","Paint"];

/* -------------------------------------------------------------- utilities */
GDB.esc = function(s){
  var d = document.createElement("div");
  d.textContent = s == null ? "" : String(s);
  return d.innerHTML;
};
GDB.money = function(n){
  if(!n && n !== 0) return "";
  /* A round number reads better bare -- $450, not $450.00 -- but once there
     are cents there must be two of them, or a total lands as "$2,268.2". */
  var frac = (n % 1) ? 2 : 0;
  return "$" + Number(n).toLocaleString("en-CA", {
    maximumFractionDigits: frac, minimumFractionDigits: frac
  });
};
/* Google refuses to serve a Drive-hosted image when the request carries a
   referrer -- every photo uploaded from the dashboard would 403. Suppressing
   the referrer fixes it, but only Google needs that: some supplier CDNs allow
   their own referrer and block an empty one, so this is applied by host. */
GDB.imgRef = function(src){
  return /(^https?:\/\/)(lh\d+\.googleusercontent\.com|drive\.google\.com)\//.test(String(src||""))
    ? ' referrerpolicy="no-referrer"' : "";
};

GDB.key = function(s){ return String(s||"").toLowerCase().replace(/[^a-z0-9]/g,""); };
GDB.pid = function(p){ return GDB.key(p.area)+"~"+GDB.key(p.cat)+"~"+GDB.key(p.brand)+"~"+GDB.key(p.name); };
GDB.selId = function(p,fin){ return GDB.pid(p)+"~"+GDB.key(fin||""); };

/* ALL-CAPS sheet entries read as shouting; leave mixed case alone. */
GDB.titleish = function(s){
  s = String(s||"").trim();
  if(!s || s !== s.toUpperCase()) return s;
  return s.toLowerCase()
    .replace(/\b([a-z])/g, function(m,c){ return c.toUpperCase(); })
    .replace(/\bAnd\b/g,"and").replace(/\bOf\b/g,"of");
};

/* "SQ. FT." -> "per sq ft", "1 Each" -> "each" */
GDB.unitise = function(u){
  u = String(u||"").trim().toLowerCase().replace(/\.$/,"");
  if(!u) return "";
  u = u.replace(/^1\s+/,"")
       .replace(/sq\.?\s*ft\.?/,"sq ft")
       .replace(/lin\.?\s*ft\.?/,"linear ft");
  if(u === "each" || u === "ea") return "each";
  return /^per\b/.test(u) ? u : "per " + u;
};

/* Material photography looks better cropped; cut-out product shots on white
   look better contained. Guess from the category. */
GDB.isCover = function(p){
  return /tile|stone|counter|floor|slab|carpet|siding|masonry|cladding|backsplash|surface/i
    .test((p.cat||"") + " " + (p.sub||""));
};

/* ------------------------------------------------------- colours/finishes */
GDB.COLOR_MAP = {
  white:"#FFFFFF","off white":"#F7F4EF",ivory:"#FFFFF0",cream:"#F5EEDC",champagne:"#F7E7CE",
  beige:"#F5F5DC",sand:"#E4D2B0",taupe:"#B8A088",greige:"#C4BBAE",stone:"#B8AFA0",linen:"#FAF0E6",
  charcoal:"#3A3A3A",black:"#111111","matte black":"#1A1A1A",ebony:"#2E2825",graphite:"#3D3D3D",
  grey:"#8A8378",gray:"#8A8378",slate:"#5C6670",pewter:"#8E8C84",
  navy:"#1B2A4A",blue:"#3B6FA0",teal:"#357C7C",green:"#4C6B4E",sage:"#9CAF88",
  olive:"#6B6B3A",forest:"#2E4A34",
  brown:"#6B4A2F",walnut:"#5A3E2B",espresso:"#3B2A20",oak:"#B08D57","natural oak":"#C9A36B",
  "smoked oak":"#6B5240",chocolate:"#4A2E1E",maple:"#D8B589",cherry:"#8E4B32",
  red:"#8C3A2B",terracotta:"#E2725B",rust:"#B5502D",brick:"#9C4A3A",
  orange:"#D97D3D",amber:"#C98A2E",yellow:"#D9B94A",
  gold:"#C8A96E",brass:"#B08D3D","brushed gold":"#C3A15C","polished brass":"#C6A24B",
  pink:"#D9A9A0",blush:"#E6C6BE",mauve:"#9E7B85",purple:"#6B5170",plum:"#5B3A5A",
  chrome:"#CFD3D6","polished chrome":"#D4D8DB",nickel:"#B9BCB6","brushed nickel":"#C0C2BC",
  "stainless steel":"#C7CBCE",stainless:"#C7CBCE",silver:"#C7C7C7",
  bronze:"#8A5A32","oil rubbed bronze":"#4A3B30",copper:"#B36A45",gunmetal:"#5A5F63"
};
GDB.swatchColor = function(name){
  var k = String(name||"").trim().toLowerCase();
  if(!k) return "#CFC6B6";
  if(GDB.COLOR_MAP[k]) return GDB.COLOR_MAP[k];
  var w = k.split(/\s+/);
  for(var i = w.length - 1; i >= 0; i--) if(GDB.COLOR_MAP[w[i]]) return GDB.COLOR_MAP[w[i]];
  return "#CFC6B6";
};

/* Accepts whatever the sheet hands over:
     ["White","Charcoal"]                       plain names
     [{name:"White",img:"..."}]                 objects
     "White | Charcoal = https://.../c.jpg"     one raw cell
   Separators: |  ;  or a line break. */
GDB.parseColors = function(raw){
  var list = [];
  if(!raw) return list;
  if(typeof raw === "string") raw = raw.split(/\s*[|;\n]\s*/);
  if(!Array.isArray(raw)) return list;

  raw.forEach(function(c){
    var name = "", img = "";
    if(c && typeof c === "object"){
      name = c.name || c.colour || c.color || "";
      img  = c.img || c.image || c.url || "";
    } else if(typeof c === "string"){
      var m = c.match(/^(.*?)\s*=\s*(https?:\/\/\S+)$/) || c.match(/^(.*?)\s+(https?:\/\/\S+)$/);
      if(m){ name = m[1]; img = m[2]; } else { name = c; }
    }
    name = String(name||"").trim();
    img  = String(img||"").trim();
    if(/example\.com/i.test(img)) img = "";
    if(name || img) list.push({ name: name || ("Finish " + (list.length+1)), img: img, hex: GDB.swatchColor(name) });
  });
  return list;
};

/* -------------------------------------------------------------- normalise */
GDB.normalise = function(raw, areasRaw){
  /* 1. Canonical brand spellings: OLYMPIA TILE and Olympia Tile are one brand. */
  var tally = {};
  raw.forEach(function(p){
    var k = GDB.key(p.brand); if(!k) return;
    tally[k] = tally[k] || {};
    var b = String(p.brand).trim();
    tally[k][b] = (tally[k][b] || 0) + 1;
  });
  var canon = {};
  Object.keys(tally).forEach(function(k){
    var best = null, score = -1;
    Object.keys(tally[k]).forEach(function(b){
      /* prefer a spelling that is not all-caps, then the most common */
      var s = tally[k][b] + (b === b.toUpperCase() ? 0 : 1000);
      if(s > score){ score = s; best = b; }
    });
    canon[k] = GDB.titleish(best);
  });

  /* 2. The sheet is grouped visually: a run of rows sharing a Category has it
        typed only on the first row. Carry it down, per area, in sheet order --
        otherwise 88 Kitchen products land in an "Other" bucket. */
  var lastCat = {}, lastSub = {};
  raw = raw.map(function(p){
    var area = String(p.area||"Other").trim();
    var cat  = String(p.cat||"").trim();
    var sub  = String(p.sub||"").trim();
    if(cat){ lastCat[area] = cat; lastSub[area] = sub; }
    else if(lastCat[area]){ cat = lastCat[area]; if(!sub) sub = lastSub[area] || ""; }
    var q = {}; for(var k in p) q[k] = p[k];
    q.area = area; q.cat = cat; q.sub = sub;
    return q;
  });

  /* 3. Clean each row. */
  var out = raw.map(function(p){
    var cat   = p.cat || "Other";
    var sub   = p.sub || "";
    var brand = canon[GDB.key(p.brand)] || GDB.titleish(p.brand);
    /* "CABINET DOORS" in the Brand column is the category, not a brand */
    if(brand && GDB.key(brand) === GDB.key(cat)) brand = "";
    if(GDB.key(sub) === GDB.key(cat)) sub = "";
    return {
      area: p.area, cat: cat, sub: sub, brand: brand,
      name: String(p.name||"").trim(),
      price: Number(p.price) || 0,
      unit: GDB.unitise(p.unit),
      desc: String(p.desc||"").trim(),
      images: (p.images||[]).filter(function(u){ return u && !/example\.com/i.test(u); }),
      colors: GDB.parseColors(p.colors),
      sku: String(p.sku||"").trim(),
      leadTime: String(p.leadTime||"").trim(),
      supplier: String(p.supplier||"").trim()
    };
  }).filter(function(p){ return p.name; });

  /* 4. Rooms, in house order, with a photo each. */
  var counts = {};
  out.forEach(function(p){ counts[p.area] = (counts[p.area]||0) + 1; });
  var rooms = Object.keys(counts).sort(function(a,b){
    var ia = GDB.ROOM_ORDER.indexOf(a), ib = GDB.ROOM_ORDER.indexOf(b);
    if(ia < 0) ia = 99;
    if(ib < 0) ib = 99;
    return ia - ib || a.localeCompare(b);
  });

  var imgs = {};
  (areasRaw||[]).forEach(function(r){              /* 3rd: whatever the sheet says */
    if(r && r.area && r.img && !/example\.com/i.test(r.img)) imgs[r.area] = r.img;
  });
  rooms.forEach(function(a){
    if(GDB.ROOM_PHOTO[a]) { imgs[a] = GDB.ROOM_PHOTO[a]; return; }   /* 1st: our own work */
    if(imgs[a]) return;
    var hit = out.filter(function(p){ return p.area === a && p.images.length; })[0];
    if(hit) imgs[a] = hit.images[0];               /* 2nd: a product shot */
  });

  return { products: out, rooms: rooms, roomImg: imgs, counts: counts };
};

/* ------------------------------------------------------------------- load */
/* Two tiers now. The bundled snapshot is gone: the catalogue is no longer
   public, so it cannot ship with the site. A signed-in client gets a cached
   copy for instant paint on the next visit, scoped to their own session. */
GDB.load = function(onData, onNotice){
  var ses = GDB.session.get();
  if(!ses) return Promise.resolve();

  var CACHE = GDB.CFG.STORE + "_cache";
  var painted = false;

  try{
    var c = JSON.parse(sessionStorage.getItem(CACHE) || "null");
    if(c && c.products && c.products.length){
      onData(GDB.normalise(c.products, c.areas || []));
      painted = true;
    }
  }catch(e){}

  return GDB.call("catalog", {})
    .then(function(d){
      if(!d || !Array.isArray(d.products) || !d.products.length) throw new Error("The catalogue is empty.");
      try{ sessionStorage.setItem(CACHE, JSON.stringify({ products:d.products, areas:d.areas })); }catch(e){}
      onData(GDB.normalise(d.products, d.areas || []));
      painted = true;
    })
    .catch(function(err){
      console.warn("[Material Library]", err.message);
      if(/session/i.test(err.message)) return GDB.onSessionLost && GDB.onSessionLost();
      if(!painted && onNotice) onNotice("The catalogue could not be reached. Please try again shortly.");
    });
};
