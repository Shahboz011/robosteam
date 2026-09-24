/* RoboSTEAM auth: nav state, route guards and the auth pages.
   <body data-page="home|register|login|forgot|reset|dashboard"> selects what runs.
   Every user-facing string is in T, so translating means editing this one object. */
(function () {
  'use strict';

  var T = {
    notConfigured: "Kirish tizimi hali sozlanmagan. Keyinroq qayta urinib ko'ring.",
    busy: 'Kuting…',
    show: "Ko'rsatish",
    hide: 'Yashirish',
    showLabel: "Parolni ko'rsatish",
    hideLabel: 'Parolni yashirish',
    // client-side checks
    required: "Bu maydonni to'ldiring.",
    nameShort: "Ismingizni to'liq kiriting (kamida 2 ta harf).",
    emailBad: "Email manzilni to'g'ri kiriting, masalan: ism@example.com.",
    pwShort: "Parol kamida 8 ta belgidan iborat bo'lsin.",
    pwLong: "Parol juda uzun (ko'pi bilan 72 ta belgi).",
    pwMismatch: 'Parollar bir xil emas.',
    levelPick: 'Darajangizni tanlang.',
    // server errors (raw error text is never shown)
    invalidCredentials: "Email yoki parol noto'g'ri.",
    emailNotConfirmed: 'Email hali tasdiqlanmagan. Pochtangizdagi havolani bosing yoki xatni qayta yuboring.',
    alreadyRegistered: "Bu email bilan hisob allaqachon bor. Kiring yoki parolni tiklang.",
    weakPassword: "Parol juda oddiy. Uzunroq parol tanlang, harf va raqamlarni aralashtiring.",
    samePassword: 'Yangi parol eskisidan farq qilishi kerak.',
    rateLimit: "Juda ko'p urinish bo'ldi. Bir necha daqiqadan so'ng qayta urinib ko'ring.",
    emailInvalid: "Bu email manzil qabul qilinmadi. Boshqa manzilni sinab ko'ring.",
    linkExpired: "Havola eskirgan yoki allaqachon ishlatilgan. Yangisini so'rang.",
    network: "Internet aloqasini tekshiring va qayta urinib ko'ring.",
    generic: "Nimadir xato ketdi. Birozdan so'ng qayta urinib ko'ring.",
    // flows
    resend: 'Xatni qayta yuborish',
    resendIn: 'Qayta yuborish ({s} s)',
    resent: 'Xat qayta yuborildi. Pochtangizni tekshiring.',
    forgotSent: "Agar bu email ro'yxatdan o'tgan bo'lsa, parolni tiklash havolasini yubordik. Pochtangizni tekshiring.",
    signedOut: 'Hisobdan chiqdingiz.',
    passwordUpdated: 'Parol yangilandi.',
    friend: "do'stim",
    levels: { beginner: 'Boshlovchi', 'some-electronics': 'Elektronikani biroz biladi', builder: 'Allaqachon narsalar yasaydi' },
  };

  var LEVELS = ['beginner', 'some-electronics', 'builder']; // must match the check constraint in supabase/schema.sql
  var RESEND_COOLDOWN = 60;                                  // seconds; Supabase rate-limits auth emails
  var sb = window.sb || null;
  var page = document.body.getAttribute('data-page') || '';

  // ---------- helpers ----------
  function $(sel, root) { return (root || document).querySelector(sel); }
  function $$(sel, root) { return Array.prototype.slice.call((root || document).querySelectorAll(sel)); }
  function query() { return new URLSearchParams(location.search); }
  function hash() { return new URLSearchParams(location.hash.replace(/^#/, '')); }
  function abs(path) { return new URL(path, location.href).href; }
  // Error returned in an email link redirect (e.g. #error=access_denied&error_code=otp_expired)
  function linkError() { return hash().get('error_code') || hash().get('error') || query().get('error_code'); }

  // ?next= may only be a plain same-site relative path like "dashboard.html?x=1": letters, digits and ._-/ in the path,
  // no scheme, no leading slash, no "//", no percent-encoding (encoded slashes can turn into //host on some servers).
  function safeNext() {
    var raw = query().get('next');
    if (!raw || raw.length > 200) return null;
    var m = /^([A-Za-z0-9_.\/-]+)(\?[A-Za-z0-9_.=&-]*)?(#[A-Za-z0-9_-]*)?$/.exec(raw);
    if (!m || m[1].charAt(0) === '/' || m[1].indexOf('//') >= 0) return null;
    var url;
    try { url = new URL(raw, location.href); } catch (e) { return null; }
    if (url.origin !== location.origin) return null;
    if (/\/(login|register)\.html$/.test(url.pathname)) return null; // avoid loops
    return url.pathname + url.search + url.hash;
  }

  function mapError(err) {
    if (!err) return T.generic;
    var code = String(err.code || ''), status = Number(err.status) || 0, msg = String(err.message || '');
    if (err.name === 'AuthRetryableFetchError' || err instanceof TypeError || (!status && /fetch|network/i.test(msg))) return T.network;
    if (status === 429 || /rate_limit/.test(code) || /rate limit|too many/i.test(msg)) return T.rateLimit;
    if (code === 'invalid_credentials' || /invalid login credentials/i.test(msg)) return T.invalidCredentials;
    if (code === 'email_not_confirmed' || /email not confirmed/i.test(msg)) return T.emailNotConfirmed;
    if (code === 'user_already_exists' || code === 'email_exists' || /already (been )?registered|already exists/i.test(msg)) return T.alreadyRegistered;
    if (code === 'weak_password' || err.name === 'AuthWeakPasswordError' || /password should|weak password/i.test(msg)) return T.weakPassword;
    if (code === 'same_password' || /should be different/i.test(msg)) return T.samePassword;
    if (code === 'email_address_invalid' || /invalid.*email|email.*invalid/i.test(msg)) return T.emailInvalid;
    if (code === 'otp_expired' || /expired/i.test(msg)) return T.linkExpired;
    return T.generic;
  }
  function isUnconfirmed(err) { return err && (err.code === 'email_not_confirmed' || /email not confirmed/i.test(String(err.message || ''))); }

  function say(el, text, kind) { // kind: error | info | ok
    if (!el) return;
    el.textContent = text || '';
    el.hidden = !text;
    el.className = 'form-msg' + (text ? ' is-' + (kind || 'error') : '');
    el.setAttribute('role', kind === 'error' ? 'alert' : 'status');
  }
  function setBusy(btn, on) {
    if (!btn) return;
    if (on) {
      btn.dataset.label = btn.textContent;
      btn.textContent = T.busy;
      btn.disabled = true;
      btn.setAttribute('aria-busy', 'true');
    } else {
      if (btn.dataset.label) btn.textContent = btn.dataset.label;
      btn.disabled = false;
      btn.removeAttribute('aria-busy');
    }
  }
  function fieldError(input, text) {
    var id = input.id + '-err', p = document.getElementById(id);
    if (!p) {
      p = document.createElement('p');
      p.id = id;
      p.className = 'field-error';
      input.closest('.field').appendChild(p);
      input.setAttribute('aria-describedby', ((input.getAttribute('aria-describedby') || '') + ' ' + id).trim());
    }
    p.textContent = text || '';
    p.hidden = !text;
    if (text) input.setAttribute('aria-invalid', 'true'); else input.removeAttribute('aria-invalid');
  }
  // rules: [[input, fn returning '' or a message], ...]; focuses the first invalid field
  function check(rules) {
    var first = null;
    rules.forEach(function (r) { var m = r[1](); fieldError(r[0], m); if (m && !first) first = r[0]; });
    if (first) first.focus();
    return !first;
  }
  var EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
  function vName(i) { var v = i.value.trim(); return !v ? T.required : v.length < 2 ? T.nameShort : ''; }
  function vEmail(i) { var v = i.value.trim(); return !v ? T.required : EMAIL.test(v) ? '' : T.emailBad; }
  function vNewPw(i) { var v = i.value; return !v ? T.required : v.length < 8 ? T.pwShort : new TextEncoder().encode(v).length > 72 ? T.pwLong : ''; }
  function vFilled(i) { return i.value ? '' : T.required; }
  function vSame(a, b) { return !b.value ? T.required : a.value === b.value ? '' : T.pwMismatch; }

  function showStep(root, name) {
    $$('[data-step]', root).forEach(function (s) { s.hidden = s.getAttribute('data-step') !== name; });
    var h = $('[data-step="' + name + '"] [tabindex="-1"]', root);
    if (h) h.focus();
  }

  function displayName(user, profile) {
    var n = (profile && profile.full_name) || (user && user.user_metadata && user.user_metadata.full_name) || '';
    n = String(n).trim();
    return n || (user && user.email ? user.email.split('@')[0] : '');
  }

  // Resend the signup confirmation email, with a cooldown to stay under Supabase's rate limit.
  function resendButton(btn, msgEl, getEmail) {
    var left = 0, timer = null;
    function tick() {
      if (left <= 0) { clearInterval(timer); timer = null; btn.textContent = T.resend; btn.disabled = false; return; }
      btn.textContent = T.resendIn.replace('{s}', left--);
      btn.disabled = true;
    }
    function cooldown() { left = RESEND_COOLDOWN; tick(); if (!timer) timer = setInterval(tick, 1000); }
    btn.addEventListener('click', async function () {
      if (btn.disabled) return;
      setBusy(btn, true);
      var res;
      try { res = await sb.auth.resend({ type: 'signup', email: getEmail(), options: { emailRedirectTo: abs('dashboard.html') } }); }
      catch (e) { res = { error: e }; }
      setBusy(btn, false);
      if (res.error) { console.warn('[auth]', res.error); say(msgEl, mapError(res.error), 'error'); }
      else { say(msgEl, T.resent, 'ok'); cooldown(); }
    });
    return { cooldown: cooldown };
  }

  // ---------- shared UI ----------
  function initPasswordToggles() {
    $$('[data-pw-toggle]').forEach(function (btn) {
      var input = document.getElementById(btn.getAttribute('aria-controls'));
      btn.addEventListener('click', function () {
        var show = input.type === 'password';
        input.type = show ? 'text' : 'password';
        btn.textContent = show ? T.hide : T.show;
        btn.setAttribute('aria-pressed', String(show));
        btn.setAttribute('aria-label', show ? T.hideLabel : T.showLabel);
      });
    });
  }

  function renderNav(session) {
    var user = session && session.user;
    $$('[data-auth-nav]').forEach(function (nav) {
      $$('[data-guest]', nav).forEach(function (el) { el.hidden = !!user; });
      $$('[data-user]', nav).forEach(function (el) { el.hidden = !user; });
      var name = $('.nav-user', nav);
      if (name && user) { name.textContent = displayName(user); name.title = name.textContent; }
      nav.removeAttribute('data-state');
    });
  }

  function initLogout() {
    $$('[data-logout]').forEach(function (btn) {
      btn.addEventListener('click', async function () {
        if (btn.disabled) return;
        setBusy(btn, true);
        try { await sb.auth.signOut({ scope: 'local' }); } catch (e) { console.warn('[auth]', e); }
        if (page === 'home') { setBusy(btn, false); renderNav(null); }
        else location.replace('login.html?notice=signed-out');
      });
    });
  }

  // ---------- pages ----------
  function register(session) {
    if (session) return location.replace(safeNext() || 'dashboard.html');
    var root = $('.auth-card'), form = $('#register-form'), msg = $('#form-msg'), btn = $('[type=submit]', form);
    var f = { name: $('#full-name'), email: $('#email'), pw: $('#password'), pw2: $('#password2'), level: $('#level') };
    var sentTo = '';
    var prefill = query().get('name');
    if (prefill) f.name.value = prefill.trim().slice(0, 80);
    var resend = resendButton($('#resend-btn'), $('#resend-msg'), function () { return sentTo; });

    form.addEventListener('submit', async function (e) {
      e.preventDefault();
      if (btn.disabled) return;
      say(msg, '');
      var ok = check([
        [f.name, function () { return vName(f.name); }],
        [f.email, function () { return vEmail(f.email); }],
        [f.pw, function () { return vNewPw(f.pw); }],
        [f.pw2, function () { return vSame(f.pw, f.pw2); }],
        [f.level, function () { return LEVELS.indexOf(f.level.value) < 0 ? T.levelPick : ''; }],
      ]);
      if (!ok) return;
      setBusy(btn, true);
      var email = f.email.value.trim();
      try {
        var res = await sb.auth.signUp({
          email: email,
          password: f.pw.value,
          options: { data: { full_name: f.name.value.trim(), level: f.level.value }, emailRedirectTo: abs('dashboard.html') },
        });
        if (res.error) throw res.error;
        var user = res.data && res.data.user;
        // With email confirmation on, Supabase answers an existing address with a user that has no identities.
        if (user && Array.isArray(user.identities) && user.identities.length === 0) { say(msg, T.alreadyRegistered, 'error'); return; }
        if (res.data.session) { location.replace('dashboard.html'); return; } // confirmation turned off
        sentTo = email;
        $('[data-sent-email]').textContent = email;
        f.pw.value = f.pw2.value = '';
        showStep(root, 'sent');
        resend.cooldown();
      } catch (err) {
        console.warn('[auth]', err);
        say(msg, mapError(err), 'error');
      } finally {
        setBusy(btn, false);
      }
    });
  }

  function login(session) {
    if (session) return location.replace(safeNext() || 'dashboard.html');
    var form = $('#login-form'), msg = $('#form-msg'), btn = $('[type=submit]', form);
    var email = $('#email'), pw = $('#password'), resendWrap = $('#resend-wrap');
    var notice = query().get('notice');
    if (linkError() || notice === 'link-expired') say(msg, T.linkExpired, 'error');
    else if (notice === 'signed-out') say(msg, T.signedOut, 'info');
    resendButton($('#resend-btn'), msg, function () { return email.value.trim(); });

    form.addEventListener('submit', async function (e) {
      e.preventDefault();
      if (btn.disabled) return;
      say(msg, '');
      resendWrap.hidden = true;
      if (!check([[email, function () { return vEmail(email); }], [pw, function () { return vFilled(pw); }]])) return;
      setBusy(btn, true);
      try {
        var res = await sb.auth.signInWithPassword({ email: email.value.trim(), password: pw.value });
        if (res.error) throw res.error;
        location.replace(safeNext() || 'dashboard.html');
      } catch (err) {
        console.warn('[auth]', err);
        say(msg, mapError(err), 'error');
        if (isUnconfirmed(err)) resendWrap.hidden = false;
        setBusy(btn, false);
      }
    });
  }

  function forgot() {
    var form = $('#forgot-form'), msg = $('#form-msg'), btn = $('[type=submit]', form), email = $('#email');
    form.addEventListener('submit', async function (e) {
      e.preventDefault();
      if (btn.disabled) return;
      say(msg, '');
      if (!check([[email, function () { return vEmail(email); }]])) return;
      setBusy(btn, true);
      try {
        var res = await sb.auth.resetPasswordForEmail(email.value.trim(), { redirectTo: abs('reset-password.html') });
        if (res.error) throw res.error;
        // Same message whether or not the address exists, so the form can't be used to probe for accounts.
        say(msg, T.forgotSent, 'ok');
        setBusy(btn, false);
        btn.disabled = true;
        setTimeout(function () { btn.disabled = false; }, RESEND_COOLDOWN * 1000);
      } catch (err) {
        console.warn('[auth]', err);
        say(msg, mapError(err), 'error');
        setBusy(btn, false);
      }
    });
  }

  function reset(session) {
    var root = $('.auth-card'), form = $('#reset-form'), msg = $('#form-msg'), btn = $('[type=submit]', form);
    var pw = $('#password'), pw2 = $('#password2');
    // The recovery link signs the user in (PASSWORD_RECOVERY). No session means the link is missing, used or expired.
    if (!session) {
      $('#invalid-msg').textContent = T.linkExpired;
      return showStep(root, 'invalid');
    }
    showStep(root, 'form');
    form.addEventListener('submit', async function (e) {
      e.preventDefault();
      if (btn.disabled) return;
      say(msg, '');
      if (!check([[pw, function () { return vNewPw(pw); }], [pw2, function () { return vSame(pw, pw2); }]])) return;
      setBusy(btn, true);
      try {
        var res = await sb.auth.updateUser({ password: pw.value });
        if (res.error) throw res.error;
        pw.value = pw2.value = '';
        showStep(root, 'done');
      } catch (err) {
        console.warn('[auth]', err);
        say(msg, mapError(err), 'error');
      } finally {
        setBusy(btn, false);
      }
    });
  }

  async function dashboard(session) {
    if (!session) {
      location.replace(linkError() ? 'login.html?notice=link-expired' : 'login.html?next=' + encodeURIComponent('dashboard.html'));
      return;
    }
    var user = session.user, nameEl = $('[data-user-name]'), levelEl = $('[data-user-level]');
    function show(profile) {
      nameEl.textContent = displayName(user, profile) || T.friend;
      var level = (profile && profile.level) || (user.user_metadata && user.user_metadata.level);
      levelEl.textContent = T.levels[level] || '—';
    }
    show(null);
    document.body.removeAttribute('data-guard');
    // Profile row; RLS only lets the user read their own row.
    try {
      var res = await sb.from('profiles').select('full_name, level').eq('id', user.id).maybeSingle();
      if (res.error) throw res.error;
      if (res.data) show(res.data);
    } catch (err) { console.warn('[auth] profile', err); }
  }

  // ---------- start ----------
  initPasswordToggles();

  if (!sb) {
    renderNav(null);
    $$('form[data-auth-form]').forEach(function (form) {
      say($('.form-msg', form), T.notConfigured, 'error');
      $$('button, input, select', form).forEach(function (el) { el.disabled = true; });
    });
    if (page === 'reset') { $('#invalid-msg').textContent = T.notConfigured; showStep($('.auth-card'), 'invalid'); }
    if (page === 'dashboard') location.replace('login.html');
    return;
  }

  initLogout();
  sb.auth.onAuthStateChange(function (event, session) {
    // Keep this callback synchronous: awaiting other supabase calls in here can deadlock the client.
    renderNav(session);
    if (event === 'SIGNED_OUT' && page === 'dashboard') location.replace('login.html?notice=signed-out');
    if (event === 'PASSWORD_RECOVERY' && page === 'reset') showStep($('.auth-card'), 'form');
  });

  var pages = { register: register, login: login, forgot: forgot, reset: reset, dashboard: dashboard };
  // getSession waits for supabase-js to finish reading the URL (email links) and local storage.
  sb.auth.getSession().then(function (res) {
    var session = res && res.data ? res.data.session : null;
    // supabase-js strips the tokens from email links but can leave a bare "#" behind
    if (!location.hash && /#$/.test(location.href)) history.replaceState(null, '', location.pathname + location.search);
    renderNav(session);
    if (pages[page]) pages[page](session);
  }, function (err) {
    console.warn('[auth]', err);
    renderNav(null);
    if (pages[page]) pages[page](null);
  });
})();
