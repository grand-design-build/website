/* ==========================================================================
   MATERIAL LIBRARY -- motion (library-only pieces)

   The cursor is NOT here. The pencil trail is one global system for the whole
   site and lives in website/global/scripts/motion.js, served at
   /assets/motion.js. The drafting rulers that used to live here were removed
   on 2026-09-17 -- one cursor metaphor across the domain, not two.

   What remains is specific to the library: the reveals for a grid that is
   built after load, the scroll meter, the image loupe, and the sticky-offset
   measurement. Everything here is decoration; the library works the same
   without it.

   It is GDB.libraryMotion, not GDB.motion, because the global file claims that
   name and is loaded with defer -- so it executes AFTER this one and used to
   overwrite it, leaving revealChildren undefined and the grid throwing the
   moment a client signed in. Two modules, two names.
   ========================================================================== */
window.GDB = window.GDB || {};

GDB.libraryMotion = (function(){
  "use strict";

  var finePointer  = window.matchMedia("(hover:hover) and (pointer:fine)").matches;
  var reduced      = window.matchMedia("(prefers-reduced-motion:reduce)").matches;

  /* ----------------------------------------------------------- reveals */
  var io = null;
  function initReveals(){
    if(reduced || !("IntersectionObserver" in window)){
      document.querySelectorAll("[data-reveal]").forEach(function(el){ el.classList.add("is-in"); });
      return;
    }
    io = new IntersectionObserver(function(entries){
      entries.forEach(function(en){
        if(!en.isIntersecting) return;
        var el = en.target;
        var delay = Number(el.getAttribute("data-reveal-delay") || 0);
        setTimeout(function(){ el.classList.add("is-in"); }, delay);
        io.unobserve(el);
      });
    }, { rootMargin: "0px 0px -8% 0px", threshold: 0.08 });

    document.querySelectorAll("[data-reveal]").forEach(prepare);
  }

  function prepare(el){
    if(el.dataset.revealReady) return;
    el.dataset.revealReady = "1";
    /* A headline reads better arriving word by word than as one block. */
    if(el.hasAttribute("data-reveal-split") && !el.querySelector(".reveal-word")){
      var words = el.textContent.trim().split(/\s+/);
      el.textContent = "";
      words.forEach(function(w,i){
        var s = document.createElement("span");
        s.className = "reveal-word";
        s.textContent = w;
        s.style.transitionDelay = (i * 45) + "ms";
        el.appendChild(s);
        el.appendChild(document.createTextNode(" "));
      });
      el.classList.add("is-in");
      el.style.opacity = 1;
      el.style.transform = "none";
      var obs = new IntersectionObserver(function(en){
        if(!en[0].isIntersecting) return;
        el.querySelectorAll(".reveal-word").forEach(function(s){ s.classList.add("is-in"); });
        obs.disconnect();
      }, { threshold: 0.15 });
      obs.observe(el);
      return;
    }
    if(io) io.observe(el);
  }

  /* Grid items are created after load, so they are staggered on demand. */
  function revealChildren(container, stagger){
    if(reduced || !io){
      container.querySelectorAll("[data-reveal]").forEach(function(el){ el.classList.add("is-in"); });
      return;
    }
    var i = 0;
    container.querySelectorAll("[data-reveal]").forEach(function(el){
      el.setAttribute("data-reveal-delay", String(Math.min(i * (stagger || 26), 420)));
      i++;
      prepare(el);
    });
  }

  /* ---------------------------------------------------------- magnetic */
  /* Buttons lean very slightly toward the cursor. Kept tiny on purpose. */
  function initMagnetic(){
    if(!finePointer || reduced) return;
    document.addEventListener("pointermove", function(e){
      var el = e.target.closest && e.target.closest("[data-magnetic]");
      document.querySelectorAll("[data-magnetic].pulled").forEach(function(o){
        if(o !== el){ o.classList.remove("pulled"); o.style.transform = ""; }
      });
      if(!el) return;
      var r = el.getBoundingClientRect();
      var dx = (e.clientX - (r.left + r.width/2)) / r.width;
      var dy = (e.clientY - (r.top + r.height/2)) / r.height;
      el.classList.add("pulled");
      el.style.transform = "translate3d(" + (dx*6).toFixed(2) + "px," + (dy*4).toFixed(2) + "px,0)";
    }, {passive:true});
    document.addEventListener("pointerleave", function(){
      document.querySelectorAll("[data-magnetic]").forEach(function(o){ o.style.transform = ""; });
    });
  }

  /* ------------------------------------------------------ scroll meter */
  function initScrollbar(){
    var bar = document.getElementById("scrollbar");
    if(!bar) return;
    var fill = bar.querySelector("i"), ticking = false;
    function draw(){
      ticking = false;
      var h = document.documentElement.scrollHeight - window.innerHeight;
      fill.style.width = (h > 0 ? Math.min(100, (window.scrollY / h) * 100) : 0) + "%";
    }
    window.addEventListener("scroll", function(){
      if(!ticking){ ticking = true; requestAnimationFrame(draw); }
    }, {passive:true});
    draw();
  }

  /* ------------------------------------------------------------- loupe */
  /* Hold the pointer over the detail image to magnify around it. */
  function bindLoupe(box){
    if(!box || !finePointer || reduced) return;
    var img = box.querySelector("img");
    if(!img) return;
    box.addEventListener("pointerenter", function(){ box.classList.add("zoom"); });
    box.addEventListener("pointerleave", function(){
      box.classList.remove("zoom");
      img.style.transformOrigin = "center center";
    });
    box.addEventListener("pointermove", function(e){
      var r = box.getBoundingClientRect();
      img.style.transformOrigin =
        (((e.clientX - r.left) / r.width) * 100).toFixed(1) + "% " +
        (((e.clientY - r.top) / r.height) * 100).toFixed(1) + "%";
    }, {passive:true});
  }

  /* --------------------------------------------------------- sticky offset */
  /* If this library is dropped into a page that already has a fixed header,
     measure it rather than hard-coding a height. */
  function syncStickyOffset(){
    var max = 0;
    document.querySelectorAll("header:not(.bar), .site-header, #masthead, [class*='sticky']")
      .forEach(function(el){
        if(el.closest(".bar")) return;
        var cs = getComputedStyle(el);
        if(cs.position !== "fixed" && cs.position !== "sticky") return;
        if(cs.visibility === "hidden" || cs.display === "none") return;
        var r = el.getBoundingClientRect();
        if(r.height > 8 && r.top <= 4 && r.bottom > max) max = r.bottom;
      });
    document.documentElement.style.setProperty("--sticky-offset",
      Math.round(Math.max(0, Math.min(max, 200))) + "px");
  }

  function init(){
    initReveals();
    initMagnetic();
    initScrollbar();
    syncStickyOffset();
    window.addEventListener("resize", syncStickyOffset);
  }

  return {
    init: init,
    revealChildren: revealChildren,
    prepare: prepare,
    bindLoupe: bindLoupe,
    reduced: reduced,
    finePointer: finePointer
  };
})();
