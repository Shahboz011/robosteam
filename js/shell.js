/* RoboSTEAM app shell: sidebar (desktop), top bar + bottom tab bar + "More" sheet (mobile), lesson drawer.
   Load it as the FIRST element inside <body data-page="..."> with a plain (non-deferred) <script> so the shell
   is in the DOM before the page content is parsed: no layout shift. Pages: dashboard | academy | progress |
   simulator | profile | settings. js/app.js fills the user card; js/auth.js wires every [data-logout] button;
   js/academy.js renders the lesson tree into [data-modules]. Every user-facing string is in T. */
(function () {
  'use strict';

  var T = {
    skip: "Asosiy qismga o'tish",
    home: 'RoboSTEAM – bosh sahifa',
    menu: 'Asosiy menyu',
    collapse: "Menyuni yig'ish",
    expand: 'Menyuni yoyish',
    soon: 'Tez orada',
    logout: 'Chiqish',
    profile: 'Profil',
    more: 'Yana',
    moreTitle: "Qo'shimcha bo'limlar",
    modules: 'Modullar',
    close: 'Yopish',
    loading: 'Yuklanmoqda…',
    pages: {
      dashboard: 'Bosh sahifa',
      academy: 'Darslar',
      progress: 'Natijalar',
      simulator: 'Simulyator',
      profile: 'Profil',
      settings: 'Sozlamalar',
    },
    tabs: { dashboard: 'Asosiy' }, // shorter labels for the bottom bar
  };

  var ICON = {
    dashboard: '<path d="M4 4h7v7H4zM13 4h7v4h-7zM13 10h7v10h-7zM4 13h7v7H4z" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linejoin="round"/>',
    academy: '<rect x="3" y="5" width="18" height="14" rx="3" fill="none" stroke="currentColor" stroke-width="2.4"/><path d="M10 9v6l5-3z" fill="currentColor" stroke="currentColor" stroke-width="1.5" stroke-linejoin="round"/>',
    progress: '<path d="M4 20V10M10 20V4M16 20v-7M22 20H2" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round"/>',
    simulator: '<rect x="6" y="6" width="12" height="12" rx="2" fill="none" stroke="currentColor" stroke-width="2.4"/><path d="M9 2v4M15 2v4M9 18v4M15 18v4M2 9h4M2 15h4M18 9h4M18 15h4" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"/><circle cx="12" cy="12" r="2" fill="currentColor"/>',
    profile: '<circle cx="12" cy="8" r="4" fill="none" stroke="currentColor" stroke-width="2.4"/><path d="M4 21c0-4.4 3.6-7 8-7s8 2.6 8 7" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round"/>',
    settings: '<circle cx="12" cy="12" r="3.2" fill="none" stroke="currentColor" stroke-width="2.4"/><path d="M12 2.5v3M12 18.5v3M2.5 12h3M18.5 12h3M5.3 5.3l2.1 2.1M16.6 16.6l2.1 2.1M5.3 18.7l2.1-2.1M16.6 7.4l2.1-2.1" stroke="currentColor" stroke-width="2.4" stroke-linecap="round"/>',
    more: '<circle cx="5" cy="12" r="2.2" fill="currentColor"/><circle cx="12" cy="12" r="2.2" fill="currentColor"/><circle cx="19" cy="12" r="2.2" fill="currentColor"/>',
    logout: '<path d="M14 4h4a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2h-4M10 8l-4 4 4 4M6 12h10" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"/>',
    collapse: '<path d="M15 6l-6 6 6 6" fill="none" stroke="currentColor" stroke-width="2.8" stroke-linecap="round" stroke-linejoin="round"/>',
    close: '<path d="M6 6l12 12M18 6L6 18" stroke="currentColor" stroke-width="3" stroke-linecap="round"/>',
  };
  function svg(name) { return '<svg class="ico" viewBox="0 0 24 24" aria-hidden="true" focusable="false">' + ICON[name] + '</svg>'; }

  var MENU = [
    { id: 'dashboard', href: 'dashboard.html' },
    { id: 'academy', href: 'academy.html' },
    { id: 'progress', href: 'progress.html' },
    { id: 'simulator', href: 'simulator.html' },
    { id: 'profile', href: 'profile.html' },
    { id: 'settings', href: 'settings.html' },
  ];
  var TABS = ['dashboard', 'academy', 'progress', 'profile'];  // + "More"
  var IN_MORE = { simulator: 1, settings: 1 };
  var STORE_KEY = 'robosteam.sidebar.collapsed';
  var DESKTOP = '(min-width: 1024px)';

  var body = document.body, root = document.documentElement;
  var page = body.getAttribute('data-page') || '';
  var hasTree = page === 'academy';

  function store(get, value) {
    try {
      if (get) return localStorage.getItem(STORE_KEY) === '1';
      localStorage.setItem(STORE_KEY, value ? '1' : '0');
    } catch (e) { /* private mode / blocked storage: collapse just isn't remembered */ }
    return false;
  }
  var collapsed = store(true);
  root.classList.toggle('side-collapsed', collapsed);

  function current(id) { return id === page ? ' aria-current="page"' : ''; }
  var userCard =
    '<span class="avatar" aria-hidden="true" data-shell-initials></span>' +
    '<span class="side-me-text side-label"><span class="side-me-name" data-shell-name>' + T.loading + '</span>' +
    '<span class="side-me-level" data-shell-level>&nbsp;</span></span>';

  // ---------- markup ----------
  var side =
    '<aside class="side" id="app-side">' +
      '<div class="side-top">' +
        '<a class="side-logo" href="dashboard.html" aria-label="' + T.home + '"><span class="side-logo-mark" aria-hidden="true">R</span><span class="side-label" aria-hidden="true">Robo<b>STEAM</b></span></a>' +
        '<button class="side-collapse" type="button" data-collapse aria-controls="app-side"></button>' +
      '</div>' +
      '<nav class="side-nav" aria-label="' + T.menu + '"><ul>' +
        MENU.map(function (m) {
          var label = T.pages[m.id];
          return '<li class="side-li' + (m.id === 'academy' && hasTree ? ' has-tree' : '') + '">' +
            '<a class="side-item" href="' + m.href + '"' + current(m.id) + ' title="' + label + '">' + svg(m.id) +
            '<span class="side-label">' + label + (m.soon ? ' <span class="soon">' + T.soon + '</span>' : '') + '</span></a>' +
            (m.id === 'academy' && hasTree ? '<div class="tree-slot" data-tree-side></div>' : '') +
          '</li>';
        }).join('') +
      '</ul></nav>' +
      '<div class="side-user">' +
        '<a class="side-me" href="profile.html"' + current('profile') + ' title="' + T.profile + '">' + userCard + '</a>' +
        '<button class="side-logout" type="button" data-logout title="' + T.logout + '">' + svg('logout') + '<span class="side-label">' + T.logout + '</span></button>' +
      '</div>' +
    '</aside>';

  var top =
    '<header class="topbar">' +
      '<a class="logo" href="dashboard.html" aria-label="' + T.home + '"><span aria-hidden="true">Robo<b>STEAM</b></span></a>' +
      '<p class="topbar-title" aria-hidden="true">' + (T.pages[page] || '') + '</p>' +
      '<a class="avatar-btn" href="profile.html" aria-label="' + T.profile + '"' + current('profile') + '><span class="avatar" data-shell-initials></span></a>' +
    '</header>';

  var tabs =
    '<nav class="tabbar" aria-label="' + T.menu + '"><ul>' +
      TABS.map(function (id) {
        var m = MENU.filter(function (x) { return x.id === id; })[0];
        return '<li><a class="tab" href="' + m.href + '"' + current(id) + '>' + svg(id) + '<span>' + (T.tabs[id] || T.pages[id]) + '</span></a></li>';
      }).join('') +
      '<li><button class="tab' + (IN_MORE[page] ? ' is-active' : '') + '" type="button" data-sheet-open aria-haspopup="dialog" aria-controls="more-sheet" aria-expanded="false">' + svg('more') + '<span>' + T.more + '</span></button></li>' +
    '</ul></nav>';

  var sheet =
    '<div class="scrim" data-scrim="sheet"></div>' +
    '<div class="sheet" id="more-sheet" role="dialog" aria-modal="true" aria-labelledby="more-sheet-h" data-overlay="sheet">' +
      '<div class="sheet-grab" aria-hidden="true"><i></i></div>' +
      '<h2 class="sheet-h" id="more-sheet-h">' + T.moreTitle + '</h2>' +
      '<ul class="sheet-list">' +
        '<li><a class="sheet-item" href="simulator.html"' + current('simulator') + '>' + svg('simulator') + '<span>' + T.pages.simulator + '</span></a></li>' +
        '<li><a class="sheet-item" href="settings.html"' + current('settings') + '>' + svg('settings') + '<span>' + T.pages.settings + '</span></a></li>' +
        '<li><button class="sheet-item is-danger" type="button" data-logout>' + svg('logout') + '<span>' + T.logout + '</span></button></li>' +
      '</ul>' +
    '</div>';

  var drawer = !hasTree ? '' :
    '<div class="scrim" data-scrim="drawer"></div>' +
    '<div class="drawer" id="lesson-drawer" role="dialog" aria-modal="true" aria-labelledby="lesson-drawer-h" data-overlay="drawer">' +
      '<div class="drawer-head"><h2 id="lesson-drawer-h">' + T.modules + '</h2>' +
      '<button class="icon-btn" type="button" data-drawer-close aria-label="' + T.close + '">' + svg('close') + '</button></div>' +
      '<div class="tree-slot" data-tree-drawer></div>' +
    '</div>';

  // One lesson tree, moved between the sidebar and the drawer (js/academy.js renders into [data-modules]).
  var tree = !hasTree ? '' :
    '<div class="lesson-tree" data-tree><ol class="mod-list" data-modules><li class="side-note">' + T.loading + '</li></ol></div>';

  body.insertAdjacentHTML('afterbegin', '<a class="skip" href="#main">' + T.skip + '</a>' + side + top + tabs + sheet + drawer + tree);

  // ---------- behaviour ----------
  function $(sel, rootEl) { return (rootEl || document).querySelector(sel); }
  var mq = window.matchMedia(DESKTOP);
  var collapseBtn = $('[data-collapse]');

  function setCollapsed(on) {
    collapsed = on;
    root.classList.toggle('side-collapsed', on);
    collapseBtn.setAttribute('aria-expanded', String(!on));
    collapseBtn.setAttribute('aria-label', on ? T.expand : T.collapse);
    collapseBtn.title = on ? T.expand : T.collapse;
    collapseBtn.innerHTML = svg('collapse');
    placeTree();
  }
  collapseBtn.addEventListener('click', function () { setCollapsed(!collapsed); store(false, collapsed); });

  // Lesson tree: in the sidebar on an expanded desktop sidebar, otherwise in the drawer behind the "Modullar" button.
  function placeTree() {
    var t = $('[data-tree]');
    if (!t) return;
    var inSide = mq.matches && !collapsed;
    var slot = $(inSide ? '[data-tree-side]' : '[data-tree-drawer]');
    if (t.parentNode !== slot) slot.appendChild(t);
    root.classList.toggle('tree-in-drawer', !inSide);
    if (inSide && open === 'drawer') close(false);
  }

  // Overlays (More sheet, lesson drawer): one open at a time, focus trapped, Escape / scrim closes, focus returns.
  var open = null, opener = null;
  function overlay(name) { return $('[data-overlay="' + name + '"]'); }
  function focusables(el) {
    return Array.prototype.filter.call(el.querySelectorAll('a[href], button:not([disabled]), [tabindex]:not([tabindex="-1"])'),
      function (n) { return n.offsetParent !== null || n === document.activeElement; });
  }
  function show(name, from) {
    if (open) close(false);
    open = name;
    opener = from || document.activeElement;
    root.classList.add('is-' + name + '-open');
    body.classList.add('has-overlay');
    document.querySelectorAll('[aria-controls="' + overlay(name).id + '"]').forEach(function (b) { b.setAttribute('aria-expanded', 'true'); });
    var first = focusables(overlay(name))[0];
    if (first) setTimeout(function () { first.focus(); }, 30); // after visibility flips
  }
  function close(restore) {
    if (!open) return;
    var el = overlay(open);
    root.classList.remove('is-' + open + '-open');
    body.classList.remove('has-overlay');
    el.style.transform = '';
    document.querySelectorAll('[aria-controls="' + el.id + '"]').forEach(function (b) { b.setAttribute('aria-expanded', 'false'); });
    open = null;
    if (restore !== false && opener && opener.focus) opener.focus();
    opener = null;
  }

  document.addEventListener('click', function (e) {
    var t = e.target;
    var sheetBtn = t.closest('[data-sheet-open]');
    if (sheetBtn) { open === 'sheet' ? close() : show('sheet', sheetBtn); return; }
    var drawerBtn = t.closest('[data-drawer-open]');
    if (drawerBtn) { show('drawer', drawerBtn); return; }
    if (t.closest('[data-drawer-close]')) { close(); return; }
    var scrim = t.closest('[data-scrim]');
    if (scrim) { close(); return; }
    // following a link inside an overlay (e.g. picking a lesson): close without pulling focus back
    if (open && t.closest('a[href]') && overlay(open).contains(t)) close(false);
  });

  document.addEventListener('keydown', function (e) {
    if (!open) return;
    if (e.key === 'Escape') { e.preventDefault(); close(); return; }
    if (e.key !== 'Tab') return;
    var items = focusables(overlay(open));
    if (!items.length) return;
    var first = items[0], last = items[items.length - 1];
    if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
    else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
    else if (!overlay(open).contains(document.activeElement)) { e.preventDefault(); first.focus(); }
  });

  // Swipe the More sheet down to close it (touch and pen; a short drag snaps back).
  (function () {
    var el = overlay('sheet'), startY = null, dy = 0, id = null;
    el.addEventListener('pointerdown', function (e) {
      if (e.pointerType === 'mouse' || open !== 'sheet') return;
      startY = e.clientY; dy = 0; id = e.pointerId;
    });
    el.addEventListener('pointermove', function (e) {
      if (startY === null || e.pointerId !== id) return;
      dy = Math.max(0, e.clientY - startY);
      if (dy > 6) { el.classList.add('is-dragging'); el.style.transform = 'translateY(' + dy + 'px)'; }
    });
    function end() {
      if (startY === null) return;
      el.classList.remove('is-dragging');
      if (dy > 70) close(); else el.style.transform = '';
      startY = null; dy = 0; id = null;
    }
    el.addEventListener('pointerup', end);
    el.addEventListener('pointercancel', end);
  })();

  mq.addEventListener('change', function () {
    if (mq.matches && open === 'sheet') close(false);
    placeTree();
  });

  setCollapsed(collapsed);
})();
