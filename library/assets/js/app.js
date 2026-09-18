/* ==========================================================================
   MATERIAL LIBRARY -- application
   Sign-in gate, views (rooms / browse), filtering, the detail drawer,
   compare, and selections that save to the client's project.
   ========================================================================== */
(function(){
"use strict";

var CFG = GDB.CFG, esc = GDB.esc, money = GDB.money, pid = GDB.pid, selId = GDB.selId;
var $  = function(s,r){ return (r||document).querySelector(s); };
var $$ = function(s,r){ return Array.prototype.slice.call((r||document).querySelectorAll(s)); };

var S = {
  products:[], rooms:[], roomImg:{},
  view:"rooms", area:"", cat:"", sub:"",
  q:"", brands:{}, pmin:null, pmax:null, sort:"curated", brandsOpen:false,
  sel:[], cmp:[], detail:null, detailImg:0, detailFin:"", ready:false
};

/* ============================================================ selections */
function loadSel(){
  try{ S.sel = JSON.parse(localStorage.getItem(CFG.STORE) || "[]"); }catch(e){ S.sel = []; }
  if(!Array.isArray(S.sel)) S.sel = [];
  S.sel = S.sel.filter(function(x){ return x && x.p && x.p.name; }).map(function(x){
    if(x.base === undefined){ x.base = x.id; x.fin = ""; }
    if(!x.p.colors) x.p.colors = [];
    return x;
  });
}
var syncTimer = null, syncing = false;
function saveSel(){
  /* keep a local copy so the UI is instant, then push to the project */
  try{ localStorage.setItem(CFG.STORE, JSON.stringify(S.sel)); }catch(e){}
  clearTimeout(syncTimer);
  syncTimer = setTimeout(pushSelections, 2000);   /* Apps Script serialises
     executions per user, so save rarely rather than on every click */
}

function selectionPayload(){
  return S.sel.map(function(x){
    return { area:x.p.area, cat:x.p.cat, sub:x.p.sub, brand:x.p.brand,
             name:x.p.name, fin:x.fin || "", qty:x.qty || 1, price:x.p.price || 0 };
  });
}

/* The whole palette is sent each time, so the sheet can never drift out of
   step with what the client is looking at. */
function pushSelections(){
  if(syncing){ clearTimeout(syncTimer); syncTimer = setTimeout(pushSelections, 1200); return; }
  syncing = true;
  setSync("saving");
  GDB.call("save", { selections: selectionPayload() })
    .catch(function(err){
      if(/session/i.test(err.message)) throw err;
      /* Apps Script occasionally stalls on a cold start; one quiet retry before
         we tell the client anything is wrong. */
      return new Promise(function(res){ setTimeout(res, 1500); })
        .then(function(){ return GDB.call("save", { selections: selectionPayload() }); });
    })
    .then(function(){ setSync("saved"); })
    .catch(function(err){
      setSync("error");
      if(/session/i.test(err.message)) sessionLost();
    })
    .then(function(){ syncing = false; });
}

var lastSync = "";
function setSync(state){
  lastSync = state;
  var el = $("#syncNote");
  if(!el) return;                       /* panel closed; renderSel replays it */
  el.textContent = state === "saving" ? "Saving\u2026"
                 : state === "saved"  ? "Saved to your project"
                 : state === "error"  ? "Not saved \u2014 check your connection"
                 : "";
}

/* Fold whatever the project already holds into the catalogue we just loaded. */
function adoptServerSelections(rows){
  if(!Array.isArray(rows)) return;
  var byKey = {};
  S.products.forEach(function(p){ byKey[pid(p)] = p; });
  var out = [];
  rows.forEach(function(r){
    var p = byKey[GDB.key(r.area)+"~"+GDB.key(r.cat)+"~"+GDB.key(r.brand)+"~"+GDB.key(r.name)];
    if(!p) return;                                  /* product has left the catalogue */
    out.push({ id:selId(p, r.fin||""), base:pid(p), fin:r.fin||"", qty:Number(r.qty)||1, p:p });
  });
  S.sel = out;
  try{ localStorage.setItem(CFG.STORE, JSON.stringify(S.sel)); }catch(e){}
  paintCount();
}
function inSel(p){ var b = pid(p); return S.sel.some(function(s){ return s.base === b; }); }
function inSelFin(p,fin){ var id = selId(p,fin); return S.sel.some(function(s){ return s.id === id; }); }

function toggleSel(p, fin){
  fin = fin || "";
  var id = selId(p,fin), i = -1;
  S.sel.forEach(function(s,ix){ if(s.id === id) i = ix; });
  if(i > -1) S.sel.splice(i,1);
  else S.sel.push({ id:id, base:pid(p), fin:fin, qty:1, p:p });
  saveSel(); paintCount(); renderGrid(); renderSel();
  if(S.detail && pid(S.detail) === pid(p)) renderDetailFoot();
}
function paintCount(){
  var n = S.sel.length;
  $("#selCt").textContent = n;
  $("#selBtn").classList.toggle("is-live", n > 0);
}

/* =============================================================== compare */
function inCmp(p){ return S.cmp.some(function(c){ return pid(c) === pid(p); }); }
function toggleCmp(p){
  var i = -1; S.cmp.forEach(function(c,ix){ if(pid(c) === pid(p)) i = ix; });
  if(i > -1) S.cmp.splice(i,1);
  else { if(S.cmp.length >= CFG.COMPARE_MAX) S.cmp.shift(); S.cmp.push(p); }
  renderCmpBar(); renderGrid();
}
function renderCmpBar(){
  $("#cmpBar").classList.toggle("on", S.cmp.length > 0);
  $("#cmpThumbs").innerHTML = S.cmp.map(function(p){
    return '<i style="background-image:url(' + esc(p.images[0]||"") + ')"></i>';
  }).join("");
  $("#cmpOpen").disabled = S.cmp.length < 2;
}

/* ============================================================= filtering */
function pool(){
  return S.products.filter(function(p){
    if(S.area && p.area !== S.area) return false;
    if(S.cat  && p.cat  !== S.cat)  return false;
    if(S.sub  && p.sub  !== S.sub)  return false;
    return true;
  });
}
function filtered(){
  var terms = S.q.toLowerCase().trim();
  terms = terms ? terms.split(/\s+/) : [];
  var anyBrand = Object.keys(S.brands).some(function(k){ return S.brands[k]; });

  var list = pool().filter(function(p){
    if(anyBrand && !S.brands[p.brand]) return false;
    if(S.pmin != null && (!p.price || p.price < S.pmin)) return false;
    if(S.pmax != null && (!p.price || p.price > S.pmax)) return false;
    if(terms.length){
      var hay = (p.name+" "+p.brand+" "+p.cat+" "+p.sub+" "+p.area+" "+p.desc+" "+
                 p.colors.map(function(c){ return c.name; }).join(" ")).toLowerCase();
      for(var i=0;i<terms.length;i++) if(hay.indexOf(terms[i]) < 0) return false;
    }
    return true;
  });

  var s = S.sort;
  list.sort(function(a,b){
    if(s === "name")       return a.name.localeCompare(b.name);
    if(s === "brand")      return (a.brand||"zz").localeCompare(b.brand||"zz") || a.name.localeCompare(b.name);
    if(s === "price-asc")  return (a.price || Infinity) - (b.price || Infinity);
    if(s === "price-desc") return (b.price || 0) - (a.price || 0);
    /* curated: photographed and priced rise to the top */
    var sa = (a.images.length?2:0) + (a.price?1:0);
    var sb = (b.images.length?2:0) + (b.price?1:0);
    return sb - sa || a.name.localeCompare(b.name);
  });
  return list;
}

/* ================================================================= rooms */
function renderRooms(){
  var grid = $("#roomsGrid");
  if(!S.ready){
    grid.innerHTML = new Array(10).join("x").split("x")
      .map(function(){ return '<div class="sk"></div>'; }).join("");
    return;
  }
  grid.innerHTML = S.rooms.map(function(a){
    var n = S.products.filter(function(p){ return p.area === a; }).length;
    var img = S.roomImg[a];
    return '<button class="room" data-reveal data-snap data-snap-label="' + esc(a) + '" data-room="' + esc(a) + '">' +
      '<span class="room-ph">' +
        (img ? '<img src="' + esc(img) + '" alt="' + esc(a) + '" loading="lazy" decoding="async"' + GDB.imgRef(img) + ' onerror="this.style.display=\'none\'">' : "") +
        '<span class="room-fb">' + esc(a.charAt(0)) + '</span>' +
      '</span>' +
      '<span class="room-meta"><span class="room-n">' + esc(a) + '</span><span class="room-c">' + n + '</span></span>' +
    '</button>';
  }).join("");
  $$(".room", grid).forEach(function(b){
    b.onclick = function(){ go({ view:"browse", area:b.dataset.room, cat:"", sub:"" }); };
  });
  GDB.libraryMotion.revealChildren(grid, 55);
}

/* =============================================================== browse */
function renderCrumbs(){
  var parts = ['<button data-go="rooms">All rooms</button>'];
  if(S.area){
    parts.push('<span class="sep">/</span>');
    parts.push(S.cat ? '<button data-go="area">' + esc(S.area) + '</button>'
                     : '<span class="cur">' + esc(S.area) + '</span>');
  } else {
    parts.push('<span class="sep">/</span><span class="cur">Full library</span>');
  }
  if(S.cat){
    parts.push('<span class="sep">/</span>');
    parts.push(S.sub ? '<button data-go="cat">' + esc(S.cat) + '</button>'
                     : '<span class="cur">' + esc(S.cat) + '</span>');
  }
  if(S.sub) parts.push('<span class="sep">/</span><span class="cur">' + esc(S.sub) + '</span>');

  var el = $("#crumbs");
  el.innerHTML = parts.join("");
  $$("button", el).forEach(function(b){
    b.onclick = function(){
      var t = b.dataset.go;
      if(t === "rooms") go({ view:"rooms" });
      if(t === "area")  go({ view:"browse", area:S.area, cat:"", sub:"" });
      if(t === "cat")   go({ view:"browse", area:S.area, cat:S.cat, sub:"" });
    };
  });
}

function renderRail(){
  var scope = S.products.filter(function(p){ return !S.area || p.area === S.area; });
  var cats = {};
  scope.forEach(function(p){ cats[p.cat] = (cats[p.cat]||0) + 1; });
  var catNames = Object.keys(cats).sort(function(a,b){
    if(a === "Other") return 1;
    if(b === "Other") return -1;
    return cats[b] - cats[a] || a.localeCompare(b);
  });

  var h = '<div class="rail-grp"><span class="eyebrow">Category</span>';
  h += '<button class="rail-item' + (S.cat?"":" on") + '" data-cat=""><span class="n">Everything</span><span class="c">' + scope.length + '</span></button>';
  catNames.forEach(function(c){
    h += '<button class="rail-item' + (S.cat===c?" on":"") + '" data-cat="' + esc(c) + '"><span class="n">' + esc(c) + '</span><span class="c">' + cats[c] + '</span></button>';
    if(S.cat === c){
      var subs = {};
      scope.forEach(function(p){ if(p.cat === c && p.sub) subs[p.sub] = (subs[p.sub]||0) + 1; });
      var subNames = Object.keys(subs).sort();
      if(subNames.length){
        h += '<div class="rail-sub"><button class="rail-item' + (S.sub?"":" on") + '" data-sub=""><span class="n">All</span></button>';
        subNames.forEach(function(sx){
          h += '<button class="rail-item' + (S.sub===sx?" on":"") + '" data-sub="' + esc(sx) + '"><span class="n">' + esc(sx) + '</span><span class="c">' + subs[sx] + '</span></button>';
        });
        h += '</div>';
      }
    }
  });
  h += '</div>';

  var brands = {};
  pool().forEach(function(p){ if(p.brand) brands[p.brand] = (brands[p.brand]||0) + 1; });
  var bNames = Object.keys(brands).sort(function(a,b){ return brands[b]-brands[a] || a.localeCompare(b); });
  if(bNames.length){
    h += '<div class="rail-grp"><span class="eyebrow">Brand</span>';
    (S.brandsOpen ? bNames : bNames.slice(0,7)).forEach(function(b){
      h += '<label class="chk"><input type="checkbox" data-brand="' + esc(b) + '"' + (S.brands[b]?" checked":"") + '><span>' + esc(b) + '</span><span class="c">' + brands[b] + '</span></label>';
    });
    if(bNames.length > 7) h += '<button class="rail-more" id="railMore">' + (S.brandsOpen ? "Show fewer" : "All " + bNames.length + " brands") + '</button>';
    h += '</div>';
  }

  if(CFG.SHOW_PRICES){
    h += '<div class="rail-grp"><span class="eyebrow">Price</span><div class="price-row">' +
         '<input type="number" id="pmin" placeholder="Min" value="' + (S.pmin==null?"":S.pmin) + '">' +
         '<span>&ndash;</span>' +
         '<input type="number" id="pmax" placeholder="Max" value="' + (S.pmax==null?"":S.pmax) + '">' +
         '</div></div>';
  }
  h += '<button class="rail-reset" id="railReset">Reset filters</button>';

  var rail = $("#rail");
  rail.innerHTML = h;

  $$(".rail-item[data-cat]", rail).forEach(function(b){
    b.onclick = function(){ go({ view:"browse", area:S.area, cat:b.dataset.cat, sub:"" }); };
  });
  $$(".rail-item[data-sub]", rail).forEach(function(b){
    b.onclick = function(){ go({ view:"browse", area:S.area, cat:S.cat, sub:b.dataset.sub }); };
  });
  $$("input[data-brand]", rail).forEach(function(c){
    c.onchange = function(){ S.brands[c.dataset.brand] = c.checked; renderRail(); renderGrid(); };
  });
  if($("#railMore", rail)) $("#railMore", rail).onclick = function(){ S.brandsOpen = !S.brandsOpen; renderRail(); };
  ["pmin","pmax"].forEach(function(id){
    var el = $("#" + id, rail); if(!el) return;
    el.onchange = function(){ S[id] = el.value === "" ? null : Number(el.value); renderGrid(); };
  });
  $("#railReset", rail).onclick = function(){
    S.brands = {}; S.pmin = null; S.pmax = null; S.q = "";
    $("#search").value = ""; $("#searchWrap").classList.remove("has-val");
    renderRail(); renderGrid();
  };
}

function cardHTML(p){
  var img = p.images[0], added = inSel(p), cmp = inCmp(p);
  var price = !CFG.SHOW_PRICES ? "" :
    (p.price ? '<span class="card-pr">' + money(p.price) + (p.unit ? '<span class="u">' + esc(p.unit) + '</span>' : '') + '</span>'
             : '<span class="card-pr req">Price on request</span>');
  var sw = "";
  if(p.colors.length){
    sw = '<span class="swatches">' + p.colors.slice(0,5).map(function(c){
      return '<i class="sw" title="' + esc(c.name) + '" style="' +
        (c.img ? 'background-image:url(' + esc(c.img) + ')' : 'background-color:' + esc(c.hex)) + '"></i>';
    }).join("") + (p.colors.length > 5 ? '<span class="sw-more">+' + (p.colors.length-5) + '</span>' : '') + '</span>';
  }
  var label = (p.brand ? p.brand + " · " : "") + p.cat;

  return '<div class="card' + (added?" is-added":"") + '" data-reveal data-snap data-snap-label="' + esc(label) + '">' +
    '<div class="card-ph">' +
      (img ? '<img src="' + esc(img) + '" alt="' + esc(p.name) + '" loading="lazy" decoding="async"' + GDB.imgRef(img) +
             (GDB.isCover(p)?' class="cover"':'') + ' onerror="this.style.display=\'none\'">'
           : '<span class="card-fb">' + esc(p.cat) + '</span>') +
      (p.images.length > 1 ? '<span class="tag">' + p.images.length + ' views</span>' : "") +
      (p.colors.length > 1 ? '<span class="tag fin">' + p.colors.length + ' finishes</span>' : "") +
      '<div class="card-acts">' +
        '<button class="qa' + (added?" on":"") + '" data-act="sel" aria-label="Add to selections">' +
          (added ? '<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4"><path d="M4 12.5l5 5L20 6.5"/></svg>'
                 : '<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9"><path d="M12 5v14M5 12h14"/></svg>') +
        '</button>' +
        '<button class="qa' + (cmp?" on":"") + '" data-act="cmp" aria-label="Compare">' +
          '<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M7 4v16M17 4v16M3 8h8M13 16h8"/></svg>' +
        '</button>' +
      '</div>' +
    '</div>' +
    '<div class="card-body">' +
      '<span class="card-br">' + esc(p.brand||"") + '</span>' +
      '<span class="card-nm">' + esc(p.name) + '</span>' + sw + price +
    '</div>' +
  '</div>';
}

function renderGrid(){
  var list = filtered(), grid = $("#grid");
  $("#count").innerHTML = '<b>' + list.length + '</b> ' + (list.length === 1 ? "material" : "materials");
  if(!list.length){
    grid.innerHTML = '<div class="empty"><h3>Nothing matches yet</h3><p class="lede">Try clearing a filter, or search the full library.</p></div>';
    return;
  }
  grid.innerHTML = list.map(cardHTML).join("");
  $$(".card", grid).forEach(function(el,i){
    var p = list[i];
    el.onclick = function(e){
      var act = e.target.closest("[data-act]");
      if(act){
        e.stopPropagation();
        if(act.dataset.act === "cmp"){ toggleCmp(p); return; }
        if(p.colors.length && !inSel(p)){ openDetail(p); return; }    /* choose a finish first */
        if(p.colors.length && inSel(p)){
          S.sel = S.sel.filter(function(x){ return x.base !== pid(p); });
          saveSel(); paintCount(); renderGrid(); renderSel(); return;
        }
        toggleSel(p, ""); return;
      }
      openDetail(p);
    };
  });
  GDB.libraryMotion.revealChildren(grid, 22);
}

/* ================================================================ detail */
function finObj(p,name){
  var hit = null;
  p.colors.forEach(function(c){ if(c.name === name) hit = c; });
  return hit;
}
function openDetail(p){
  S.detail = p; S.detailImg = 0;
  S.detailFin = p.colors.length ? p.colors[0].name : "";
  S.sel.forEach(function(x){ if(x.base === pid(p) && x.fin) S.detailFin = x.fin; });
  renderDetail(); renderDetailFoot();
  $("#detail").classList.add("on");
  $("#detail").setAttribute("aria-hidden","false");
  $("#scrim").classList.add("on");
}
function renderDetail(){
  var p = S.detail; if(!p) return;
  var fc = finObj(p, S.detailFin);
  var img = (fc && fc.img) ? fc.img : p.images[S.detailImg];

  var h = '<div class="dt-gal"><div class="dt-main">' +
    (img ? '<img src="' + esc(img) + '" alt="' + esc(p.name) + '"' + GDB.imgRef(img) + (GDB.isCover(p)?' class="cover"':'') + '>'
         : '<span class="dt-fb">' + esc(p.cat) + '</span>') +
    '</div>';
  if(p.images.length > 1){
    h += '<div class="dt-thumbs">' + p.images.map(function(u,i){
      return '<button data-i="' + i + '" class="' + (i===S.detailImg?"on":"") + '"><img src="' + esc(u) + '" alt=""' + GDB.imgRef(u) + '></button>';
    }).join("") + '</div>';
  }
  h += '</div><div class="dt-info">';
  if(p.brand) h += '<span class="dt-br">' + esc(p.brand) + '</span>';
  h += '<h3>' + esc(p.name) + '</h3>';
  h += '<div class="dt-path">' + esc(p.area) + (p.cat?' &middot; '+esc(p.cat):"") + (p.sub?' &middot; '+esc(p.sub):"") + '</div>';
  if(CFG.SHOW_PRICES){
    h += p.price
      ? '<div class="dt-price"><span class="v">' + money(p.price) + '</span>' + (p.unit?'<span class="u">'+esc(p.unit)+'</span>':'') + '</div>'
      : '<div class="dt-price req"><span class="v">Price on request</span></div>';
  }
  if(p.colors.length){
    h += '<div class="dt-colors"><div class="lbl"><span>Finish</span><b>' + esc(S.detailFin) + '</b></div><div class="dt-swatches">' +
      p.colors.map(function(c){
        return '<button class="dt-sw' + (c.name===S.detailFin?" on":"") + '" data-fin="' + esc(c.name) + '" title="' + esc(c.name) + '" aria-label="' + esc(c.name) + '" style="' +
          (c.img ? 'background-image:url(' + esc(c.img) + ')' : 'background-color:' + esc(c.hex)) + '"></button>';
      }).join("") + '</div></div>';
  }
  if(p.desc) h += '<p class="dt-desc">' + esc(p.desc) + '</p>';

  var specs = [["Room",p.area],["Category",p.cat],["Type",p.sub],["Brand",p.brand],
               ["SKU",p.sku],["Lead time",p.leadTime],["Supplier",p.supplier]]
    .filter(function(r){ return r[1]; });
  if(specs.length){
    h += '<div class="dt-specs">' + specs.map(function(r){
      return '<div><span class="k">' + esc(r[0]) + '</span><span class="v">' + esc(r[1]) + '</span></div>';
    }).join("") + '</div>';
  }
  h += '<p class="sel-note" style="margin-top:22px;">Supplier list price at time of publication. Your fixed-price proposal confirms the final installed cost.</p></div>';

  $("#detailBody").innerHTML = h;
  $("#detailTitle").textContent = p.cat || "Material";

  $$("#detailBody .dt-thumbs button").forEach(function(b){
    b.onclick = function(){ S.detailImg = Number(b.dataset.i); renderDetail(); };
  });
  $$("#detailBody .dt-sw").forEach(function(b){
    b.onclick = function(){ S.detailFin = b.dataset.fin; renderDetail(); renderDetailFoot(); };
  });
  GDB.libraryMotion.bindLoupe($("#detailBody .dt-main"));
}
function renderDetailFoot(){
  var p = S.detail; if(!p) return;
  var added = inSelFin(p, S.detailFin);
  var label = added ? "Remove from selections"
                    : (p.colors.length ? "Add " + S.detailFin + " to selections" : "Add to my selections");
  $("#detailFoot").innerHTML =
    '<button class="btn' + (added?" ghost":"") + '" id="dtAdd" data-magnetic>' + esc(label) + '</button>' +
    '<button class="btn ghost" id="dtCmp" style="flex:0 0 auto;">' + (inCmp(p)?"In compare":"Compare") + '</button>';
  $("#dtAdd").onclick = function(){ toggleSel(p, S.detailFin); };
  $("#dtCmp").onclick = function(){ toggleCmp(p); renderDetailFoot(); };
}

/* ============================================================ selections */
function renderSel(){
  var body = $("#selBody"), foot = $("#selFoot");
  if(!S.sel.length){
    body.innerHTML = '<div class="sel-empty"><div class="m">Your palette is empty</div>' +
      '<p class="lede" style="font-size:13.5px;">Add materials as you browse and they gather here, grouped by room. Nothing is shared until you send it.</p></div>';
    foot.hidden = true;
    return;
  }

  var h = '<div class="sel-palette">' + S.sel.slice(0,18).map(function(s){
    var c = s.fin ? finObj(s.p, s.fin) : null;
    if(c && c.img)  return '<i style="background-image:url(' + esc(c.img) + ')"></i>';
    if(c && !c.img) return '<i style="background-color:' + esc(c.hex) + '"></i>';
    return '<i style="background-image:url(' + esc(s.p.images[0]||"") + ')"></i>';
  }).join("") + '</div>';

  var byRoom = {};
  S.sel.forEach(function(s){ (byRoom[s.p.area] = byRoom[s.p.area] || []).push(s); });
  var rooms = Object.keys(byRoom).sort(function(a,b){
    var ia = GDB.ROOM_ORDER.indexOf(a), ib = GDB.ROOM_ORDER.indexOf(b);
    if(ia<0) ia = 99; if(ib<0) ib = 99;
    return ia - ib || a.localeCompare(b);
  });

  var total = 0, unpriced = 0;
  rooms.forEach(function(r){
    var sum = 0;
    byRoom[r].forEach(function(s){ if(s.p.price) sum += s.p.price * (s.qty||1); else unpriced++; });
    total += sum;
    h += '<div class="sel-room"><h4>' + esc(r) + (CFG.SHOW_PRICES && sum ? '<span>' + money(sum) + '</span>' : '') + '</h4>';
    byRoom[r].forEach(function(s){
      var p = s.p, c = s.fin ? finObj(p, s.fin) : null;
      h += '<div class="sel-item" data-id="' + esc(s.id) + '">' +
        '<span class="sel-th" style="background-image:url(' + esc(p.images[0]||"") + ')"></span>' +
        '<span class="sel-in">' +
          (p.brand ? '<span class="sel-b">' + esc(p.brand) + '</span>' : "") +
          '<span class="sel-n">' + esc(p.name) + '</span>' +
          (s.fin ? '<span class="sel-fin"><i style="' +
              (c && c.img ? 'background-image:url(' + esc(c.img) + ')'
                          : 'background-color:' + esc(c ? c.hex : GDB.swatchColor(s.fin))) +
              '"></i>' + esc(s.fin) + '</span>' : '') +
          '<span class="sel-c">' + esc(p.cat) + (p.sub ? ' &middot; ' + esc(p.sub) : "") + '</span>' +
        '</span>' +
        '<span class="sel-r">' +
          (CFG.SHOW_PRICES ? (p.price ? '<span class="sel-p">' + money(p.price*(s.qty||1)) + '</span>'
                                      : '<span class="sel-p req">On request</span>') : '') +
          '<span class="qty"><button data-q="-" aria-label="Fewer">&minus;</button><span>' + (s.qty||1) + '</span><button data-q="+" aria-label="More">+</button></span>' +
          '<button class="sel-rm">Remove</button>' +
        '</span>' +
      '</div>';
    });
    h += '</div>';
  });

  if(CFG.SHOW_PRICES){
    h += '<div class="sel-room"><div class="sel-total"><span class="l">Estimated total</span><span class="v">' + money(total) + '</span></div>' +
         '<p class="sel-note">' + (unpriced ? unpriced + ' item' + (unpriced>1?'s':'') + ' priced on request and not included. ' : '') +
         'Supplier list pricing, materials only &mdash; labour, delivery and installation are set in your fixed-price proposal.</p></div>';
  }
  body.innerHTML = h;

  $$(".sel-item", body).forEach(function(row){
    var id = row.dataset.id;
    var s = S.sel.filter(function(x){ return x.id === id; })[0];
    $$("[data-q]", row).forEach(function(b){
      b.onclick = function(){
        s.qty = Math.max(1, (s.qty||1) + (b.dataset.q === "+" ? 1 : -1));
        saveSel(); renderSel();
      };
    });
    $(".sel-rm", row).onclick = function(){
      S.sel = S.sel.filter(function(x){ return x.id !== id; });
      saveSel(); paintCount(); renderSel(); renderGrid();
      if(S.detail) renderDetailFoot();
    };
  });

  foot.hidden = false;
  foot.innerHTML =
    '<p class="sel-saved" id="syncNote"></p>' +
    '<button class="btn wide" id="selSend" data-magnetic>Send to our design team</button>' +
    '<div class="status" id="selStatus" role="status"></div>' +
    '<button class="textlink" id="selClear" style="margin-top:8px;">Clear all selections</button>';
  setSync(lastSync);                    /* the panel may have opened after a save */
  $("#selSend").onclick  = sendToTeam;
  $("#selClear").onclick = function(){
    if(!confirm("Clear every material from your palette?")) return;
    S.sel = []; saveSel(); paintCount(); renderSel(); renderGrid();
  };
}

function sendToTeam(){
  var st = $("#selStatus");
  if(!S.sel.length){ st.textContent = "Add a few materials first."; return; }
  st.textContent = "Sending\u2026";
  clearTimeout(syncTimer);
  GDB.call("save", { selections: selectionPayload() })
    .then(function(){
      st.textContent = "Sent. Your designer can see these now.";
      setSync("saved");
    })
    .catch(function(err){
      st.textContent = /session/i.test(err.message)
        ? "Your session expired \u2014 please sign in again."
        : "Could not send just now. Your selections are still saved here.";
    });
}

/* =============================================================== compare */
/* A comparison is only useful if it shows what is DIFFERENT. Every attribute
   gets a row across all columns -- "--" where the sheet has nothing, so a gap
   is visible rather than silently dropped -- and rows whose values disagree are
   marked, so the eye goes straight to what actually separates the options. */
function cmpRows(items){
  var rows = [
    { k:"Room",      get:function(p){ return p.area; } },
    { k:"Category",  get:function(p){ return p.cat; } },
    { k:"Type",      get:function(p){ return p.sub; } },
    { k:"Brand",     get:function(p){ return p.brand; } }
  ];
  if(CFG.SHOW_PRICES){
    rows.push({ k:"Price", cmp:"price", html:function(p){
      if(!p.price) return '<em class="cmp-none">Price on request</em>';
      var priced = items.filter(function(q){ return q.price; });
      var min = Math.min.apply(null, priced.map(function(q){ return q.price; }));
      var delta = p.price - min;
      var unitNote = p.unit ? '<span class="cmp-u">' + esc(p.unit) + '</span>' : '';
      var tag = "";
      if(priced.length > 1){
        tag = delta === 0
          ? '<span class="cmp-tag low">Lowest</span>'
          : '<span class="cmp-tag">+' + money(delta) + '</span>';
      }
      return '<b class="cmp-price">' + money(p.price) + '</b>' + unitNote + tag;
    }, get:function(p){ return p.price ? money(p.price) + " " + p.unit : ""; } });
    rows.push({ k:"Sold by", get:function(p){ return p.unit; } });
  }
  rows.push({ k:"Finishes", cmp:"colors", html:function(p){
    if(!p.colors.length) return '<em class="cmp-none">One finish</em>';
    return '<span class="cmp-sw">' + p.colors.slice(0,8).map(function(c){
        return '<i title="' + esc(c.name) + '" style="' +
          (c.img ? 'background-image:url(' + esc(c.img) + ')' : 'background-color:' + esc(c.hex)) + '"></i>';
      }).join("") + '</span><span class="cmp-fin">' +
      p.colors.map(function(c){ return esc(c.name); }).join(", ") + '</span>';
  }, get:function(p){ return p.colors.map(function(c){ return c.name; }).join(", "); } });
  rows.push({ k:"Lead time", get:function(p){ return p.leadTime; } });
  rows.push({ k:"SKU",       get:function(p){ return p.sku; } });
  rows.push({ k:"Supplier",  get:function(p){ return p.supplier; } });
  rows.push({ k:"Photos",    get:function(p){ return p.images.length ? String(p.images.length) : ""; } });
  rows.push({ k:"Notes", wide:true, get:function(p){ return p.desc; } });
  return rows;
}

function openCmp(){
  var items = S.cmp, cols = items.length;
  var rows = cmpRows(items);
  var host = $("#cmpCols");

  var h = '<div class="cmp-tbl" style="grid-template-columns:132px repeat(' + cols + ',minmax(190px,1fr))">';

  /* header band: image, brand, name, and the two per-item actions */
  h += '<div class="cmp-corner"><span class="cmp-count">' + cols + ' materials</span>' +
       '<button class="textlink" id="cmpReset">Clear all</button></div>';
  items.forEach(function(p,i){
    h += '<div class="cmp-head" style="animation-delay:' + (i*60) + 'ms">' +
      '<div class="ph">' + (p.images[0]
        ? '<img src="' + esc(p.images[0]) + '" alt=""' + GDB.imgRef(p.images[0]) + (GDB.isCover(p)?' class="cover"':'') + '>'
        : '<span class="cmp-noimg">No photo</span>') + '</div>' +
      (p.brand ? '<div class="br">' + esc(p.brand) + '</div>' : '<div class="br">&nbsp;</div>') +
      '<h4>' + esc(p.name) + '</h4>' +
      '<div class="cmp-acts">' +
        '<button class="btn' + (inSel(p)?" ghost":"") + '" data-add="' + i + '">' + (inSel(p)?"Selected":"Add") + '</button>' +
        '<button class="cmp-drop" data-drop="' + i + '" aria-label="Remove from comparison">Remove</button>' +
      '</div>' +
    '</div>';
  });

  /* one row per attribute, marked when the values disagree */
  var missing = [];
  rows.forEach(function(row){
    var vals = items.map(row.get);
    var filled = vals.filter(function(v){ return v; });
    if(!filled.length){ missing.push(row.k); return; }   /* nothing recorded yet */
    var differs = vals.some(function(v){ return v !== vals[0]; });
    var cls = "cmp-r" + (differs ? " is-diff" : "") + (row.wide ? " is-wide" : "");
    h += '<div class="' + cls + ' cmp-k">' + esc(row.k) +
         (differs ? '<i class="cmp-dot" title="These differ"></i>' : '') + '</div>';
    items.forEach(function(p){
      var v = row.html ? row.html(p) : (row.get(p) ? esc(row.get(p)) : '<em class="cmp-none">&mdash;</em>');
      h += '<div class="' + cls + ' cmp-v">' + v + '</div>';
    });
  });

  h += '</div>';

  /* Name what the sheet has not recorded, rather than quietly leaving it out --
     otherwise a thin comparison looks like the tool's fault. */
  if(missing.length){
    h += '<p class="cmp-gap"><b>Not recorded for these materials:</b> ' +
         esc(missing.join(", ")) + '. Add them in the catalogue sheet and they ' +
         'will appear here automatically.</p>';
  }
  host.innerHTML = h;

  $$("[data-add]", host).forEach(function(b){
    b.onclick = function(){ toggleSel(items[Number(b.dataset.add)], ""); openCmp(); };
  });
  $$("[data-drop]", host).forEach(function(b){
    b.onclick = function(){
      S.cmp.splice(Number(b.dataset.drop), 1);
      renderCmpBar(); renderGrid();
      if(S.cmp.length < 2){ closeAll(); return; }
      openCmp();
    };
  });
  $("#cmpReset", host).onclick = function(){ S.cmp = []; renderCmpBar(); renderGrid(); closeAll(); };

  $("#cmpSheet").classList.add("on");
  $("#cmpSheet").setAttribute("aria-hidden","false");
  $("#scrim").classList.add("on");
}

/* ============================================================ navigation */
function go(next){
  Object.keys(next).forEach(function(k){ S[k] = next[k]; });
  if(next.view === "rooms"){ S.area = ""; S.cat = ""; S.sub = ""; }

  var rooms = $("#viewRooms"), browse = $("#viewBrowse");
  var on = S.view === "rooms" ? rooms : browse;
  var off = S.view === "rooms" ? browse : rooms;

  off.classList.remove("is-on"); off.hidden = true;
  on.hidden = false; on.classList.add("is-on");
  on.classList.remove("view-enter"); void on.offsetWidth; on.classList.add("view-enter");

  if(S.view === "browse"){ renderCrumbs(); renderRail(); renderGrid(); }
  else renderRooms();

  $("#rail").classList.remove("on");
  writeHash();
  window.scrollTo({ top:0, behavior: GDB.libraryMotion.reduced ? "auto" : "smooth" });
}

function closeAll(){
  ["#detail","#selPanel","#cmpSheet"].forEach(function(s){
    $(s).classList.remove("on"); $(s).setAttribute("aria-hidden","true");
  });
  $("#rail").classList.remove("on");
  $("#scrim").classList.remove("on");
}

/* Shareable URLs: #/Kitchen/Countertop */
function writeHash(){
  var parts = [];
  if(S.area) parts.push(encodeURIComponent(S.area));
  if(S.cat)  parts.push(encodeURIComponent(S.cat));
  if(S.sub)  parts.push(encodeURIComponent(S.sub));
  var h = parts.length ? "#/" + parts.join("/") : (S.view === "browse" ? "#/all" : "");
  if(location.hash !== h) history.replaceState(null, "", h || location.pathname);
}
function readHash(){
  var h = location.hash.replace(/^#\/?/, "");
  if(!h) return null;
  if(h === "all") return { view:"browse", area:"", cat:"", sub:"" };
  var p = h.split("/").map(decodeURIComponent);
  return { view:"browse", area:p[0]||"", cat:p[1]||"", sub:p[2]||"" };
}

/* ================================================================== wire */
function wire(){
  $("#home").onclick      = function(){ go({ view:"rooms" }); };
  $("#browseAll").onclick = function(){ go({ view:"browse", area:"", cat:"", sub:"" }); };

  $("#selBtn").onclick = function(){
    $("#detail").classList.remove("on"); $("#detail").setAttribute("aria-hidden","true");
    $("#cmpSheet").classList.remove("on");
    renderSel();
    $("#selPanel").classList.add("on"); $("#selPanel").setAttribute("aria-hidden","false");
    $("#scrim").classList.add("on");
  };
  $("#filterBtn").onclick = function(){ $("#rail").classList.add("on"); $("#scrim").classList.add("on"); };
  $("#scrim").onclick = closeAll;
  $$("[data-close]").forEach(function(b){ b.onclick = closeAll; });

  var t;
  $("#search").oninput = function(e){
    var v = e.target.value;
    $("#searchWrap").classList.toggle("has-val", !!v);
    clearTimeout(t);
    t = setTimeout(function(){
      S.q = v;
      if(v && S.view !== "browse") go({ view:"browse", area:"", cat:"", sub:"" });
      else if(S.view === "browse"){ renderRail(); renderGrid(); }
    }, 160);
  };
  $("#searchClear").onclick = function(){
    $("#search").value = ""; S.q = "";
    $("#searchWrap").classList.remove("has-val");
    if(S.view === "browse"){ renderRail(); renderGrid(); }
  };
  $("#sort").onchange = function(e){ S.sort = e.target.value; renderGrid(); };

  $("#cmpOpen").onclick  = openCmp;
  $("#cmpClear").onclick = function(){ S.cmp = []; renderCmpBar(); renderGrid(); };

  /* Nothing here should be reachable before sign-in, but belt and braces. */
  document.addEventListener("keydown", function(e){
    if(e.key === "Escape") closeAll();
    if(e.key === "/" && !/^(INPUT|TEXTAREA|SELECT)$/.test(document.activeElement.tagName)){
      e.preventDefault(); $("#search").focus();
    }
  });
  window.addEventListener("hashchange", function(){
    var r = readHash();
    if(r) go(r); else go({ view:"rooms" });
  });
}

/* ================================================================== gate */
function showGate(msg){
  $("#gate").hidden = false;
  $("#app").hidden = true;
  document.body.classList.add("locked");
  if(msg) $("#gateStatus").textContent = msg;
  var e = $("#gateEmail");
  if(e && !e.value){ try{ e.focus(); }catch(_){ } }
}

function enterApp(ses){
  $("#gate").hidden = true;
  $("#app").hidden = false;
  document.body.classList.remove("locked");
  var who = $("#whoami");
  who.hidden = false;
  who.textContent = ses.name || ses.email;
  $("#signOut").hidden = false;
  GDB.libraryMotion.init();
  start();
}

/* Any call can come back with an expired session; there is one place to land. */
function sessionLost(){
  GDB.session.clear();
  S.sel = []; S.products = []; S.ready = false;
  paintCount();
  showGate("Your session expired. Please sign in again.");
}
GDB.onSessionLost = sessionLost;

function wireGate(){
  $("#gateForm").onsubmit = function(e){
    e.preventDefault();
    var email = $("#gateEmail").value.trim();
    var code  = $("#gateCode").value.trim();
    var btn   = $("#gateGo"), st = $("#gateStatus");
    if(!email || !code){ st.textContent = "Enter your email and access code."; return; }

    btn.disabled = true;
    st.textContent = "Checking\u2026";
    GDB.call("login", { email:email, code:code, token:null })
      .then(function(d){
        GDB.session.set({ token:d.token, email:d.email, name:d.name, project:d.project });
        $("#gateCode").value = "";
        st.textContent = "";
        enterApp(d);
      })
      .catch(function(err){ st.textContent = err.message || "Could not sign you in."; })
      .then(function(){ btn.disabled = false; });
  };

  $("#signOut").onclick = function(){
    if(!confirm("Sign out? Your selections stay saved to your project.")) return;
    GDB.session.clear();
    location.reload();
  };
}

/* ================================================================== boot */
/* Everything that needs a catalogue lives here, behind the gate. */
function start(){
  loadSel(); paintCount(); renderCmpBar(); renderSel();
  renderRooms();

  GDB.load(function(data){
    S.products = data.products; S.rooms = data.rooms; S.roomImg = data.roomImg;
    S.ready = true;

    /* the project is the source of truth for what this client has chosen */
    GDB.call("load", {})
      .then(function(d){ adoptServerSelections(d.selections); renderSel(); renderGrid(); })
      .catch(function(){ /* keep the local copy if the project cannot be read */ });

    var startAt = readHash();
    if(startAt && !S._started){ S._started = true; go(startAt); return; }
    if(S.view === "browse"){ renderCrumbs(); renderRail(); renderGrid(); }
    else renderRooms();
  }, function(msg){
    var note = $("#notice");
    note.textContent = msg; note.classList.add("on");
  });
}

function boot(){
  wire();
  wireGate();
  var ses = GDB.session.get();
  if(ses && ses.token) enterApp(ses);
  else showGate();
}

document.readyState === "loading"
  ? document.addEventListener("DOMContentLoaded", boot)
  : boot();

})();
