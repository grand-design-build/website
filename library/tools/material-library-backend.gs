/**
 * GRAND DESIGN BUILD -- MATERIAL LIBRARY BACKEND   (version 4)
 * One Google Sheet stores the catalogue, the client list and the selections.
 *
 * THE SHEET IS STORAGE, NOT AN INTERFACE.
 *   Everything the team needs -- adding and removing products, giving clients
 *   access, watching what they pick -- happens on admin.html. Nobody has to
 *   open the spreadsheet again. It stays underneath because the 436 products
 *   already live there, it costs nothing, and if this app ever breaks the data
 *   is still sitting somewhere a human can read.
 *
 * INSTALL -- DEPLOY THIS AS A *NEW* DEPLOYMENT
 *   The published /material-selections/ page still uses the old URL. Leave that
 *   deployment alone; make a new one so nothing breaks.
 *
 *   1. script.google.com > New project. Name it "Material Library API".
 *   2. Replace the starter code with this file. Save.
 *   3. Deploy > New deployment > Web app.
 *        Execute as:     Me
 *        Who has access: Anyone
 *      Deploy, approve the permissions, COPY THE WEB APP URL.
 *   4. Put that URL in assets/js/data.js (CFG.API).
 *   5. Run setup() once from the editor. It creates the Clients, Selections and
 *      Settings tabs, stamps every product with an id, and prints the team
 *      password.
 *
 *   After ANY edit here: Deploy > Manage deployments > pencil > New version.
 *   Saving alone does nothing.
 *
 * PERMISSIONS
 *   Version 4 also touches Drive, so it can hold uploaded product photos. The
 *   first deployment after this change will ask to re-approve. That is expected.
 *
 * THE TABS
 *   One tab per room  the catalogue. The tab name IS the room name.
 *   Clients           Email | Access Code | Client Name | Project | Active | Notes
 *   Selections        written by the app; treat as read-only.
 *   Settings          ADMIN_CODE (the team password), SESSION_HOURS,
 *                     TOKEN_SECRET (leave alone), DRIVE_FOLDER.
 */

/* RUN THIS ONE, ONCE, after pasting a new version into the editor.
   It is deliberately the first function in the file so the editor's Run button
   picks it by default. It builds any missing tabs, stamps every product with
   an id, and touches Drive so the photo uploader's permission is granted while
   you are still sitting in front of the consent screen. */
function install(){
  var msg = setup();
  imageFolder();
  Logger.log(msg);
  return msg;
}

/* This is a STANDALONE script, deliberately separate from the bound script that
   still serves the published WordPress page. It opens the catalogue by id, so
   the two can never collide and the old deployment is untouched. */
var SHEET_ID = "18QBbzF1tPt6__QhMNq7TtWWeK3XOkT7E16kaWZ5wycI";
function book(){ return SpreadsheetApp.openById(SHEET_ID); }

var TAB_CLIENTS  = "Clients";
var TAB_SELECT   = "Selections";
var TAB_SETTINGS = "Settings";
var TAB_AREAS    = "Areas";

var CLIENT_HEAD = ["Email","Access Code","Client Name","Project","Active","Notes"];
var SELECT_HEAD = ["Updated","Email","Client Name","Room","Category","Subcategory",
                   "Brand","Product","Finish","Qty","Unit Price","Line Total"];

/* One description of a product field, used for reading AND writing. The names
   list is every spelling seen in the existing tabs; head is what gets written
   if a tab is missing that column and the team fills it in from the dashboard. */
var FIELDS = [
  { key:"cat",      head:"Category",          names:["category","cat"] },
  { key:"sub",      head:"Subcategory",       names:["subcategory","subcat","sub","type"] },
  { key:"brand",    head:"Brand",             names:["brand","manufacturer"] },
  { key:"name",     head:"Product Name",      names:["product","productname","name","item","title"] },
  { key:"price",    head:"Price",             names:["price","cost","listprice"],  num:true },
  { key:"unit",     head:"Unit",              names:["unit","uom","per"] },
  { key:"desc",     head:"Description",       names:["description","desc","details"] },
  { key:"image",    head:"Main Image URL",    names:["mainimageurl","image","images","photo"] },
  { key:"extra",    head:"Additional Images", names:["additionalimages","moreimages"] },
  { key:"colors",   head:"Colours",           names:["colours","colors","colour","color","finish","finishes"] },
  { key:"sku",      head:"SKU",               names:["sku","code","model"] },
  { key:"leadTime", head:"Lead Time",         names:["leadtime","lead"] },
  { key:"supplier", head:"Supplier",          names:["supplier","vendor"] },
  { key:"active",   head:"Active",            names:["active"] },
  { key:"id",       head:"GDB ID",            names:["gdbid"] }
];
var PRODUCT_HEAD = FIELDS.map(function(f){ return f.head; });

/* ===================================================================== setup */
function setup(){
  var ss = book();
  ensureTab(ss, TAB_CLIENTS, CLIENT_HEAD);
  ensureTab(ss, TAB_SELECT,  SELECT_HEAD);

  var st = ss.getSheetByName(TAB_SETTINGS);
  if(!st){
    st = ss.insertSheet(TAB_SETTINGS);
    st.getRange(1,1,1,2).setValues([["Key","Value"]]).setFontWeight("bold");
    st.getRange(2,1,3,2).setValues([
      ["ADMIN_CODE", "gdb-admin-" + Math.floor(Math.random()*9000+1000)],
      ["SESSION_HOURS", 12],
      ["TOKEN_SECRET", Utilities.getUuid() + Utilities.getUuid()]
    ]);
    st.setColumnWidth(1,160); st.setColumnWidth(2,380);
  }
  if(!setting("TOKEN_SECRET")) putSetting("TOKEN_SECRET", Utilities.getUuid()+Utilities.getUuid());

  var stamped = 0;
  productTabs().forEach(function(sh){ stamped += ensureIds(sh); });

  var msg = "Material Library backend ready.\n" +
            "Team password: " + setting("ADMIN_CODE") + "\n" +
            "Stamped " + stamped + " products with an id.\n" +
            "Everything else is done from admin.html.";
  Logger.log(msg);
  return msg;
}

function ensureTab(ss, name, head){
  var sh = ss.getSheetByName(name);
  if(!sh){
    sh = ss.insertSheet(name);
    sh.getRange(1,1,1,head.length).setValues([head]).setFontWeight("bold");
    sh.setFrozenRows(1);
  }
  return sh;
}

/* ================================================================== routing */
function doGet(e){
  /* Nothing real happens on GET. This deliberately reports ok:false -- under
     load Apps Script can follow a POST's redirect as a GET, and the caller
     must be able to tell that reply apart from a real one. */
  return json({ ok:false, service:"gdb-material-library", version:4,
                error:"Use POST. This endpoint takes JSON actions." });
}

function doPost(e){
  var req = {};
  try{ req = JSON.parse(e.postData.contents || "{}"); }catch(err){ return json({error:"Bad request."}); }

  function reply(obj){ obj.forAction = req.action; return json(obj); }

  try{
    switch(req.action){
      /* client side */
      case "login":            return reply(login(req));
      case "catalog":          return reply(catalog(req));
      case "load":             return reply(loadSelections(req));
      case "save":             return reply(saveSelections(req));

      /* team side */
      case "admin.login":      return reply(adminLogin(req));
      case "admin.overview":   return reply(adminOverview(req));
      case "admin.clients":    return reply(adminClients(req));
      case "admin.client":     return reply(adminClient(req));
      case "admin.clientSave": return reply(adminClientSave(req));
      case "admin.clientKill": return reply(adminClientKill(req));
      case "admin.catalog":    return reply(adminCatalog(req));
      case "admin.saveProduct":return reply(adminSaveProduct(req));
      case "admin.killProduct":return reply(adminKillProduct(req));
      case "admin.addRoom":    return reply(adminAddRoom(req));
      case "admin.import":     return reply(adminImport(req));
      case "admin.upload":     return reply(adminUpload(req));
      case "admin.settings":   return reply(adminSettings(req));
      case "admin.saveSettings":return reply(adminSaveSettings(req));

      default:                 return reply({error:"Unknown action."});
    }
  }catch(err){
    return reply({ error: String(err && err.message || err) });
  }
}

/* ============================================================ client access */
function login(req){
  var email = String(req.email||"").trim().toLowerCase();
  var code  = String(req.code||"").trim();
  if(!email || !code) return { error:"Enter your email and access code." };

  var row = findClient(email);
  if(!row)                       return { error:"We don't recognise that email." };
  if(String(row.code) !== code)  return { error:"That access code doesn't match." };
  if(row.active === false)       return { error:"This link has been closed. Please contact us." };

  return {
    token: mintToken(email),
    name: row.name || "",
    project: row.project || "",
    email: email
  };
}

function findClient(email){
  var sh = book().getSheetByName(TAB_CLIENTS);
  if(!sh) return null;
  var rows = sh.getDataRange().getValues();
  if(rows.length < 2) return null;
  var col = headerMap(rows[0]);
  for(var r=1; r<rows.length; r++){
    var e = str(pick(rows[r], col, ["email"])).toLowerCase();
    if(e !== email) continue;
    return clientFromRow(rows[r], col);
  }
  return null;
}

function clientFromRow(row, col){
  var act = pick(row, col, ["active","enabled"]);
  return {
    email: str(pick(row, col, ["email"])).toLowerCase(),
    code: str(pick(row, col, ["accesscode","code","password"])),
    name: str(pick(row, col, ["clientname","name"])),
    project: str(pick(row, col, ["project"])),
    notes: str(pick(row, col, ["notes","note"])),
    active: !(act === false || String(act).toLowerCase() === "false" || String(act).toLowerCase() === "no")
  };
}

/* --------------------------------------------------------------- tokens ---
   A token is  base64(who|expiry).signature  -- the signature is an HMAC with
   a secret only this script knows, so nobody can mint one for someone else or
   extend their own expiry. */
function mintToken(who){
  var hours = Number(setting("SESSION_HOURS")) || 12;
  var body  = Utilities.base64EncodeWebSafe(who + "|" + (Date.now() + hours*3600*1000));
  return body + "." + sign(body);
}
function sign(body){
  var raw = Utilities.computeHmacSha256Signature(body, setting("TOKEN_SECRET") || "unset");
  return Utilities.base64EncodeWebSafe(raw);
}
function readToken(token){
  token = String(token||"");
  var dot = token.lastIndexOf(".");
  if(dot < 1) return null;
  var body = token.slice(0, dot), sig = token.slice(dot+1);
  if(sign(body) !== sig) return null;                       /* forged or tampered */
  var parts = Utilities.newBlob(Utilities.base64DecodeWebSafe(body)).getDataAsString().split("|");
  if(parts.length !== 2) return null;
  if(Number(parts[1]) < Date.now()) return null;            /* expired */
  return parts[0];
}
function requireClient(req){
  var email = readToken(req.token);
  if(!email || email === "@admin") throw new Error("Your session has expired. Please sign in again.");
  return email;
}
function requireAdmin(req){
  if(readToken(req.token) !== "@admin") throw new Error("Team session expired. Please sign in again.");
}

/* =============================================================== catalogue */
/* Served only to a signed-in client, so the catalogue is never public. */
function catalog(req){
  requireClient(req);
  /* Same single pass the dashboard uses, minus anything switched off. One
     implementation means the two sides can never drift apart. */
  var live = scanCatalogue(false).products.filter(function(p){ return p.active; });
  return { products: live, areas: readAreas() };
}

/* ============================================================== selections */
function loadSelections(req){
  var email = requireClient(req);
  var sh = book().getSheetByName(TAB_SELECT);
  if(!sh) return { selections: [] };
  var rows = sh.getDataRange().getValues();
  if(rows.length < 2) return { selections: [] };
  var col = headerMap(rows[0]);
  var out = [];
  for(var r=1; r<rows.length; r++){
    if(str(pick(rows[r], col, ["email"])).toLowerCase() !== email) continue;
    out.push({
      area:   str(pick(rows[r], col, ["room","area"])),
      cat:    str(pick(rows[r], col, ["category"])),
      sub:    str(pick(rows[r], col, ["subcategory"])),
      brand:  str(pick(rows[r], col, ["brand"])),
      name:   str(pick(rows[r], col, ["product","productname"])),
      fin:    str(pick(rows[r], col, ["finish"])),
      qty:    num(pick(rows[r], col, ["qty","quantity"])) || 1
    });
  }
  return { selections: out };
}

/* The client's whole palette is rewritten each time -- simplest thing that
   cannot drift out of step with what they see on screen.

   Done as ONE read, ONE clear and ONE write. Deleting the client's old rows
   individually meant a sheet call per row, which was slow enough under a lock
   that a second save arriving behind the first could time out. */
function saveSelections(req){
  var email = requireClient(req);
  var list  = Array.isArray(req.selections) ? req.selections : [];
  var lock  = LockService.getScriptLock();
  lock.waitLock(8000);   /* fail fast; the client retries */
  try{
    var sh   = ensureTab(book(), TAB_SELECT, SELECT_HEAD);
    var last = sh.getLastRow();
    var wide = SELECT_HEAD.length;
    var head = sh.getRange(1, 1, 1, wide).getValues()[0];
    var col  = headerMap(head);
    var emailCol = col["email"];

    var rows = last > 1 ? sh.getRange(2, 1, last - 1, wide).getValues() : [];
    var keep = rows.filter(function(r){
      return str(r[emailCol]).toLowerCase() !== email && str(r[emailCol]) !== "";
    });

    var client = findClient(email) || {};
    var stamp  = new Date();
    var mine   = list.map(function(s){
      var qty = num(s.qty) || 1, price = num(s.price);
      return [stamp, email, client.name || "", str(s.area), str(s.cat), str(s.sub),
              str(s.brand), str(s.name), str(s.fin), qty, price, price * qty];
    });

    var all = keep.concat(mine);
    if(last > 1) sh.getRange(2, 1, last - 1, wide).clearContent();
    if(all.length) sh.getRange(2, 1, all.length, wide).setValues(all);

    return { ok:true, count:list.length };
  } finally {
    lock.releaseLock();
  }
}

/* =================================================================== admin */
function adminLogin(req){
  var code = String(req.code||"").trim();
  if(!code || code !== String(setting("ADMIN_CODE")).trim()) return { error:"Wrong team password." };
  return { token: mintToken("@admin") };
}

/* ---------------------------------------------------------------- overview */
function adminOverview(req){
  requireAdmin(req);
  /* Deliberately does NOT read the room tabs. The dashboard already fetches the
     catalogue once per session and counts it there -- reading all ten tabs again
     here only meant this call and that one queued behind each other, because
     Apps Script runs one execution at a time per user. */
  var ss = book();
  var clients = [], sel = [];
  var cs = ss.getSheetByName(TAB_CLIENTS);
  if(cs){
    var crows = cs.getDataRange().getValues();
    if(crows.length > 1){
      var ccol = headerMap(crows[0]);
      for(var r=1;r<crows.length;r++){
        var c = clientFromRow(crows[r], ccol);
        if(c.email) clients.push(c);
      }
    }
  }

  var ss2 = ss.getSheetByName(TAB_SELECT);
  if(ss2){
    var srows = ss2.getDataRange().getValues();
    if(srows.length > 1){
      var scol = headerMap(srows[0]);
      for(var i=1;i<srows.length;i++){
        var e = str(pick(srows[i], scol, ["email"])).toLowerCase();
        if(!e) continue;
        sel.push({
          email: e,
          who:   str(pick(srows[i], scol, ["clientname"])),
          area:  str(pick(srows[i], scol, ["room","area"])),
          name:  str(pick(srows[i], scol, ["product","productname"])),
          brand: str(pick(srows[i], scol, ["brand"])),
          value: num(pick(srows[i], scol, ["linetotal"])),
          at:    pick(srows[i], scol, ["updated"])
        });
      }
    }
  }

  /* how many clients changed something in the last seven days */
  var week = Date.now() - 7*24*3600*1000, recentEmails = {};
  sel.forEach(function(s){ if(s.at && new Date(s.at).getTime() > week) recentEmails[s.email] = 1; });

  /* the products being chosen most often, across everyone */
  var tally = {};
  sel.forEach(function(s){
    if(!s.name) return;
    var k = s.name + "||" + s.brand;
    tally[k] = tally[k] || { name:s.name, brand:s.brand, n:0 };
    tally[k].n++;
  });
  var top = Object.keys(tally).map(function(k){ return tally[k]; })
              .sort(function(a,b){ return b.n - a.n; }).slice(0, 8);

  /* one line per client, newest change first */
  var lastBy = {};
  sel.forEach(function(s){
    if(!s.at) return;
    var t = new Date(s.at).getTime();
    if(!lastBy[s.email] || t > lastBy[s.email].t) lastBy[s.email] = { t:t, who:s.who, email:s.email };
  });
  var recent = Object.keys(lastBy).map(function(k){ return lastBy[k]; })
                 .sort(function(a,b){ return b.t - a.t; }).slice(0, 6)
                 .map(function(x){ return { email:x.email, who:x.who, at:new Date(x.t).toISOString() }; });

  var value = 0;
  sel.forEach(function(s){ value += s.value || 0; });

  return {
    clients: clients.length,
    activeClients: clients.filter(function(c){ return c.active; }).length,
    selecting: Object.keys(lastBy).length,
    recentWeek: Object.keys(recentEmails).length,
    selections: sel.length,
    value: value,
    top: top,
    recent: recent
  };
}

/* ----------------------------------------------------------------- clients */
function adminClients(req){
  requireAdmin(req);
  var ss = book();
  var cs = ss.getSheetByName(TAB_CLIENTS), out = [];
  if(!cs) return { clients: [] };

  var rows = cs.getDataRange().getValues(), col = headerMap(rows[0]);
  var tally = {}, stamp = {}, worth = {};
  var sel = ss.getSheetByName(TAB_SELECT);
  if(sel){
    var sr = sel.getDataRange().getValues();
    if(sr.length > 1){
      var sc = headerMap(sr[0]);
      for(var i=1;i<sr.length;i++){
        var e = str(pick(sr[i], sc, ["email"])).toLowerCase();
        if(!e) continue;
        tally[e] = (tally[e]||0) + 1;
        worth[e] = (worth[e]||0) + num(pick(sr[i], sc, ["linetotal"]));
        var t = pick(sr[i], sc, ["updated"]);
        if(t && (!stamp[e] || t > stamp[e])) stamp[e] = t;
      }
    }
  }
  var listed = {};
  for(var r=1;r<rows.length;r++){
    var c = clientFromRow(rows[r], col);
    if(!c.email) continue;
    listed[c.email] = 1;
    c.count   = tally[c.email] || 0;
    c.value   = worth[c.email] || 0;
    c.updated = stamp[c.email] ? new Date(stamp[c.email]).toISOString() : "";
    out.push(c);
  }

  /* Anyone with selections but no row on the Clients tab has been removed.
     Their record is still here and still worth reading, so it is returned
     rather than quietly dropped -- otherwise "kept" would mean "unreachable". */
  for(var e in tally){
    if(listed[e]) continue;
    out.push({
      email: e, name: "", project: "", code: "", notes: "",
      active: false, removed: true,
      count: tally[e], value: worth[e] || 0,
      updated: stamp[e] ? new Date(stamp[e]).toISOString() : ""
    });
  }
  return { clients: out };
}

function adminClient(req){
  requireAdmin(req);
  var email = String(req.email||"").trim().toLowerCase();
  var sh = book().getSheetByName(TAB_SELECT);
  if(!sh) return { selections: [] };
  var rows = sh.getDataRange().getValues();
  if(rows.length < 2) return { selections: [] };
  var col = headerMap(rows[0]), out = [];
  for(var r=1;r<rows.length;r++){
    if(str(pick(rows[r], col, ["email"])).toLowerCase() !== email) continue;
    out.push({
      updated: pick(rows[r], col, ["updated"]) ? new Date(pick(rows[r], col, ["updated"])).toISOString() : "",
      area:  str(pick(rows[r], col, ["room","area"])),
      cat:   str(pick(rows[r], col, ["category"])),
      sub:   str(pick(rows[r], col, ["subcategory"])),
      brand: str(pick(rows[r], col, ["brand"])),
      name:  str(pick(rows[r], col, ["product","productname"])),
      fin:   str(pick(rows[r], col, ["finish"])),
      qty:   num(pick(rows[r], col, ["qty","quantity"])) || 1,
      price: num(pick(rows[r], col, ["unitprice","price"]))
    });
  }
  return { selections: out };
}

/* Add or edit. The email is the key: send "was" when renaming one. */
function adminClientSave(req){
  requireAdmin(req);
  var c = req.client || {};
  var email = String(c.email||"").trim().toLowerCase();
  if(!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) return { error:"That doesn't look like an email address." };

  var lock = LockService.getScriptLock();
  lock.waitLock(8000);
  try{
    var sh = ensureTab(book(), TAB_CLIENTS, CLIENT_HEAD);
    var last = sh.getLastRow();
    var wide = Math.max(sh.getLastColumn(), CLIENT_HEAD.length);
    var head = sh.getRange(1,1,1,wide).getValues()[0];
    var col  = headerMap(head);
    var rows = last > 1 ? sh.getRange(2,1,last-1,wide).getValues() : [];

    var was = String(c.was || email).trim().toLowerCase();
    var at = -1, clash = -1;
    for(var r=0;r<rows.length;r++){
      var e = str(pick(rows[r], col, ["email"])).toLowerCase();
      if(e === was) at = r;
      else if(e === email) clash = r;
    }
    if(clash >= 0) return { error:"Another client already uses that email." };

    var code = String(c.code||"").trim() || (at >= 0 ? str(pick(rows[at], col, ["accesscode","code"])) : "") || makeCode();
    var line = blankRow(wide, at >= 0 ? rows[at] : null);
    function put(names, v){
      for(var i=0;i<names.length;i++){ var x = col[names[i]]; if(x !== undefined){ line[x] = v; return; } }
    }
    put(["email"], email);
    put(["accesscode","code","password"], code);
    put(["clientname","name"], str(c.name));
    put(["project"], str(c.project));
    put(["active","enabled"], c.active === false ? false : true);
    put(["notes","note"], str(c.notes));

    if(at >= 0) sh.getRange(at+2, 1, 1, wide).setValues([line]);
    else        sh.getRange(last+1, 1, 1, wide).setValues([line]);

    /* a renamed client keeps the palette they already chose */
    if(at >= 0 && was !== email) reemail(was, email, str(c.name));

    return { ok:true, email:email, code:code };
  } finally { lock.releaseLock(); }
}

/* Removing a client takes them off the client list and nothing else. What they
   chose is a record of a job and outlives their access to the library, so it
   stays on the Selections tab -- and comes back attached to them if they are
   ever added again, because the email is the key.

   purge:true is the separate, deliberate second step that erases the record. */
function adminClientKill(req){
  requireAdmin(req);
  var email = String(req.email||"").trim().toLowerCase();
  var lock = LockService.getScriptLock();
  lock.waitLock(8000);
  try{
    var sh = book().getSheetByName(TAB_CLIENTS);
    if(sh){
      var last = sh.getLastRow(), wide = sh.getLastColumn();
      if(last > 1){
        var col = headerMap(sh.getRange(1,1,1,wide).getValues()[0]);
        var rows = sh.getRange(2,1,last-1,wide).getValues();
        var keep = rows.filter(function(r){
          return str(pick(r, col, ["email"])).toLowerCase() !== email && str(pick(r, col, ["email"])) !== "";
        });
        sh.getRange(2,1,last-1,wide).clearContent();
        if(keep.length) sh.getRange(2,1,keep.length,wide).setValues(keep);
      }
    }
    if(req.purge) reemail(email, null, "");
    return { ok:true, purged: !!req.purge };
  } finally { lock.releaseLock(); }
}

/* Rewrite or drop a client's rows on the Selections tab. to=null deletes. */
function reemail(from, to, name){
  var sh = book().getSheetByName(TAB_SELECT);
  if(!sh) return;
  var last = sh.getLastRow(), wide = SELECT_HEAD.length;
  if(last < 2) return;
  var col = headerMap(sh.getRange(1,1,1,wide).getValues()[0]);
  var rows = sh.getRange(2,1,last-1,wide).getValues();
  var out = [];
  rows.forEach(function(r){
    var e = str(r[col["email"]]).toLowerCase();
    if(!e) return;
    if(e === from){
      if(to === null) return;
      r[col["email"]] = to;
      if(col["clientname"] !== undefined && name) r[col["clientname"]] = name;
    }
    out.push(r);
  });
  sh.getRange(2,1,last-1,wide).clearContent();
  if(out.length) sh.getRange(2,1,out.length,wide).setValues(out);
}

/* ---------------------------------------------------------------- products */
function adminCatalog(req){
  requireAdmin(req);
  return scanCatalogue(true);
}

/* ONE read per room tab, and everything comes out of it: the header map, any
   missing ids, and the products themselves. The round trip to the sheet is the
   expensive part -- reading the same tab three times to answer one question is
   what made this take half a minute. */
function scanCatalogue(stamp){
  var skip = {};
  skip[norm(TAB_CLIENTS)] = 1; skip[norm(TAB_SELECT)] = 1;
  skip[norm(TAB_SETTINGS)] = 1; skip[norm(TAB_AREAS)] = 1;

  var out = [], rooms = [], choices = {}, sheets = book().getSheets();
  var seed = Date.now().toString(36);

  for(var s=0; s<sheets.length; s++){
    var sh = sheets[s];
    if(skip[norm(sh.getName())]) continue;
    if(sh.getLastRow() < 2) continue;

    var rows = sh.getDataRange().getValues();
    var col  = headerMap(rows[0]);
    if(col["productname"] === undefined && col["product"] === undefined &&
       col["name"] === undefined && col["item"] === undefined) continue;

    var area = sh.getName();                       /* the tab name is the room */
    rooms.push(area);
    if(stamp){
      /* One call reads the validation on every column of the first data row;
         asking per column doubled the round trips for no extra information. */
      var dvs = null;
      try{ dvs = sh.getRange(2, 1, 1, rows[0].length).getDataValidations()[0]; }catch(e){}
      choices[area] = {
        cat: listFrom(dvs, colFor(rows[0], byKey("cat"))),
        sub: listFrom(dvs, colFor(rows[0], byKey("sub")))
      };
    }

    var idCol = colFor(rows[0], byKey("id"));
    if(idCol === -1 && stamp){
      idCol = rows[0].length;
      sh.getRange(1, idCol + 1).setValue("GDB ID").setFontWeight("bold");
      for(var f=0; f<rows.length; f++) rows[f][idCol] = "";
    }

    var wrote = false;
    for(var r=1; r<rows.length; r++){
      var name = str(pick(rows[r], col, ["product","productname","name","item","title"]));
      if(!name) continue;                          /* spacer row */

      if(stamp && idCol !== -1 && !str(rows[r][idCol])){
        rows[r][idCol] = "p" + seed + s.toString(36) + r.toString(36);
        wrote = true;
      }
      var act  = pick(rows[r], col, ["active"]);
      var live = !(act === false || String(act).toLowerCase() === "false" ||
                                    String(act).toLowerCase() === "no");
      var main = str(pick(rows[r], col, ["mainimageurl","image","images","photo"]));
      var more = str(pick(rows[r], col, ["additionalimages","moreimages"]));

      out.push({
        id:     idCol === -1 ? "" : str(rows[r][idCol]),
        area:   area,
        active: live,
        cat:    str(pick(rows[r], col, ["category","cat"])),
        sub:    str(pick(rows[r], col, ["subcategory","subcat","sub","type"])),
        brand:  str(pick(rows[r], col, ["brand","manufacturer"])),
        name:   name,
        price:  num(pick(rows[r], col, ["price","cost","listprice"])),
        unit:   str(pick(rows[r], col, ["unit","uom","per"])),
        desc:   str(pick(rows[r], col, ["description","desc","details"])),
        image:  main,
        extra:  more,
        images: splitList(main).concat(splitList(more)),
        colors: splitList(pick(rows[r], col, ["colours","colors","colour","color","finish","finishes"])),
        sku:      str(pick(rows[r], col, ["sku","code","model"])),
        leadTime: str(pick(rows[r], col, ["leadtime","lead"])),
        supplier: str(pick(rows[r], col, ["supplier","vendor"]))
      });
    }

    if(wrote){
      var ids = rows.slice(1).map(function(r){ return [r[idCol]]; });
      sh.getRange(2, idCol + 1, ids.length, 1).setValues(ids);
    }
  }
  return { products: out, rooms: rooms, choices: choices };
}

/* A column the team has put a dropdown on. Typing past one of these is what
   makes the sheet refuse a write, so the dashboard offers the same list
   instead of a free text box. */
function listFrom(dvs, col0){
  if(!dvs || col0 === -1 || col0 >= dvs.length) return null;
  try{
    var dv = dvs[col0];
    if(!dv) return null;
    var type = dv.getCriteriaType();
    var vals = dv.getCriteriaValues();
    if(type === SpreadsheetApp.DataValidationCriteria.VALUE_IN_LIST){
      return (vals[0] || []).map(function(v){ return String(v).trim(); })
                            .filter(function(v){ return v !== ""; });
    }
    if(type === SpreadsheetApp.DataValidationCriteria.VALUE_IN_RANGE){
      var flat = [], got = vals[0].getValues();
      for(var i=0;i<got.length;i++){
        var v = String(got[i][0]).trim();
        if(v) flat.push(v);
      }
      return flat;
    }
  }catch(e){}
  return null;
}

/* Add or edit one product. No id means new. Moving a product between rooms
   means a different tab, so that is a delete and an append. */
function adminSaveProduct(req){
  requireAdmin(req);
  var p = req.product || {};
  var area = str(p.area);
  var name = str(p.name);
  if(!area) return { error:"Choose a room." };
  if(!name) return { error:"Give the product a name." };

  var lock = LockService.getScriptLock();
  lock.waitLock(8000);
  try{
    var ss = book();
    var id = str(p.id);
    var found = id ? locate(ss, id, area) : null;
    if(id && !found){
      /* somebody deleted it from under us -- appending would make a twin */
      return { error:"That product is no longer in the library. Refresh and try again." };
    }

    if(found && norm(found.sheet.getName()) !== norm(area)){
      found.sheet.deleteRow(found.row);                   /* moved rooms */
      found = null;
    }
    if(!id) id = "p" + Date.now().toString(36) + Math.floor(Math.random()*1296).toString(36);

    var sh = found ? found.sheet : roomTab(ss, area);
    var wide = Math.max(sh.getLastColumn(), 1);
    var head = sh.getRange(1,1,1,wide).getValues()[0];

    /* a tab that has never had, say, a Lead Time column gets one the first time
       somebody types a lead time into the dashboard */
    var need = [];
    FIELDS.forEach(function(f){
      if(f.key !== "id" && (p[f.key] === undefined || p[f.key] === "")) return;
      if(colFor(head, f) === -1) need.push(f);
    });
    if(need.length){
      sh.getRange(1, wide+1, 1, need.length)
        .setValues([need.map(function(f){ return f.head; })]).setFontWeight("bold");
      wide += need.length;
      head = sh.getRange(1,1,1,wide).getValues()[0];
    }

    var line = blankRow(wide, found ? sh.getRange(found.row, 1, 1, wide).getValues()[0] : null);

    FIELDS.forEach(function(f){
      var c = colFor(head, f);
      if(c === -1) return;
      if(f.key === "id"){ line[c] = id; return; }
      if(p[f.key] === undefined) return;
      if(f.key === "active"){ line[c] = p.active === false ? false : true; return; }
      line[c] = f.num ? (num(p[f.key]) || "") : str(p[f.key]);
    });

    var row = found ? found.row : sh.getLastRow() + 1;
    sh.getRange(row, 1, 1, wide).setValues([line]);

    /* Several tabs put a dropdown on Category. A value outside its list is
       rejected when the sheet flushes -- which, left alone, happens AFTER this
       function has returned, killing the response instead of reporting it.
       Flushing here brings that failure inside the try where it can be told. */
    SpreadsheetApp.flush();

    return { ok:true, id:id, area:sh.getName(), created:!found };
  } finally { lock.releaseLock(); }
}

/* archive:true keeps the row and flips Active off, which is what you want for
   a product a client has already chosen. Otherwise the row really goes. */
function adminKillProduct(req){
  requireAdmin(req);
  var id = str(req.id);
  if(!id) return { error:"No product given." };
  var lock = LockService.getScriptLock();
  lock.waitLock(8000);
  try{
    var found = locate(book(), id, str(req.area));
    if(!found) return { error:"That product is already gone." };
    if(req.archive){
      var wide = found.sheet.getLastColumn();
      var head = found.sheet.getRange(1,1,1,wide).getValues()[0];
      var c = colFor(head, byKey("active"));
      if(c === -1){
        found.sheet.getRange(1, wide+1).setValue("Active").setFontWeight("bold");
        c = wide;
      }
      found.sheet.getRange(found.row, c+1).setValue(false);
      return { ok:true, archived:true };
    }
    found.sheet.deleteRow(found.row);
    return { ok:true, deleted:true };
  } finally { lock.releaseLock(); }
}

/* Bulk load one room from a supplier list. Saving 400-odd products one at a
   time means 400 locks and 400 round trips; this is one read, one clear and one
   write per room, which is the same shape as saving a client's palette.

   replace:true wipes the room first. Anything already there is gone, so the
   caller is expected to have taken a copy -- there is no undo in here. */
function adminImport(req){
  requireAdmin(req);
  var area = str(req.area);
  var list = Array.isArray(req.products) ? req.products : [];
  if(!area) return { error:"Which room?" };
  if(!list.length) return { error:"Nothing to import." };

  var lock = LockService.getScriptLock();
  lock.waitLock(20000);
  try{
    var ss = book();
    var sh = roomTab(ss, area);
    var wide = Math.max(sh.getLastColumn(), PRODUCT_HEAD.length);
    var head = sh.getRange(1, 1, 1, wide).getValues()[0];

    /* give the tab any column this import needs and it has never had */
    var need = [];
    FIELDS.forEach(function(f){
      if(colFor(head, f) === -1) need.push(f);
    });
    if(need.length){
      sh.getRange(1, wide + 1, 1, need.length)
        .setValues([need.map(function(f){ return f.head; })]).setFontWeight("bold");
      wide += need.length;
      head = sh.getRange(1, 1, 1, wide).getValues()[0];
    }

    var kept = [];
    var last = sh.getLastRow();
    if(last > 1){
      if(req.replace) sh.getRange(2, 1, last - 1, wide).clearContent();
      else kept = sh.getRange(2, 1, last - 1, wide).getValues()
                    .filter(function(r){ return String(r.join("")).trim() !== ""; });
    }

    var seed = Date.now().toString(36);
    var rows = list.map(function(p, i){
      var line = blankRow(wide, null);
      FIELDS.forEach(function(f){
        var c = colFor(head, f);
        if(c === -1) return;
        if(f.key === "id"){ line[c] = "p" + seed + i.toString(36); return; }
        if(f.key === "active"){ line[c] = p.active === false ? false : true; return; }
        if(p[f.key] === undefined || p[f.key] === "") return;
        line[c] = f.num ? (num(p[f.key]) || "") : str(p[f.key]);
      });
      return line;
    });

    var all = kept.concat(rows);
    sh.getRange(2, 1, all.length, wide).setValues(all);
    SpreadsheetApp.flush();
    return { ok:true, area:sh.getName(), written:rows.length, total:all.length };
  } finally { lock.releaseLock(); }
}

function adminAddRoom(req){
  requireAdmin(req);
  var name = str(req.name);
  if(!name) return { error:"Name the room." };
  var ss = book();
  if(ss.getSheetByName(name)) return { error:"That room already exists." };
  roomTab(ss, name);
  return { ok:true, name:name };
}

/* Find a product by id. The caller nearly always knows which room it is in, so
   that tab is opened by name and read directly -- two sheet calls. Walking every
   tab means listing them all first, which is a call per tab before the search
   even starts, and that alone was most of the time an edit took. The long way
   round is kept only for a product that has been moved between rooms. */
function locate(ss, id, hint){
  if(hint){
    var direct = ss.getSheetByName(hint);
    if(direct){
      var hit = findIdIn(direct, id);
      if(hit) return hit;
    }
  }
  var tabs = productTabs();
  for(var t=0;t<tabs.length;t++){
    if(hint && norm(tabs[t].getName()) === norm(hint)) continue;   /* already looked */
    var found = findIdIn(tabs[t], id);
    if(found) return found;
  }
  return null;
}

function findIdIn(sh, id){
  var last = sh.getLastRow(), wide = sh.getLastColumn();
  if(last < 2 || wide < 1) return null;
  var head = sh.getRange(1, 1, 1, wide).getValues()[0];
  var c = colFor(head, byKey("id"));
  if(c === -1) return null;
  var ids = sh.getRange(2, c + 1, last - 1, 1).getValues();
  for(var r=0;r<ids.length;r++){
    if(str(ids[r][0]) === id) return { sheet:sh, row:r+2 };
  }
  return null;
}

function roomTab(ss, name){
  var sh = ss.getSheetByName(name);
  if(sh){ ensureIds(sh); return sh; }
  sh = ss.insertSheet(name);
  sh.getRange(1,1,1,PRODUCT_HEAD.length).setValues([PRODUCT_HEAD]).setFontWeight("bold");
  sh.setFrozenRows(1);
  return sh;
}

/* Every product carries an id so an edit survives rows moving underneath it --
   two people working at once would otherwise overwrite each other's rows. */
function ensureIds(sh){
  var last = sh.getLastRow();
  if(last < 2) return 0;
  var wide = sh.getLastColumn();
  var head = sh.getRange(1,1,1,wide).getValues()[0];
  var c = colFor(head, byKey("id"));
  if(c === -1){
    sh.getRange(1, wide+1).setValue("GDB ID").setFontWeight("bold");
    c = wide;
  }
  var nameCol = colFor(head, byKey("name"));
  var ids   = sh.getRange(2, c+1, last-1, 1).getValues();
  var names = nameCol === -1 ? null : sh.getRange(2, nameCol+1, last-1, 1).getValues();
  var n = 0, seed = Date.now().toString(36);
  for(var r=0;r<ids.length;r++){
    if(str(ids[r][0])) continue;
    if(names && !str(names[r][0])) continue;              /* spacer row, leave it */
    ids[r][0] = "p" + seed + r.toString(36);
    n++;
  }
  if(n) sh.getRange(2, c+1, last-1, 1).setValues(ids);
  return n;
}

function byKey(key){
  for(var i=0;i<FIELDS.length;i++) if(FIELDS[i].key === key) return FIELDS[i];
  return null;
}
function colFor(head, field){
  var col = headerMap(head);
  for(var i=0;i<field.names.length;i++){
    if(col[field.names[i]] !== undefined) return col[field.names[i]];
  }
  if(col[norm(field.head)] !== undefined) return col[norm(field.head)];
  return -1;
}

/* Every tab that isn't bookkeeping and has a product-name column. */
function productTabs(){
  var skip = {};
  skip[norm(TAB_CLIENTS)] = 1; skip[norm(TAB_SELECT)] = 1;
  skip[norm(TAB_SETTINGS)] = 1; skip[norm(TAB_AREAS)] = 1;
  return book().getSheets().filter(function(sh){
    if(skip[norm(sh.getName())]) return false;
    if(sh.getLastRow() < 1) return false;
    var col = headerMap(sh.getRange(1,1,1,Math.max(sh.getLastColumn(),1)).getValues()[0]);
    return col["productname"] !== undefined || col["product"] !== undefined ||
           col["name"] !== undefined || col["item"] !== undefined;
  });
}

/* ----------------------------------------------------------------- uploads */
/* Photos dropped on the dashboard land in a Drive folder and are served from
   their file id. Pasting a URL still works and stays the lighter option. */
function adminUpload(req){
  requireAdmin(req);
  var data = String(req.data||"");
  if(!data) return { error:"No file received." };
  var b64  = data.replace(/^data:[^,]*,/, "");
  var mime = String(req.mime||"image/jpeg");
  var blob = Utilities.newBlob(Utilities.base64Decode(b64), mime, str(req.name) || "product.jpg");

  var file = imageFolder().createFile(blob);
  file.setSharing(DriveApp.Access.ANYONE_WITH_LINK, DriveApp.Permission.VIEW);

  /* The thumbnail form lets us cap what gets served -- the original could be
     several megabytes behind a 44px square. Google refuses these when the
     request carries a referrer, which is why every <img> that shows one is
     marked no-referrer (see GDB.imgRef). A freshly written file also takes a
     minute or two before it serves, so a new photo can look broken at first. */
  return { ok:true, url:"https://drive.google.com/thumbnail?id=" + file.getId() + "&sz=w1600" };
}

function imageFolder(){
  var id = str(setting("DRIVE_FOLDER"));
  if(id){
    try{ return DriveApp.getFolderById(id); }catch(e){}
  }
  var f = DriveApp.createFolder("GDB Material Library Photos");
  putSetting("DRIVE_FOLDER", f.getId());
  return f;
}

/* ---------------------------------------------------------------- settings */
function adminSettings(req){
  requireAdmin(req);
  return {
    code: str(setting("ADMIN_CODE")),
    hours: Number(setting("SESSION_HOURS")) || 12,
    sheet: "https://docs.google.com/spreadsheets/d/" + SHEET_ID + "/edit"
  };
}

function adminSaveSettings(req){
  requireAdmin(req);
  var code = str(req.code);
  if(code){
    if(code.length < 6) return { error:"Make the password at least 6 characters." };
    putSetting("ADMIN_CODE", code);
  }
  var hours = num(req.hours);
  if(hours) putSetting("SESSION_HOURS", Math.max(1, Math.min(168, hours)));
  return { ok:true };
}

/* ============================================================ catalogue io */
function readAreas(){
  var sh = book().getSheetByName(TAB_AREAS);
  if(!sh) return [];
  var rows = sh.getDataRange().getValues();
  if(rows.length < 2) return [];
  var col = headerMap(rows[0]), out = [];
  for(var r=1;r<rows.length;r++){
    var a = str(pick(rows[r], col, ["area","room"]));
    if(a) out.push({ area:a, img:str(pick(rows[r], col, ["image","img","photo","imageurl"])) });
  }
  return out;
}

/* ================================================================= helpers */
/* A row of exactly `wide` cells, starting from `from` when there is one.
   The old one-liner for this -- new Array(n).join(",").split(",") -- returns n
   cells, not n-1, and setValues rejects a row even one cell too wide. */
function blankRow(wide, from){
  var line = from ? from.slice(0, wide) : [];
  while(line.length < wide) line.push("");
  return line;
}

function makeCode(){
  /* no 0/O/1/I -- these get read down a phone */
  var pool = "abcdefghjkmnpqrstuvwxyz23456789", s = "gdb";
  for(var i=0;i<4;i++) s += pool.charAt(Math.floor(Math.random()*pool.length));
  return s;
}

function setting(key){
  var sh = book().getSheetByName(TAB_SETTINGS);
  if(!sh) return "";
  var rows = sh.getDataRange().getValues();
  for(var r=1;r<rows.length;r++) if(norm(rows[r][0]) === norm(key)) return rows[r][1];
  return "";
}
function putSetting(key, value){
  var ss = book();
  var sh = ss.getSheetByName(TAB_SETTINGS) || ss.insertSheet(TAB_SETTINGS);
  var rows = sh.getDataRange().getValues();
  for(var r=1;r<rows.length;r++){
    if(norm(rows[r][0]) === norm(key)){ sh.getRange(r+1,2).setValue(value); return; }
  }
  sh.appendRow([key, value]);
}

function norm(s){ return String(s||"").toLowerCase().replace(/[^a-z0-9]/g,""); }
function headerMap(headerRow){
  var map = {};
  for(var c=0;c<headerRow.length;c++){
    var k = norm(headerRow[c]);
    if(k && map[k] === undefined) map[k] = c;
  }
  return map;
}
function pick(row, col, names){
  for(var i=0;i<names.length;i++){
    var c = col[names[i]];
    if(c !== undefined && row[c] !== "" && row[c] !== null) return row[c];
  }
  return "";
}
function str(v){ return String(v === null || v === undefined ? "" : v).trim(); }
function num(v){
  if(typeof v === "number") return v;
  var n = parseFloat(String(v).replace(/[^0-9.\-]/g, ""));
  return isNaN(n) ? 0 : n;
}
function splitList(v){
  var s = str(v);
  if(!s) return [];
  return s.split(/\s*[|;\n\r]\s*/).filter(function(x){ return x !== ""; });
}
function json(obj){
  return ContentService.createTextOutput(JSON.stringify(obj))
                       .setMimeType(ContentService.MimeType.JSON);
}
