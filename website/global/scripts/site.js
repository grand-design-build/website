/* Site header behaviour: dropdown menus + highlighting the current section.
   Loaded by _partials/header.html, so every page with a header gets it. */
(function () {
  /* Dropdowns: tapping a top-level item opens its submenu instead of following
     the link, so the menu works on touch as well as hover. */
  document.querySelectorAll('.nav ul li').forEach(function (li) {
    var dropdown = li.querySelector('.dropdown');
    if (!dropdown) return;
    var trigger = li.querySelector('a');
    trigger.addEventListener('click', function (e) {
      e.preventDefault();
      var wasOpen = dropdown.classList.contains('open');
      document.querySelectorAll('.dropdown.open').forEach(function (d) { d.classList.remove('open'); });
      if (!wasOpen) { dropdown.classList.add('open'); }
    });
  });

  document.addEventListener('click', function (e) {
    if (!e.target.closest('.nav ul li')) {
      document.querySelectorAll('.dropdown.open').forEach(function (d) { d.classList.remove('open'); });
    }
  });

  /* ---------------------------------------------------------- mobile menu */
  /* Below 680px the menu becomes a drawer. Without this the site has no
     navigation at all on a phone -- which is over half our visitors. */
  var toggle = document.querySelector('.nav-toggle');
  var menu   = document.getElementById('nav-menu');
  var nav    = document.querySelector('.nav');

  function navHeight() {
    if (nav) {
      document.documentElement.style.setProperty(
        '--nav-h', Math.round(nav.getBoundingClientRect().height) + 'px');
    }
  }
  navHeight();
  window.addEventListener('resize', navHeight);

  function setOpen(open) {
    if (!toggle || !menu) return;
    menu.classList.toggle('is-open', open);
    toggle.setAttribute('aria-expanded', open ? 'true' : 'false');
    /* Stop the page scrolling behind the drawer. */
    document.body.style.overflow = open ? 'hidden' : '';
    if (!open) {
      menu.querySelectorAll('.dropdown.open').forEach(function (d) { d.classList.remove('open'); });
    }
  }

  if (toggle && menu) {
    toggle.addEventListener('click', function () {
      setOpen(!menu.classList.contains('is-open'));
    });
    /* A link that actually goes somewhere should close the drawer behind it.
       The section triggers do not -- they open their submenu instead. */
    menu.addEventListener('click', function (e) {
      var a = e.target.closest('a');
      if (a && !a.parentElement.querySelector('.dropdown')) { setOpen(false); }
    });
    document.addEventListener('keydown', function (e) {
      if (e.key === 'Escape' && menu.classList.contains('is-open')) {
        setOpen(false); toggle.focus();
      }
    });
    /* Dragging the window back to desktop width must not leave the page locked. */
    window.addEventListener('resize', function () {
      if (window.innerWidth > 680) { setOpen(false); }
    });
  }

  /* ------------------------------------------- accordions: FAQ + read-more */
  /* From global/templates/location.html. The copy is never removed from the
     DOM -- collapsing is visual only, so search engines still read every word.
     The .js-collapse class is added here rather than sitting in the CSS, so a
     visitor without JS gets every block open instead of every block empty. */
  function accordion(selector, headSel, bodySel) {
    document.querySelectorAll(selector).forEach(function (item) {
      var head = item.querySelector(headSel);
      var body = item.querySelector(bodySel);
      if (!head || !body) return;
      function sync() {
        body.style.maxHeight = item.classList.contains('open')
          ? body.scrollHeight + 'px'
          : '0px';
      }
      sync();
      head.addEventListener('click', function () {
        item.classList.toggle('open');
        sync();
      });
      window.addEventListener('resize', function () {
        if (item.classList.contains('open')) { sync(); }
      });
    });
  }

  if (document.querySelector('[data-expand], [data-faq]')) {
    document.documentElement.classList.add('js-collapse');
    accordion('[data-expand]', '.expand-head', '.expand-body');
    accordion('[data-faq]',    '.faq-q',       '.faq-a');
  }

  /* ------------------------------------------------------ the drawing set */
  /* Buttons and the drafting-scale rail for every .sheet-strip. The strip is
     already a real scroll container in CSS, so a trackpad, a touch drag and
     the keyboard all work before any of this runs -- this only adds the
     arrows and keeps the rail in step. No JS means no buttons, nothing more.

     Shared: any page that drops in a .sheet gets this for free. */
  document.querySelectorAll('.sheet').forEach(function (sheet) {
    var strip = sheet.querySelector('.sheet-strip');
    var rail  = sheet.querySelector('.sheet-rail');
    if (!strip || !rail) return;

    var fill = rail.querySelector('.bar i');
    var pos  = rail.querySelector('.pos');
    var prev = rail.querySelector('[data-dir="prev"]');
    var next = rail.querySelector('[data-dir="next"]');
    var items = strip.children;
    var total = items.length;

    function pad(n) { return (n < 10 ? '0' : '') + n; }

    /* How far one press moves: a whole page of tiles, less one so the eye
       keeps a landmark. */
    function step() {
      var first = items[0];
      var w = first ? first.getBoundingClientRect().width + 14 : 220;
      return Math.max(w, strip.clientWidth - w);
    }

    /* Honour a visitor who has asked for less movement -- the same rule the
       rest of the motion layer follows. */
    var still = window.matchMedia('(prefers-reduced-motion: reduce)');

    /* Work out the destination and clamp it, rather than adding to a value
       that may still be moving -- two quick presses then land where the
       visitor expects instead of compounding into nonsense. */
    function nudge(dir) {
      var max = strip.scrollWidth - strip.clientWidth;
      var to  = Math.max(0, Math.min(max, strip.scrollLeft + dir * step()));
      strip.scrollTo({ left: to, behavior: still.matches ? 'auto' : 'smooth' });
    }

    function sync() {
      var max = strip.scrollWidth - strip.clientWidth;
      var ratio = max > 0 ? strip.scrollLeft / max : 0;

      /* Which tile is furthest along that is still fully in view -- that is
         the honest answer to "where am I", not a count of what has passed.
         Measured off the rendered boxes: offsetLeft is relative to the page,
         not to the strip, so it cannot be compared against scrollLeft. */
      var edge = strip.getBoundingClientRect().right + 1;
      var seen = 0;
      for (var i = 0; i < total; i++) {
        if (items[i].getBoundingClientRect().right <= edge) { seen = i + 1; }
      }
      if (max <= 0) { seen = total; }

      if (fill) { fill.style.width = (max > 0 ? ratio * 100 : 100) + '%'; }
      if (pos)  { pos.textContent = pad(seen) + ' / ' + pad(total); }
      if (prev) { prev.disabled = strip.scrollLeft <= 1; }
      if (next) { next.disabled = strip.scrollLeft >= max - 1; }
    }

    if (prev) { prev.addEventListener('click', function () { nudge(-1); }); }
    if (next) { next.addEventListener('click', function () { nudge(1); }); }

    /* Passive: this only measures, so it must never block the scroll. The
       scroll event already fires at frame rate, so there is nothing for a
       requestAnimationFrame to save -- and wrapping it in one leaves the
       rail stale wherever rAF is throttled. */
    strip.addEventListener('scroll', sync, { passive: true });
    window.addEventListener('resize', sync);

    /* Photographs settle after the rail first draws, and each one changes
       scrollWidth. Re-measure when they land or the rail lies. */
    strip.querySelectorAll('img').forEach(function (img) {
      if (!img.complete) { img.addEventListener('load', sync, { once: true }); }
    });

    sync();
  });

  /* Highlight the menu item for the page we are on. Matches on the URL path, so
     /services/home-addition/ lights up "Services". */
  var here = location.pathname.replace(/index\.html$/, '');
  if (here.length > 1) { here = here.replace(/\/?$/, '/'); }

  document.querySelectorAll('.nav > ul > li').forEach(function (li) {
    var trigger = li.querySelector(':scope > a');
    if (!trigger) return;
    var match = Array.prototype.slice.call(li.querySelectorAll('a')).some(function (a) {
      var href = a.getAttribute('href') || '';
      if (href === '/') { return here === '/'; }
      return here === href || here.indexOf(href) === 0;
    });
    if (match) { trigger.classList.add('active'); }
  });
})();
