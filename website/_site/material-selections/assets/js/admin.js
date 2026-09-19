/* ==========================================================================
   TEAM DASHBOARD
   The whole back office: add and remove products, hand out access, and watch
   what each client is choosing. Nobody on the team opens the spreadsheet --
   it is storage now, not an interface.
   ========================================================================== */
(function(){
"use strict";

var esc = GDB.esc, money = GDB.money;
var $  = function(s,r){ return (r||document).querySelector(s); };
var $$ = function(s,r){ return Array.prototype.slice.call((r||document).querySelectorAll(s)); };
var SESSION = "gdb_material_admin";
var PAGE = 60;

var A = {
  view: "overview",
  clients: [],          /* every client, with their tally */
  products: [],         /* the whole catalogue, live and archived */
  rooms: [],
  choices: {},         /* per room, the dropdown lists the sheet enforces */
  stats: null,         /* the client-side half of the overview */
  fetchingCatalog: null,
  catalogGaveUp: false,
  loaded: {},           /* which slices have been fetched this session */
  current: null,        /* the client being looked at */
  currentRows: [],
  shown: PAGE
};

/* the team session is its own key, so signing out of one is not the other */
var session = {
  get: function(){ try{ return JSON.parse(sessionStorage.getItem(SESSION) || "null"); }catch(e){ return null; } },
  set: function(v){ try{ sessionStorage.setItem(SESSION, JSON.stringify(v)); }catch(e){} },
  clear: function(){ try{ sessionStorage.removeItem(SESSION); }catch(e){} }
};

/* Reads can be repeated safely; a write cannot, because a create that actually
   landed would come back as a second row. So only the read-only actions retry. */
var SAFE_TO_REPEAT = {
  "admin.overview":1, "admin.clients":1, "admin.client":1,
  "admin.catalog":1, "admin.settings":1
};

var inFlight = 0;

function call(action, body, again){
  var payload = body || {};
  payload.action = action;
  var ses = session.get();
  if(ses && ses.token && !payload.token) payload.token = ses.token;
  inFlight++;
  return fetch(GDB.CFG.API, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload)
  })
  .then(function(r){ return r.text(); })
  .then(function(text){
    var d;
    /* A slow call can come back as Google's own HTML page rather than JSON.
       Parsing that raw gives "Unexpected token '<'", which tells nobody
       anything, so it is named for what it is. */
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
    /* a dropped connection looks the same from here and deserves the same
       second chance -- on a cold Apps Script the first call often loses */
    var stale = err.message === "__stale__" ||
                /Failed to fetch|NetworkError|Load failed/i.test(err.message);
    if(!stale) throw err;
    if(!again && SAFE_TO_REPEAT[action]) return call(action, body, true);
    throw new Error(SAFE_TO_REPEAT[action]
      ? "The library did not answer. Try again in a moment."
      : "That took too long to confirm. Hit Refresh to see whether it saved.");
  })
  .then(function(d){ settle(); return d; },
        function(e){ settle(); throw e; });
}

/* Apps Script runs one execution at a time per user, so anything fetched ahead
   of time queues in front of whatever the person actually clicked. The catalogue
   is therefore only fetched in a gap -- when nothing else is waiting -- which is
   usually the second or two after the overview lands. */
function settle(){
  inFlight--;
  if(inFlight > 0) return;
  if(A.loaded.products || A.fetchingCatalog || A.catalogGaveUp) return;
  if(!session.get()) return;
  loadCatalog();
}

/* Apps Script takes a few seconds. A button that does nothing visible for that
   long reads as broken, so every call that starts from one marks it. */
function busy(el, on){
  if(!el) return;
  el.classList.toggle("busy", !!on);
  if(on){ el.dataset.was = el.textContent; el.textContent = "Working\u2026"; }
  else if(el.dataset.was){ el.textContent = el.dataset.was; delete el.dataset.was; }
}
var toastTimer;
function toast(msg){
  var t = $("#toast");
  t.textContent = msg;
  t.classList.add("on");
  clearTimeout(toastTimer);
  toastTimer = setTimeout(function(){ t.classList.remove("on"); }, 2600);
}
function oops(err){
  if(/session|password/i.test(err.message)) return lost();
  toast(err.message || "Something went wrong.");
}

/* ------------------------------------------------------------------- gate */
function showGate(msg){
  $("#gate").hidden = false;
  $("#app").hidden = true;
  if(msg) $("#gateStatus").textContent = msg;
}
function enterApp(){
  $("#gate").hidden = true;
  $("#app").hidden = false;
  go("overview");
}
function lost(){ session.clear(); showGate("Session expired. Please sign in again."); }

/* ----------------------------------------------------------------- router */
var VIEWS = ["overview","clients","client","products","settings"];
function go(view){
  A.view = view;
  VIEWS.forEach(function(v){ $("#v-" + v).hidden = (v !== view); });
  $$(".nav-i").forEach(function(b){
    b.classList.toggle("on", b.dataset.view === view || (view === "client" && b.dataset.view === "clients"));
  });
  window.scrollTo(0, 0);

  if(view === "overview" && !A.loaded.overview) loadOverview();
  if(view === "clients"  && !A.loaded.clients)  loadClients();
  if(view === "products" && !A.loaded.products) loadCatalog();
  if(view === "settings" && !A.loaded.settings) loadSettings();
}

/* --------------------------------------------------------------- overview */
function loadOverview(){
  call("admin.overview", {}).then(function(d){
    A.loaded.overview = true;
    A.stats = d;
    renderTiles();

    $("#ovRecent").innerHTML = d.recent && d.recent.length
      ? d.recent.map(function(r){
          return '<button class="ov-line" data-email="' + esc(r.email) + '">' +
            '<span class="l"><span class="n">' + esc(r.who || r.email) + '</span>' +
            '<span class="s">' + esc(r.email) + '</span></span>' +
            '<span class="r">' + esc(ago(r.at)) + '</span></button>';
        }).join("")
      : '<p class="adm-empty">Nothing selected yet.</p>';
    $$("#ovRecent .ov-line").forEach(function(b){
      b.onclick = function(){ openClient(b.dataset.email); };
    });

    $("#ovTop").innerHTML = d.top && d.top.length
      ? d.top.map(function(t){
          return '<div class="ov-line" style="cursor:default">' +
            '<span class="l"><span class="n">' + esc(t.name) + '</span>' +
            (t.brand ? '<span class="s">' + esc(t.brand) + '</span>' : '') + '</span>' +
            '<span class="r">' + t.n + (t.n === 1 ? " pick" : " picks") + '</span></div>';
        }).join("")
      : '<p class="adm-empty">No favourites yet.</p>';

  }).catch(function(err){
    /* leaving "Reading the library" up forever reads as a hang rather than a
       failure, and there is nothing on this view to say otherwise */
    $("#ovSub").textContent = err.message || "Could not read the library.";
    $("#ovRecent").innerHTML = '<p class="adm-empty">\u2014</p>';
    $("#ovTop").innerHTML = '<p class="adm-empty">\u2014</p>';
    oops(err);
  });
}

/* Client numbers come from the overview call; product numbers come from the
   catalogue this session already holds. Whichever lands first draws what it
   can, and the other fills in its half when it arrives. */
function renderTiles(){
  var d = A.stats;
  if(!d) return;
  var have = A.loaded.products;
  var live = A.products.filter(function(p){ return p.active; });
  var rooms = {};
  live.forEach(function(p){ rooms[p.area] = 1; });
  var nRooms = Object.keys(rooms).length;
  var archived = A.products.length - live.length;

  var tiles = [
    { k:"Products live",  v: have ? live.length : "\u2014",
      n: have ? nRooms + " rooms" + (archived ? " \u00b7 " + archived + " hidden" : "")
              : "counting\u2026" },
    { k:"Clients",        v:d.clients,      n:d.activeClients + " with access open" },
    { k:"Choosing now",   v:d.selecting,    n:d.recentWeek + " active in the last week" },
    { k:"Selected value", v:money(d.value), n:d.selections + " selections across everyone" }
  ];
  $("#ovTiles").innerHTML = tiles.map(function(t){
    return '<div class="tile"><div class="tile-k">' + esc(t.k) + '</div>' +
           '<div class="tile-v">' + esc(String(t.v)) + '</div>' +
           '<div class="tile-n">' + esc(t.n) + '</div></div>';
  }).join("");

  $("#ovSub").textContent = (have ? live.length + " products across " + nRooms + " rooms, and "
                                  : "")
    + d.clients + " client" + (d.clients === 1 ? "" : "s") + " with a way in.";

  var gaps = [];
  if(have){
    var noPhoto = live.filter(function(p){ return !p.images.length; }).length;
    var noPrice = live.filter(function(p){ return !p.price; }).length;
    if(noPhoto) gaps.push({ q:"photo", t:noPhoto + " with no photo" });
    if(noPrice) gaps.push({ q:"price", t:noPrice + " with no price" });
  }
  $("#ovGaps").hidden = !gaps.length;
  $("#ovGapRow").innerHTML = gaps.map(function(g){
    return '<button class="pill" data-gap="' + g.q + '">' + esc(g.t) + '</button>';
  }).join("");
  $$("#ovGapRow .pill").forEach(function(b){
    b.onclick = function(){
      go("products");
      $("#prGap").value = b.dataset.gap;
      renderProducts();
    };
  });
}

function ago(iso){
  var t = new Date(iso).getTime();
  if(!t) return "";
  var m = Math.round((Date.now() - t) / 60000);
  if(m < 2) return "just now";
  if(m < 60) return m + " min ago";
  var h = Math.round(m/60);
  if(h < 24) return h + (h === 1 ? " hour ago" : " hours ago");
  var dd = Math.round(h/24);
  if(dd < 8) return dd + (dd === 1 ? " day ago" : " days ago");
  return fmtDate(iso);
}
function fmtDate(iso){
  try{
    return new Date(iso).toLocaleDateString("en-CA", { year:"numeric", month:"short", day:"numeric" });
  }catch(e){ return iso; }
}

/* ---------------------------------------------------------------- clients */
function loadClients(){
  $("#clTable").innerHTML = '<p class="adm-empty">Loading\u2026</p>';
  return call("admin.clients", {}).then(function(d){
    A.clients = d.clients || [];
    A.loaded.clients = true;
    renderClients();
  }).catch(function(err){
    $("#clTable").innerHTML = '<p class="adm-empty">' + esc(err.message) + '</p>';
    if(/session|password/i.test(err.message)) lost();
  });
}

function renderClients(){
  var host = $("#clTable");
  var here = A.clients.filter(function(c){ return !c.removed; });
  var gone = A.clients.length - here.length;
  var live = here.filter(function(c){ return c.count > 0; }).length;
  $("#clSub").textContent = here.length
    ? here.length + " client" + (here.length === 1 ? "" : "s") + " with access \u00b7 " +
      live + " " + (live === 1 ? "has" : "have") + " started selecting" +
      (gone ? " \u00b7 " + gone + " removed, record kept" : "")
    : (gone ? gone + " removed client" + (gone === 1 ? "" : "s") + ", records kept."
            : "Nobody has access yet.");

  if(!A.clients.length){
    host.innerHTML = '<p class="adm-empty">No clients yet. Add one and they can sign in straight away.</p>';
    return;
  }
  var rows = A.clients.slice().sort(function(a,b){
    /* removed clients keep their record but belong at the bottom */
    return (!!a.removed - !!b.removed) ||
           (b.count - a.count) ||
           String(a.name||a.email).localeCompare(String(b.name||b.email));
  });

  host.className = "tbl clients";
  host.innerHTML =
    '<div class="tr head"><span>Client</span><span>Email</span><span class="c-hide2">Code</span>' +
    '<span class="c-hide t-num">Picks</span><span class="c-hide t-num">Value</span><span>Access</span></div>' +
    rows.map(function(c){
      return '<button class="tr' + (c.active ? '' : ' dim') + '" data-email="' + esc(c.email) + '">' +
        '<span><span class="t-nm">' + esc(c.name || c.email) + '</span>' +
          (c.project ? '<span class="t-sm">' + esc(c.project) + '</span>' : '') + '</span>' +
        '<span><span class="t-sm">' + esc(c.email) + '</span>' +
          (c.updated ? '<span class="t-sm">' + esc(ago(c.updated)) + '</span>' : '') + '</span>' +
        '<span class="c-hide2"><span class="t-code">' + esc(c.code || "\u2014") + '</span></span>' +
        '<span class="c-hide t-num">' + c.count + '</span>' +
        '<span class="c-hide t-num big">' + (c.value ? money(c.value) : "\u2014") + '</span>' +
        '<span>' + (c.removed
            ? '<span class="tag off">Removed</span>'
            : c.active
              ? '<span class="tag' + (c.count ? ' on' : ' live') + '">' + (c.count ? "Selecting" : "Open") + '</span>'
              : '<span class="tag off">Closed</span>') + '</span>' +
      '</button>';
    }).join("");

  $$(".tr[data-email]", host).forEach(function(b){
    b.onclick = function(){ openClient(b.dataset.email); };
  });
}

/* --------------------------------------------------------- one client */
function openClient(email){
  A.current = email;
  go("client");
  $("#cdBody").innerHTML = '<p class="adm-empty">Loading\u2026</p>';
  nameHead(email);

  /* reachable straight from the overview, where the client list may not have
     been fetched yet -- without it the code and project would read as blank */
  var ready = A.loaded.clients ? Promise.resolve() : loadClients();

  ready.then(function(){
    nameHead(email);
    return call("admin.client", { email: email });
  }).then(function(d){
    A.currentRows = d.selections || [];
    renderPalette(byEmail(email) || { email: email }, A.currentRows);
  }).catch(function(err){
    $("#cdBody").innerHTML = '<p class="adm-empty">' + esc(err.message) + '</p>';
    if(/session|password/i.test(err.message)) lost();
  });
}
function nameHead(email){
  var c = byEmail(email) || { email: email };
  $("#cdName").textContent = c.name || email;
  $("#cdProject").textContent = c.removed ? "Removed \u00b7 record kept"
                                          : (c.project || "Selections");
  $("#cdSub").textContent = email;
  /* a removed client has no code to send, so the invite is meaningless */
  $("#cdEdit").textContent = c.removed ? "Add them back" : "Edit client";
  $("#cdCopy").hidden = !!c.removed;
}
function byEmail(e){
  return A.clients.filter(function(c){ return c.email === e; })[0] || null;
}

function renderPalette(client, rows){
  var host = $("#cdBody");
  $("#cdSub").textContent = client.email +
    (client.updated ? " \u00b7 last change " + ago(client.updated) : "") +
    (client.active ? "" : " \u00b7 access closed");

  if(!rows.length){
    host.innerHTML = client.removed
      ? '<p class="adm-empty">Removed from the client list, and they had chosen nothing.</p>'
      : '<p class="adm-empty">Nothing selected yet. They can sign in with ' +
        '<span class="t-code">' + esc(client.code || "") + '</span> whenever they are ready.</p>';
    return;
  }

  if(client.removed){
    host.innerHTML = '<p class="cd-note">This client has been removed and can no longer ' +
      'sign in. What they chose is kept below. Adding them back with the same email ' +
      'hands it straight back to them.</p>';
  } else {
    host.innerHTML = "";
  }

  var byRoom = {};
  rows.forEach(function(r){ (byRoom[r.area] = byRoom[r.area] || []).push(r); });
  var order = GDB.ROOM_ORDER;
  var rooms = Object.keys(byRoom).sort(function(a,b){
    var ia = order.indexOf(a), ib = order.indexOf(b);
    if(ia < 0) ia = 99; if(ib < 0) ib = 99;
    return ia - ib || a.localeCompare(b);
  });

  var h = host.innerHTML, total = 0, unpriced = 0;
  rooms.forEach(function(room){
    var sum = 0;
    byRoom[room].forEach(function(r){
      if(r.price) sum += r.price * (r.qty||1); else unpriced++;
    });
    total += sum;
    h += '<div class="adm-room"><h3>' + esc(room) + (sum ? '<span>' + money(sum) + '</span>' : '') + '</h3>';
    byRoom[room].forEach(function(r){
      h += '<div class="adm-item"><span class="in">' +
        (r.brand ? '<span class="b">' + esc(r.brand) + '</span>' : '') +
        '<span class="n">' + esc(r.name) + '</span>' +
        '<span class="c">' + esc(r.cat) + (sameish(r.sub, r.cat) ? '' : ' \u00b7 ' + esc(r.sub)) + '</span>' +
        (r.fin ? '<span class="f"><i style="background-color:' + esc(GDB.swatchColor(r.fin)) + '"></i>' + esc(r.fin) + '</span>' : '') +
        '</span>' +
        '<span class="q">' + ((r.qty||1) > 1 ? '\u00d7' + (r.qty||1) : '') + '</span>' +
        '<span class="p">' + (r.price ? money(r.price * (r.qty||1)) : '\u2014') + '</span>' +
      '</div>';
    });
    h += '</div>';
  });

  h += '<div class="adm-room"><div class="adm-total"><span class="l">Estimated total</span>' +
       '<span class="v">' + money(total) + '</span></div>' +
       '<p class="adm-note">' + rows.length + ' selection' + (rows.length === 1 ? '' : 's') +
       (unpriced ? ' \u00b7 ' + unpriced + ' priced on request and not counted' : '') +
       ' \u00b7 supplier list pricing, materials only.</p></div>';
  host.innerHTML = h;
}

/* ------------------------------------------------------------- client form */
function editClient(existing){
  var c = existing || { email:"", name:"", project:"", code:"", notes:"", active:true };
  openPanel(!existing ? "Add a client" : c.removed ? "Add them back" : "Edit client",
    '<form class="form" id="cForm">' +
      '<label class="lab">Client name<input id="fName" type="text" value="' + esc(c.name) + '" autocomplete="off"></label>' +
      '<label class="lab">Email<input id="fEmail" type="email" value="' + esc(c.email) + '" autocomplete="off" spellcheck="false" required></label>' +
      '<p class="hint">This is what they sign in with.</p>' +
      '<label class="lab">Project<input id="fProject" type="text" value="' + esc(c.project) + '" autocomplete="off" placeholder="e.g. Forest Hill renovation"></label>' +
      '<div class="code-row">' +
        '<label class="lab">Access code<input id="fCode" type="text" value="' + esc(c.code) + '" autocomplete="off" spellcheck="false" placeholder="made for you"></label>' +
        '<button class="pill" type="button" id="fNewCode">New code</button>' +
      '</div>' +
      '<p class="hint">Leave it empty and we will make one. Send it with the library link.</p>' +
      '<label class="lab">Notes<textarea id="fNotes" placeholder="Internal only. The client never sees this.">' + esc(c.notes) + '</textarea></label>' +
      '<label class="row-check"><input id="fActive" type="checkbox"' +
        /* a removed client is stored as inactive; adding them back should open
           the door, not hand them a login that is already shut */
        ((c.active === false && !c.removed) ? '' : ' checked') + '> Access is open</label>' +
      '<p class="hint">Turn this off to close the library to them without losing what they chose.</p>' +
    '</form>',
    '<div class="left"><button class="btn accent" id="cSave">' +
      (!existing ? "Add client" : c.removed ? "Add them back" : "Save") + '</button>' +
    (existing && !c.removed ? '<button class="pill" id="cInvite">Copy invite</button>' : '') + '</div>' +
    (existing
      ? (c.removed
          ? '<button class="danger" id="cPurge">Delete record</button>'
          : '<button class="danger" id="cKill">Remove client</button>')
      : '')
  );

  $("#fNewCode").onclick = function(){ $("#fCode").value = makeCode(); };

  if(existing && !c.removed) $("#cInvite").onclick = function(){ copyInvite(c); };

  $("#cSave").onclick = function(){
    var payload = {
      was: existing ? c.email : "",
      email: $("#fEmail").value.trim().toLowerCase(),
      name: $("#fName").value.trim(),
      project: $("#fProject").value.trim(),
      code: $("#fCode").value.trim(),
      notes: $("#fNotes").value.trim(),
      active: $("#fActive").checked
    };
    if(!payload.email){ toast("They need an email address."); return; }
    busy($("#cSave"), true);
    call("admin.clientSave", { client: payload })
      .then(function(d){
        closePanel();
        toast(existing ? "Client saved." : "Client added \u2014 code " + d.code);
        A.loaded.clients = false; A.loaded.overview = false;
        loadClients().then(function(){
          if(A.view !== "client") return;
          A.current = d.email;
          nameHead(d.email);
          renderPalette(byEmail(d.email) || { email: d.email }, A.currentRows);
        });
      })
      .catch(oops)
      .then(function(){ busy($("#cSave"), false); });
  };

  /* Two separate destructive things, at two different depths. Taking someone off
     the list is the everyday one and keeps what they chose; erasing the record is
     a deliberate second visit to a client who has already been removed. */
  if(existing && !c.removed) $("#cKill").onclick = function(){
    if(!window.confirm(
      "Remove " + (c.name || c.email) + " from the client list?\n\n" +
      "They can no longer sign in. What they chose is kept, and comes back " +
      "attached to them if you ever add them again.")) return;
    busy($("#cKill"), true);
    call("admin.clientKill", { email: c.email })
      .then(function(){
        closePanel();
        toast("Removed. Their selections are kept.");
        A.loaded.clients = false; A.loaded.overview = false;
        A.current = null;
        go("clients"); loadClients();
      })
      .catch(oops)
      .then(function(){ busy($("#cKill"), false); });
  };

  if(existing && c.removed) $("#cPurge").onclick = function(){
    if(!window.confirm(
      "Erase the record of what " + (c.name || c.email) + " selected?\n\n" +
      "This is the part that cannot be undone.")) return;
    busy($("#cPurge"), true);
    call("admin.clientKill", { email: c.email, purge: true })
      .then(function(){
        closePanel();
        toast("Record deleted.");
        A.loaded.clients = false; A.loaded.overview = false;
        A.current = null;
        go("clients"); loadClients();
      })
      .catch(oops)
      .then(function(){ busy($("#cPurge"), false); });
  };
}

function makeCode(){
  var pool = "abcdefghjkmnpqrstuvwxyz23456789", s = "gdb";
  for(var i=0;i<4;i++) s += pool.charAt(Math.floor(Math.random()*pool.length));
  return s;
}
function libraryURL(){
  return location.href.replace(/admin\.html.*$/, "").replace(/\/$/, "") + "/";
}
function copyInvite(c){
  var txt = "Your Grand Design Build material library\n\n" +
            libraryURL() + "\n" +
            "Email: " + c.email + "\n" +
            "Access code: " + (c.code || "") + "\n\n" +
            "Everything we carry, room by room. Choose what you like and we will see it on our side.";
  copy(txt, "Invite copied.");
}
function copy(text, msg){
  if(navigator.clipboard && navigator.clipboard.writeText){
    navigator.clipboard.writeText(text).then(function(){ toast(msg); },
                                            function(){ fallbackCopy(text, msg); });
  } else fallbackCopy(text, msg);
}
function fallbackCopy(text, msg){
  var ta = document.createElement("textarea");
  ta.value = text; ta.style.position = "fixed"; ta.style.opacity = "0";
  document.body.appendChild(ta); ta.select();
  try{ document.execCommand("copy"); toast(msg); }catch(e){ toast("Could not copy."); }
  document.body.removeChild(ta);
}

/* ---------------------------------------------------------------- products */
function loadCatalog(){
  if(A.fetchingCatalog) return A.fetchingCatalog;
  A.catalogGaveUp = false;
  $("#prTable").innerHTML = '<p class="adm-empty">Reading the catalogue\u2026</p>';
  A.fetchingCatalog = call("admin.catalog", {}).then(function(d){
    A.products = d.products || [];
    A.rooms = (d.rooms || []).slice();
    A.choices = d.choices || {};
    A.loaded.products = true;
    renderTiles();

    var sel = $("#prRoom");
    sel.innerHTML = '<option value="">All rooms</option>' +
      roomList().map(function(r){ return '<option value="' + esc(r) + '">' + esc(r) + '</option>'; }).join("");
    renderProducts();
  }).catch(function(err){
    $("#prTable").innerHTML = '<p class="adm-empty">' + esc(err.message) + '</p>';
    /* A prefetch that failed must not be started again by the next call that
       finishes, or one bad patch turns into a call per call. Opening Products
       or hitting Refresh asks for it properly. */
    A.catalogGaveUp = true;
    if(/session|password/i.test(err.message)) lost();
  }).then(function(){
    A.fetchingCatalog = null;
  });
  return A.fetchingCatalog;
}

function roomList(){
  var seen = {};
  A.rooms.forEach(function(r){ seen[r] = 1; });
  A.products.forEach(function(p){ seen[p.area] = 1; });
  /* the catalogue takes a few seconds; until it lands, fall back to the rooms
     we already know about so "Add a product" is never a dead form */
  if(!Object.keys(seen).length) GDB.ROOM_ORDER.forEach(function(r){ seen[r] = 1; });
  var order = GDB.ROOM_ORDER;
  return Object.keys(seen).sort(function(a,b){
    var ia = order.indexOf(a), ib = order.indexOf(b);
    if(ia < 0) ia = 99; if(ib < 0) ib = 99;
    return ia - ib || a.localeCompare(b);
  });
}

function filtered(){
  var q = $("#prQ").value.trim().toLowerCase();
  var room = $("#prRoom").value;
  var state = $("#prState").value;
  var gap = $("#prGap").value;
  return A.products.filter(function(p){
    if(room && p.area !== room) return false;
    if(state === "live" && !p.active) return false;
    if(state === "off"  &&  p.active) return false;
    if(gap === "photo" && p.images.length) return false;
    if(gap === "price" && p.price) return false;
    if(q){
      var hay = (p.name + " " + p.brand + " " + p.sku + " " + p.cat + " " +
                 p.sub + " " + p.supplier).toLowerCase();
      if(hay.indexOf(q) === -1) return false;
    }
    return true;
  });
}

function renderProducts(reset){
  if(reset !== false) A.shown = PAGE;
  var rows = filtered();
  var host = $("#prTable");

  $("#prSub").textContent = rows.length
    ? rows.length + " product" + (rows.length === 1 ? "" : "s") + " shown of " + A.products.length + " in the library."
    : "Nothing matches those filters.";

  if(!rows.length){
    host.innerHTML = '<p class="adm-empty">Nothing here. Try a wider filter, or add a product.</p>';
    $("#prMore").hidden = true;
    return;
  }

  var slice = rows.slice(0, A.shown);
  host.className = "tbl products";
  host.innerHTML =
    '<div class="tr head"><span></span><span>Product</span><span class="c-hide2">Category</span>' +
    '<span class="c-hide">Room</span><span class="t-num">Price</span><span class="c-hide2">State</span></div>' +
    slice.map(function(p, i){
      var src = p.images[0] || "";
      return '<button class="tr' + (p.active ? '' : ' dim') + '" data-i="' + i + '">' +
        '<span>' + (src
            ? '<img class="t-ph" src="' + esc(src) + '" alt="" loading="lazy" decoding="async"' + GDB.imgRef(src) + '>'
            : '<span class="t-ph none">no&nbsp;photo</span>') + '</span>' +
        '<span>' + (p.brand ? '<span class="t-br">' + esc(p.brand) + '</span>' : '') +
          '<span class="t-nm">' + esc(p.name) + '</span>' +
          (p.sku ? '<span class="t-sm">' + esc(p.sku) + '</span>' : '') + '</span>' +
        '<span class="c-hide2"><span class="t-sm">' + esc(p.cat || "\u2014") + '</span>' +
          (sameish(p.sub, p.cat) ? '' : '<span class="t-sm">' + esc(p.sub) + '</span>') + '</span>' +
        '<span class="c-hide"><span class="t-sm">' + esc(p.area) + '</span></span>' +
        '<span class="t-num big">' + (p.price ? money(p.price) : "\u2014") + '</span>' +
        '<span class="c-hide2">' + (p.active ? '<span class="tag live">Live</span>'
                                             : '<span class="tag off">Hidden</span>') + '</span>' +
      '</button>';
    }).join("");

  $$(".tr[data-i]", host).forEach(function(b){
    b.onclick = function(){ editProduct(slice[Number(b.dataset.i)]); };
  });

  var more = $("#prMore");
  more.hidden = rows.length <= A.shown;
  more.textContent = "Show more (" + (rows.length - A.shown) + " left)";
}

/* ------------------------------------------------------------ product form */
function editProduct(existing){
  var p = existing || { id:"", area:$("#prRoom").value || roomList()[0] || "", cat:"", sub:"", brand:"",
                        name:"", price:"", unit:"", desc:"", image:"", extra:"", colors:[],
                        sku:"", leadTime:"", supplier:"", active:true, images:[] };
  var img = p.image || (p.images && p.images[0]) || "";

  openPanel(existing ? "Edit product" : "Add a product",
    '<form class="form" id="pForm">' +
      '<label class="lab">Room' +
        '<select id="pArea">' + roomList().map(function(r){
          return '<option value="' + esc(r) + '"' + (r === p.area ? ' selected' : '') + '>' + esc(r) + '</option>';
        }).join("") + '<option value="__new">Add a new room\u2026</option></select>' +
      '</label>' +
      '<div class="pair">' +
        '<label class="lab">Category<span id="pCatSlot">' + pickerFor("pCat", p.area, "cat", p.cat) + '</span></label>' +
        '<label class="lab">Subcategory<span id="pSubSlot">' + pickerFor("pSub", p.area, "sub", p.sub) + '</span></label>' +
      '</div>' +
      '<label class="lab">Brand<input id="pBrand" type="text" value="' + esc(p.brand) + '" autocomplete="off"></label>' +
      '<label class="lab">Product name<input id="pName" type="text" value="' + esc(p.name) + '" autocomplete="off" required></label>' +
      '<div class="pair">' +
        '<label class="lab">Price<input id="pPrice" type="number" step="0.01" min="0" value="' + esc(p.price || "") + '"></label>' +
        '<label class="lab">Unit<input id="pUnit" type="text" value="' + esc(p.unit) + '" placeholder="sq ft, each\u2026" autocomplete="off"></label>' +
      '</div>' +
      '<p class="hint">Leave the price empty for anything quoted on request.</p>' +
      '<div class="pair">' +
        '<label class="lab">SKU<input id="pSku" type="text" value="' + esc(p.sku) + '" autocomplete="off"></label>' +
        '<label class="lab">Lead time<input id="pLead" type="text" value="' + esc(p.leadTime) + '" placeholder="4\u20136 weeks" autocomplete="off"></label>' +
      '</div>' +
      '<label class="lab">Supplier<input id="pSupplier" type="text" value="' + esc(p.supplier) + '" autocomplete="off"></label>' +
      '<label class="lab">Finishes<input id="pColors" type="text" value="' + esc((p.colors||[]).join(" | ")) + '" placeholder="Matte Black | Brushed Brass" autocomplete="off"></label>' +
      '<p class="hint">Separate them with a vertical bar. Each one becomes a swatch the client can pick.</p>' +
      '<label class="lab">Photo<input id="pImage" type="url" value="' + esc(img) + '" placeholder="https://\u2026"></label>' +
      '<div class="shot">' +
        '<img class="shot-img" id="pShot" src="' + esc(img) + '" alt="" referrerpolicy="no-referrer">' +
        '<div><div class="shot-acts">' +
          '<button class="pill" type="button" id="pUp">Upload a photo</button>' +
          '<button class="pill" type="button" id="pClear">Clear</button>' +
        '</div><p class="shot-note">Cut out on white looks best. A pasted link works too. An uploaded photo can take a minute before it shows.</p></div>' +
      '</div>' +
      '<input type="file" id="pFile" accept="image/*" hidden>' +
      '<label class="lab">More photos<input id="pExtra" type="text" value="' + esc(p.extra || (p.images||[]).slice(1).join(" | ")) + '" placeholder="url | url" autocomplete="off"></label>' +
      '<label class="lab">Description<textarea id="pDesc">' + esc(p.desc) + '</textarea></label>' +
      '<label class="row-check"><input id="pActive" type="checkbox"' + (p.active === false ? '' : ' checked') + '> Show this to clients</label>' +
      '<p class="hint">Untick to pause it: gone from the library, kept on file, and still readable in the selections of anyone who already chose it.</p>' +
    '</form>',
    '<div class="left"><button class="btn accent" id="pSave">' + (existing ? "Save" : "Add product") + '</button>' +
      (existing ? '<button class="pill" id="pPause">' +
        (p.active === false ? "Show to clients" : "Hide from clients") + '</button>' : '') + '</div>' +
    (existing ? '<button class="danger" id="pKill">Delete</button>' : '')
  );

  /* a new room is a new tab in the store, so it is made before anything else */
  $("#pArea").onchange = function(){
    if(this.value !== "__new") return;
    var name = (window.prompt("Name the new room") || "").trim();
    if(!name){ this.value = p.area; return; }
    call("admin.addRoom", { name: name })
      .then(function(){
        A.rooms.push(name);
        var sel = $("#pArea");
        sel.insertBefore(new Option(name, name, true, true), sel.lastChild);
        sel.value = name;
        $("#prRoom").innerHTML = '<option value="">All rooms</option>' +
          roomList().map(function(r){ return '<option value="' + esc(r) + '">' + esc(r) + '</option>'; }).join("");
        toast("Room added.");
      })
      .catch(function(err){ oops(err); $("#pArea").value = p.area; });
  };

  /* each tab enforces its own lists, so changing room reshapes these two */
  function reshape(){
    var area = $("#pArea").value;
    if(area === "__new") return;
    $("#pCatSlot").innerHTML = pickerFor("pCat", area, "cat", $("#pCat").value);
    $("#pSubSlot").innerHTML = pickerFor("pSub", area, "sub", $("#pSub").value);
  }
  $("#pArea").addEventListener("change", reshape);

  $("#pImage").oninput = function(){ $("#pShot").src = this.value; };
  $("#pClear").onclick = function(){ $("#pImage").value = ""; $("#pShot").removeAttribute("src"); };
  $("#pUp").onclick = function(){ $("#pFile").click(); };
  $("#pFile").onchange = function(){
    var f = this.files && this.files[0];
    if(!f) return;
    if(f.size > 4 * 1024 * 1024){ toast("That photo is over 4MB \u2014 shrink it first."); return; }
    var btn = $("#pUp");
    busy(btn, true);
    var fr = new FileReader();
    fr.onload = function(){
      call("admin.upload", { data: fr.result, mime: f.type, name: f.name })
        .then(function(d){
          $("#pImage").value = d.url;
          $("#pShot").src = d.url;
          toast("Photo uploaded.");
        })
        .catch(oops)
        .then(function(){ busy(btn, false); });
    };
    fr.onerror = function(){ busy(btn, false); toast("Could not read that file."); };
    fr.readAsDataURL(f);
  };

  function collect(){
    var out = {
      id: p.id || "",
      area: $("#pArea").value,
      cat: $("#pCat").value.trim(),
      sub: $("#pSub").value.trim(),
      brand: $("#pBrand").value.trim(),
      name: $("#pName").value.trim(),
      price: $("#pPrice").value.trim(),
      unit: $("#pUnit").value.trim(),
      sku: $("#pSku").value.trim(),
      leadTime: $("#pLead").value.trim(),
      supplier: $("#pSupplier").value.trim(),
      colors: $("#pColors").value.trim(),
      image: $("#pImage").value.trim(),
      extra: $("#pExtra").value.trim(),
      desc: $("#pDesc").value.trim(),
      active: $("#pActive").checked
    };
    return out;
  }

  /* Pausing is the same write as saving with the tick cleared, so it goes
     through the same path -- anything else typed into the form goes with it
     rather than being thrown away. */
  function persist(out, btn, said){
    if(!out.name){ toast("Give the product a name."); return; }
    if(out.area === "__new"){ toast("Choose a room."); return; }

    busy(btn, true);
    call("admin.saveProduct", { product: out })
      .then(function(d){
        /* patch what is already in memory rather than re-reading 400-odd rows */
        var fresh = {
          id: d.id, area: d.area, cat: out.cat, sub: out.sub, brand: out.brand, name: out.name,
          price: Number(out.price) || 0, unit: out.unit, desc: out.desc,
          image: out.image, extra: out.extra,
          images: splitList(out.image).concat(splitList(out.extra)),
          colors: splitList(out.colors), sku: out.sku, leadTime: out.leadTime,
          supplier: out.supplier, active: out.active
        };
        if(d.created) A.products.push(fresh);
        else {
          for(var i=0;i<A.products.length;i++){
            if(A.products[i].id === d.id){ A.products[i] = fresh; break; }
          }
        }
        A.loaded.overview = false;
        closePanel();
        toast(said || (d.created ? "Product added." : "Product saved."));
        renderProducts(false);
      })
      .catch(oops)
      .then(function(){ busy(btn, false); });
  }

  $("#pSave").onclick = function(){ persist(collect(), $("#pSave")); };

  if(existing) $("#pPause").onclick = function(){
    var out = collect();
    out.active = !out.active;
    persist(out, $("#pPause"),
      out.active ? "Back in the library." : "Hidden from clients.");
  };

  if(existing) $("#pKill").onclick = function(){
    if(!window.confirm(
      "Delete \"" + p.name + "\" for good?\n\n" +
      "If you only want it out of the client's way, use Hide from clients " +
      "instead -- that keeps it on file, which matters if somebody has " +
      "already chosen it.")) return;
    busy($("#pKill"), true);
    call("admin.killProduct", { id: p.id, area: p.area })
      .then(function(){
        A.products = A.products.filter(function(x){ return x.id !== p.id; });
        A.loaded.overview = false;
        closePanel();
        toast("Product deleted.");
        renderProducts(false);
      })
      .catch(oops)
      .then(function(){ busy($("#pKill"), false); });
  };
}

/* Where the sheet enforces a dropdown, offer exactly that -- anything else is
   refused on write, which used to come back as a dead request. Everywhere else
   it stays a text box with the values already in use as suggestions. */
function pickerFor(id, area, key, value){
  var list = (A.choices[area] || {})[key];
  if(list && list.length){
    var opts = list.slice();
    /* a product already carrying a value outside the list keeps it rather than
       being silently retyped by opening the form */
    if(value && opts.indexOf(value) === -1) opts.unshift(value);
    return '<select id="' + id + '"><option value=""></option>' +
      opts.map(function(c){
        return '<option value="' + esc(c) + '"' + (c === value ? ' selected' : '') + '>' + esc(c) + '</option>';
      }).join("") + '</select>';
  }
  var used = cats(area, key);
  return '<input id="' + id + '" type="text" value="' + esc(value || "") + '" autocomplete="off"' +
    (used.length ? ' list="' + id + 'List"' : '') + '>' +
    (used.length ? '<datalist id="' + id + 'List">' +
      used.map(function(c){ return '<option value="' + esc(c) + '"></option>'; }).join("") + '</datalist>' : '');
}

function cats(area, key){
  var seen = {};
  A.products.forEach(function(p){ if(p.area === area && p[key]) seen[p[key]] = 1; });
  return Object.keys(seen).sort();
}
function splitList(s){
  return String(s||"").split(/\s*[|;\n]\s*/).filter(function(x){ return x !== ""; });
}
/* Plenty of tabs repeat the category in the subcategory column. Printing both
   just reads as a stutter, so the second one only appears when it adds something. */
function sameish(a, b){
  a = String(a||"").trim().toLowerCase();
  b = String(b||"").trim().toLowerCase();
  return !a || a === b;
}

/* ---------------------------------------------------------------- settings */
function loadSettings(){
  call("admin.settings", {}).then(function(d){
    A.loaded.settings = true;
    $("#setCode").value = d.code || "";
    $("#setHours").value = d.hours || 12;
  }).catch(oops);
}

/* -------------------------------------------------------------------- csv */
function downloadCSV(){
  var rows = A.currentRows || [];
  if(!rows.length){ toast("Nothing to export yet."); return; }
  var c = byEmail(A.current) || { email: A.current };
  var head = ["Room","Category","Subcategory","Brand","Product","Finish","Qty","Unit Price","Line Total"];
  var body = rows.map(function(r){
    return [r.area, r.cat, r.sub, r.brand, r.name, r.fin, r.qty || 1,
            r.price || "", r.price ? r.price * (r.qty||1) : ""];
  });
  var csv = [head].concat(body).map(function(line){
    return line.map(function(v){
      v = v == null ? "" : String(v);
      return /[",\n]/.test(v) ? '"' + v.replace(/"/g, '""') + '"' : v;
    }).join(",");
  }).join("\r\n");

  var blob = new Blob(["\ufeff" + csv], { type:"text/csv;charset=utf-8" });
  var a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = (c.name || c.email).replace(/[^a-z0-9]+/gi, "-").toLowerCase() + "-selections.csv";
  document.body.appendChild(a); a.click(); document.body.removeChild(a);
  setTimeout(function(){ URL.revokeObjectURL(a.href); }, 1000);
  toast("CSV downloaded.");
}

/* ------------------------------------------------------------------ panel */
function openPanel(title, bodyHTML, footHTML){
  $("#panelTitle").textContent = title;
  $("#panelBody").innerHTML = bodyHTML;
  $("#panelFoot").innerHTML = footHTML || "";
  $("#panel").classList.add("on");
  $("#panel").setAttribute("aria-hidden", "false");
  $("#scrim").classList.add("on");
  document.body.style.overflow = "hidden";
}
function closePanel(){
  $("#panel").classList.remove("on");
  $("#panel").setAttribute("aria-hidden", "true");
  $("#scrim").classList.remove("on");
  document.body.style.overflow = "";
}

/* ------------------------------------------------------------------- wire */
function wire(){
  $("#gateForm").onsubmit = function(e){
    e.preventDefault();
    var code = $("#gateCode").value.trim();
    var btn = $("#gateGo"), st = $("#gateStatus");
    if(!code){ st.textContent = "Enter the team password."; return; }
    btn.disabled = true; st.textContent = "Checking\u2026";
    call("admin.login", { code: code, token: null })
      .then(function(d){
        session.set({ token: d.token });
        $("#gateCode").value = ""; st.textContent = "";
        A.loaded = {};
        enterApp();
      })
      .catch(function(err){ st.textContent = err.message || "Could not sign in."; })
      .then(function(){ btn.disabled = false; });
  };

  $$(".nav-i").forEach(function(b){ b.onclick = function(){ go(b.dataset.view); }; });
  $("#home").onclick = function(){ go("overview"); };
  $("#clBack").onclick = function(){ go("clients"); };
  $("#signOut").onclick = function(){ session.clear(); location.reload(); };

  $("#refresh").onclick = function(){
    var btn = $("#refresh");
    A.loaded = {};
    busy(btn, true);
    var done = function(){ busy(btn, false); };
    if(A.view === "client" && A.current){ loadClients().then(function(){ openClient(A.current); }).then(done, done); }
    else { go(A.view); setTimeout(done, 1200); }
  };

  $("#addClient").onclick = function(){ editClient(null); };
  $("#cdEdit").onclick = function(){
    var c = byEmail(A.current);
    if(c) editClient(c);
  };
  $("#cdCopy").onclick = function(){
    var c = byEmail(A.current);
    if(c) copyInvite(c);
  };
  $("#cdCsv").onclick = downloadCSV;

  $("#addProduct").onclick = function(){ editProduct(null); };
  $("#prMore").onclick = function(){ A.shown += PAGE; renderProducts(false); };
  var t;
  $("#prQ").oninput = function(){ clearTimeout(t); t = setTimeout(function(){ renderProducts(); }, 180); };
  ["prRoom","prState","prGap"].forEach(function(id){
    $("#" + id).onchange = function(){ renderProducts(); };
  });

  $("#setForm").onsubmit = function(e){
    e.preventDefault();
    var btn = $("#setGo"), st = $("#setStatus");
    var code = $("#setCode").value.trim();
    if(code && code.length < 6){ st.textContent = "At least six characters."; return; }
    busy(btn, true); st.textContent = "";
    call("admin.saveSettings", { code: code, hours: $("#setHours").value })
      .then(function(){ st.textContent = "Saved."; toast("Settings saved."); })
      .catch(function(err){ st.textContent = err.message; })
      .then(function(){ busy(btn, false); });
  };

  $("#panelX").onclick = closePanel;
  $("#scrim").onclick = closePanel;
  document.addEventListener("keydown", function(e){
    if(e.key === "Escape" && $("#panel").classList.contains("on")) closePanel();
  });
}

function boot(){
  wire();
  if(session.get()) enterApp(); else showGate();
}
document.readyState === "loading"
  ? document.addEventListener("DOMContentLoaded", boot)
  : boot();

})();
