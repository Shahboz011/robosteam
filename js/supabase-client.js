// Creates the single Supabase client as window.sb (null until js/config.js is filled in).
(function () {
  'use strict';
  var cfg = window.ROBOSTEAM_CONFIG || {};
  var url = cfg.SUPABASE_URL || '', key = cfg.SUPABASE_ANON_KEY || '';
  var configured = /^https:\/\/[a-z0-9-]+\.supabase\.co$/i.test(url) && key && !/YOUR-/.test(url + key);

  // Refuse secret keys outright: sb_secret_... or a legacy JWT with role "service_role". They bypass RLS.
  var secret = /^sb_secret_/.test(key);
  try { secret = secret || JSON.parse(atob(key.split('.')[1].replace(/-/g, '+').replace(/_/g, '/'))).role === 'service_role'; } catch (e) {}
  if (secret) {
    console.error('[auth] js/config.js contains a SECRET key. Use the publishable (sb_publishable_...) or anon key, and rotate the secret key in Supabase.');
    window.sb = null;
    return;
  }

  if (!window.supabase || !configured) {
    console.warn('[auth] Supabase is not configured (js/config.js) or supabase-js failed to load.');
    window.sb = null;
    return;
  }
  window.sb = window.supabase.createClient(url, key, {
    auth: {
      persistSession: true,      // supabase-js keeps the session in localStorage; we never store tokens ourselves
      autoRefreshToken: true,
      detectSessionInUrl: true,  // picks up the session from email confirmation / password recovery links
      flowType: 'implicit',      // email links then work even when opened in another browser or device
    },
  });
})();
