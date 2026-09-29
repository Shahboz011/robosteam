// Copy this file to js/config.js and fill in your project's values
// (Supabase dashboard -> Project Settings -> API Keys).
// Only the PUBLISHABLE key (sb_publishable_...) or the legacy anon key belongs here.
// NEVER put a secret key (sb_secret_...) or the service_role key in any frontend file.
window.ROBOSTEAM_CONFIG = {
  SUPABASE_URL: 'https://YOUR-PROJECT-REF.supabase.co',
  SUPABASE_ANON_KEY: 'YOUR-PUBLISHABLE-KEY',
  // Simulator compile service, e.g. 'https://robosteam-compile.onrender.com'. Empty = same-origin /api/compile
  // (local dev). If set, add its origin to connect-src in simulator.html's Content-Security-Policy.
  COMPILE_URL: '',
};
