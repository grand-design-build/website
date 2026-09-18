/* ==========================================================================
   GRAND DESIGN BUILD -- motion
   One drafting layer for the whole site, the library included.

   The pointer draws. A graphite line trails the cursor and fades the way a
   pencil stroke would, heavier where the hand moved slowly. It is painted
   BEHIND the page, so the content sits on top of the drawing rather than
   under a gimmick.

   Also here: scroll reveals, a blueprint that draws itself into view, and
   buttons that lean very slightly toward the cursor.

   EVERYTHING in this file is decoration. On a touch device, or for a visitor
   who prefers reduced motion, none of it runs and every page still works
   exactly the same. Nothing here may ever carry information -- over half of
   our traffic is mobile and will never see a single pixel of it.
   ========================================================================== */
window.GDB = window.GDB || {};

GDB.motion = (function () {
  "use strict";

  var finePointer = window.matchMedia("(hover:hover) and (pointer:fine)").matches;
  var reduced     = window.matchMedia("(prefers-reduced-motion:reduce)").matches;
  var ok          = finePointer && !reduced;

  /* ------------------------------------------------------------- pencil */
  /* Points are held with a timestamp and the speed the pointer was moving
     when they were laid down. Age drives opacity, speed drives width --
     a fast flick leaves a thin, faint line, a slow considered move leaves a
     heavier one. That asymmetry is the whole reason it reads as graphite
     rather than as a glowing mouse trail. */

  /* Tunable. Change these to change how the line feels; they are exposed on
     GDB.motion.pencil so they can be tried live in the console before being
     written down here. */
  var CFG = {
    life:    850,   /* ms before a point has fully faded          */
    maxPts:   90,   /* cap, so a long fast drag cannot grow forever */
    minDist: 2.2,   /* px -- ignore jitter, it only thickens the line */
    heavy:   2.3,   /* px stroke when the hand is slow            */
    light:  0.55,   /* px stroke at speed                          */
    peak:   0.55    /* darkest the line ever gets                  */
  };

  var P = {
    cv: null, ctx: null, dpr: 1,
    pts: [], raf: 0, last: null, w: 0, h: 0
  };

  function initPencil() {
    if (!ok) return;

    P.cv = document.createElement("canvas");
    P.cv.className = "gdb-pencil";
    P.cv.setAttribute("aria-hidden", "true");
    document.body.appendChild(P.cv);
    P.ctx = P.cv.getContext("2d");

    size();
    window.addEventListener("resize", size, { passive: true });
    window.addEventListener("pointermove", onMove, { passive: true });

    /* Leaving the window should not leave a stroke hanging in mid air. */
    document.addEventListener("pointerleave", function () { P.last = null; });
  }

  function size() {
    if (!P.cv) return;
    P.dpr = Math.min(window.devicePixelRatio || 1, 2);
    P.w = window.innerWidth;
    P.h = window.innerHeight;
    P.cv.width  = Math.round(P.w * P.dpr);
    P.cv.height = Math.round(P.h * P.dpr);
    P.cv.style.width  = P.w + "px";
    P.cv.style.height = P.h + "px";
    P.ctx.setTransform(P.dpr, 0, 0, P.dpr, 0, 0);
    P.ctx.lineCap = "round";
    P.ctx.lineJoin = "round";
  }

  function onMove(e) {
    var now = performance.now();
    var x = e.clientX, y = e.clientY;

    if (P.last) {
      var dx = x - P.last.x, dy = y - P.last.y;
      var dist = Math.sqrt(dx * dx + dy * dy);
      if (dist < CFG.minDist) return;

      var dt = Math.max(now - P.last.t, 1);
      var speed = dist / dt;                        /* px per ms */
      /* Map speed to a stroke width. Anything past ~2.5 px/ms is "fast". */
      var k = Math.min(speed / 2.5, 1);
      var w = CFG.heavy + (CFG.light - CFG.heavy) * k;
      P.pts.push({ x: x, y: y, t: now, w: w });
      if (P.pts.length > CFG.maxPts) P.pts.shift();
    }

    P.last = { x: x, y: y, t: now };
    if (!P.raf) P.raf = requestAnimationFrame(draw);
  }

  function draw() {
    var now = performance.now();
    var ctx = P.ctx;
    ctx.clearRect(0, 0, P.w, P.h);

    /* Drop anything that has fully faded. */
    while (P.pts.length && now - P.pts[0].t > CFG.life) P.pts.shift();

    /* Each segment is drawn on its own so it can carry its own age and
       weight. Curving through the midpoints keeps the line from showing
       the polygon underneath it. */
    for (var i = 1; i < P.pts.length; i++) {
      var a = P.pts[i - 1], b = P.pts[i];
      var age = (now - b.t) / CFG.life;
      if (age >= 1) continue;

      /* Fade out on a curve, not linearly -- a pencil line holds its
         darkness for a moment and then goes quickly. */
      var alpha = (1 - age) * (1 - age) * CFG.peak;

      ctx.beginPath();
      ctx.moveTo(a.x, a.y);
      if (i < P.pts.length - 1) {
        var c = P.pts[i + 1];
        ctx.quadraticCurveTo(b.x, b.y, (b.x + c.x) / 2, (b.y + c.y) / 2);
      } else {
        ctx.lineTo(b.x, b.y);
      }
      ctx.strokeStyle = graphite(alpha);
      ctx.lineWidth = b.w * (1 - age * 0.35);
      ctx.stroke();
    }

    /* Idle costs nothing: the loop stops the moment the line is gone. */
    if (P.pts.length > 1) {
      P.raf = requestAnimationFrame(draw);
    } else {
      P.raf = 0;
      ctx.clearRect(0, 0, P.w, P.h);
    }
  }

  /* Read the ink colour from the stylesheet so the trail follows the theme
     -- graphite on paper in light, chalk on slate in dark -- instead of
     being hard-coded here. */
  var inkRGB = null;
  function graphite(alpha) {
    if (!inkRGB) {
      var raw = getComputedStyle(document.documentElement)
                  .getPropertyValue("--pencil-rgb").trim();
      inkRGB = raw || "23, 21, 18";
    }
    return "rgba(" + inkRGB + "," + alpha.toFixed(3) + ")";
  }

  /* --------------------------------------------------------- blueprint */
  /* An outline that draws itself once, when it is scrolled to. Mark it up as
       <svg data-blueprint> ... <path> ... </svg>
     and every path inside draws in sequence. Once only -- a loop stops being
     charming on the third pass. */

  function initBlueprint() {
    var figs = document.querySelectorAll("[data-blueprint]");
    if (!figs.length) return;

    if (reduced) {                       /* show it finished, do not animate */
      figs.forEach(function (f) { f.classList.add("is-drawn"); });
      return;
    }

    figs.forEach(function (fig) {
      fig.querySelectorAll("path, line, polyline, rect, circle").forEach(function (p) {
        var len = typeof p.getTotalLength === "function" ? p.getTotalLength() : 0;
        if (!len) return;
        p.style.strokeDasharray  = len;
        p.style.strokeDashoffset = len;
      });
    });

    var io = new IntersectionObserver(function (entries) {
      entries.forEach(function (en) {
        if (!en.isIntersecting) return;
        drawFigure(en.target);
        io.unobserve(en.target);
      });
    }, { threshold: 0.25 });

    figs.forEach(function (f) { io.observe(f); });
  }

  function drawFigure(fig) {
    var paths = fig.querySelectorAll("path, line, polyline, rect, circle");
    var step = parseInt(fig.getAttribute("data-stagger"), 10) || 90;
    paths.forEach(function (p, i) {
      p.style.transition = "stroke-dashoffset 1.1s cubic-bezier(.22,.61,.36,1) " +
                           (i * step) + "ms";
      p.style.strokeDashoffset = "0";
    });
    fig.classList.add("is-drawn");
  }

  /* ----------------------------------------------------------- reveals */
  /* Sections arrive rather than appear. Anything marked data-reveal. */

  function initReveals() {
    var els = document.querySelectorAll("[data-reveal]");
    if (!els.length) return;

    if (reduced) {
      els.forEach(function (el) { el.classList.add("is-in"); });
      return;
    }

    /* Only now is it safe for the CSS to hide them: we are running, and we
       are the ones who will bring them back. */
    document.documentElement.classList.add("js-reveal");

    var io = new IntersectionObserver(function (entries) {
      entries.forEach(function (en) {
        if (!en.isIntersecting) return;
        var el = en.target;
        var d = parseInt(el.getAttribute("data-reveal-delay"), 10) || 0;
        setTimeout(function () { el.classList.add("is-in"); }, d);
        io.unobserve(el);
      });
    }, { threshold: 0.12, rootMargin: "0px 0px -8% 0px" });

    els.forEach(function (el) { io.observe(el); });
  }

  /* ---------------------------------------------------------- magnetic */
  /* Buttons lean toward the cursor. Kept deliberately tiny -- past about
     4px it stops feeling like quality and starts feeling like a toy. */

  function initMagnetic() {
    if (!ok) return;
    document.querySelectorAll("[data-magnetic], .btn").forEach(function (el) {
      el.addEventListener("pointermove", function (e) {
        var r = el.getBoundingClientRect();
        var mx = (e.clientX - (r.left + r.width / 2)) / (r.width / 2);
        var my = (e.clientY - (r.top + r.height / 2)) / (r.height / 2);
        el.style.transform = "translate(" + (mx * 3).toFixed(2) + "px," +
                                            (my * 2).toFixed(2) + "px)";
      });
      el.addEventListener("pointerleave", function () { el.style.transform = ""; });
    });
  }

  /* ---------------------------------------------------------- hero film */
  /* CSS hides the hero video on phones and under reduced motion, but a hidden
     <video autoplay> can still fetch the file. Strip the attribute so the
     bytes are never requested at all -- this is the difference between a
     good mobile score and a bad one. */

  function initHeroFilm() {
    var v = document.querySelector(".hero-media");
    if (!v) return;
    if (finePointer && !reduced) return;
    v.removeAttribute("autoplay");
    v.querySelectorAll("source").forEach(function (s) { s.remove(); });
    if (typeof v.load === "function") v.load();
  }

  /* -------------------------------------------------------------- init */

  function init() {
    initHeroFilm();
    initPencil();
    initBlueprint();
    initReveals();
    initMagnetic();
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }

  return { init: init, enabled: ok, pencil: CFG };
})();
