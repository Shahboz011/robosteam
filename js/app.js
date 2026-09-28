/* RoboSTEAM app pages (dashboard, academy, progress, simulator, profile, settings): route guard, the user card in
   the shell (js/shell.js), the dashboard greeting, and the profile and settings forms.
   Lessons and progress data live in js/academy.js. Helpers and auth strings come from js/auth.js (window.RSAuth).
   Every user-facing string is in T. */
(function () {
  'use strict';

  var T = {
    saved: 'Saqlandi!',
    profileLoadError: "Profilni yuklab bo'lmadi. Sahifani yangilab ko'ring.",
    noRow: "Profil topilmadi. Hisobdan chiqib, qayta kiring.",
    noLevel: 'Daraja tanlanmagan',
    currentWrong: "Joriy parol noto'g'ri.",
    signOutAllDone: 'Barcha qurilmalardan chiqildi.',
    dash: '—',
    date: '{y}-yil {d}-{m}',
    months: ['yanvar', 'fevral', 'mart', 'aprel', 'may', 'iyun', 'iyul', 'avgust', 'sentabr', 'oktabr', 'noyabr', 'dekabr'],
  };

  var A = window.RSAuth, sb = window.sb || null;
  var page = document.body.getAttribute('data-page') || '';
  var user = null, profile = null;

  function $(sel, root) { return (root || document).querySelector(sel); }
  function $$(sel, root) { return Array.prototype.slice.call((root || document).querySelectorAll(sel)); }

  function initials(name) {
    var parts = String(name || '').trim().split(/\s+/).filter(Boolean);
    var s = parts.slice(0, 2).map(function (p) { return p.charAt(0); }).join('');
    return (s || '?').toUpperCase();
  }
  function levelLabel(level) { return A.T.levels[level] || T.noLevel; }
  // Built by hand: browsers' Uzbek date formats are incomplete (Chrome prints '2026 M09 1').
  function formatDate(iso) {
    var d = iso ? new Date(iso) : null;
    if (!d || isNaN(d)) return T.dash;
    return T.date.replace('{y}', d.getFullYear()).replace('{d}', d.getDate()).replace('{m}', T.months[d.getMonth()]);
  }

  // User card (sidebar), avatar (top bar) and the dashboard greeting.
  function renderUser() {
    var name = A.displayName(user, profile) || A.T.friend;
    var level = (profile && profile.level) || (user.user_metadata && user.user_metadata.level);
    $$('[data-shell-name]').forEach(function (el) { el.textContent = name; el.title = name; });
    $$('[data-shell-level]').forEach(function (el) { el.textContent = levelLabel(level); });
    $$('[data-shell-initials]').forEach(function (el) { el.textContent = initials(name); });
    $$('[data-user-name]').forEach(function (el) { el.textContent = name; });
  }

  // ---------- profile page ----------
  function profilePage() {
    var form = $('#profile-form'), msg = $('#form-msg'), btn = $('[type=submit]', form);
    var name = $('#full-name'), email = $('#email'), level = $('#level'), since = $('[data-member-since]');
    email.value = user.email || '';

    function fill() {
      name.value = A.displayName(user, profile);
      var lv = (profile && profile.level) || '';
      level.value = A.LEVELS.indexOf(lv) >= 0 ? lv : '';
      since.textContent = formatDate((profile && profile.created_at) || user.created_at);
    }
    fill();

    form.addEventListener('submit', async function (e) {
      e.preventDefault();
      if (btn.disabled) return;
      A.say(msg, '');
      var ok = A.check([
        [name, function () { return A.vName(name); }],
        [level, function () { return A.LEVELS.indexOf(level.value) < 0 ? A.T.levelPick : ''; }],
      ]);
      if (!ok) return;
      A.setBusy(btn, true);
      try {
        // RLS + column grants only allow full_name and level on the user's own row (supabase/schema.sql)
        var res = await sb.from('profiles')
          .update({ full_name: name.value.trim().slice(0, 80), level: level.value })
          .eq('id', user.id)
          .select('full_name, level, created_at');
        if (res.error) throw res.error;
        if (!res.data || !res.data.length) { A.say(msg, T.noRow, 'error'); return; }
        profile = res.data[0];
        fill();
        renderUser();
        A.say(msg, T.saved, 'ok');
      } catch (err) {
        console.warn('[app] profile', err);
        A.say(msg, A.mapError(err), 'error');
      } finally {
        A.setBusy(btn, false);
      }
    });
    return fill;
  }

  // ---------- settings page ----------
  function settingsPage() {
    var form = $('#password-form'), msg = $('#pw-msg'), btn = $('[type=submit]', form);
    var cur = $('#current-password'), pw = $('#password'), pw2 = $('#password2');

    form.addEventListener('submit', async function (e) {
      e.preventDefault();
      if (btn.disabled) return;
      A.say(msg, '');
      var ok = A.check([
        [cur, function () { return A.vFilled(cur); }],
        [pw, function () { return A.vNewPw(pw); }],
        [pw2, function () { return A.vSame(pw, pw2); }],
      ]);
      if (!ok) return;
      A.setBusy(btn, true);
      try {
        // Confirm the current password first, so an unattended signed-in device can't change it.
        var check = await sb.auth.signInWithPassword({ email: user.email, password: cur.value });
        if (check.error) {
          if (check.error.code === 'invalid_credentials' || /invalid login credentials/i.test(String(check.error.message))) {
            A.fieldError(cur, T.currentWrong); cur.focus(); return;
          }
          throw check.error;
        }
        var res = await sb.auth.updateUser({ password: pw.value });
        if (res.error) throw res.error;
        cur.value = pw.value = pw2.value = '';
        A.say(msg, A.T.passwordUpdated, 'ok');
      } catch (err) {
        console.warn('[app] password', err);
        A.say(msg, A.mapError(err), 'error');
      } finally {
        A.setBusy(btn, false);
      }
    });

    var all = $('[data-signout-all]'), allMsg = $('#signout-msg');
    all.addEventListener('click', async function () {
      if (all.disabled) return;
      A.setBusy(all, true);
      try {
        var res = await sb.auth.signOut({ scope: 'global' });
        if (res && res.error) throw res.error;
        location.replace('login.html?notice=signed-out');
      } catch (err) {
        console.warn('[app] sign out all', err);
        A.say(allMsg, A.mapError(err), 'error');
        A.setBusy(all, false);
      }
    });
    // TODO(delete-account): needs a server-side function (Edge Function with the service role) that deletes
    // auth.users for the caller after re-authentication; profiles and lesson_progress go with it (on delete cascade).
  }

  // ---------- start ----------
  function toLogin() {
    var here = location.pathname.split('/').pop() + location.search;
    // an email-confirmation link that failed lands on dashboard.html with #error_code=...
    location.replace(A && A.linkError() ? 'login.html?notice=link-expired' : 'login.html?next=' + encodeURIComponent(here));
  }
  if (!sb || !A) { location.replace('login.html'); return; }

  sb.auth.getSession().then(async function (res) {
    var session = res && res.data ? res.data.session : null;
    if (!session) return toLogin();
    user = session.user;
    renderUser(); // from the session metadata, until the profile row arrives
    var refill = page === 'profile' ? profilePage() : null;
    if (page === 'settings') settingsPage();
    document.body.removeAttribute('data-guard');

    try {
      // RLS only lets the user read their own row
      var r = await sb.from('profiles').select('full_name, level, created_at').eq('id', user.id).maybeSingle();
      if (r.error) throw r.error;
      profile = r.data;
      renderUser();
      if (refill) refill();
    } catch (err) {
      console.warn('[app] profile', err);
      if (page === 'profile') A.say($('#form-msg'), T.profileLoadError, 'error');
    }
  }, function (err) {
    console.warn('[app]', err);
    location.replace('login.html');
  });
})();
