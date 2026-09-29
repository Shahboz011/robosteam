// Public Supabase settings (Project Settings -> API in the Supabase dashboard).
// Only the anon / publishable key belongs here. NEVER put the service_role (secret) key in any frontend file.
// Security comes from Row Level Security in supabase/schema.sql, not from hiding this key.
window.ROBOSTEAM_CONFIG = {
  SUPABASE_URL: 'https://sxzkacrtrdlxmgvvxsgv.supabase.co',
  SUPABASE_ANON_KEY: 'sb_publishable_6eWgEEdymBOsaDnQh2njMw_rmhUO5Ug',
  // Simulator: where sketches are compiled (the hosted compile-service, e.g. 'https://robosteam-compile.onrender.com').
  // Empty = this site's own /api/compile, i.e. local dev with `cd compile-service && npm start`.
  // On localhost it is ignored (local /api/compile). If you change it, update connect-src in simulator.html's CSP too.
  COMPILE_URL: 'https://robosteam-compile.onrender.com',
};
