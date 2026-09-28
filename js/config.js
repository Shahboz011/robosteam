// Public Supabase settings (Project Settings -> API in the Supabase dashboard).
// Only the anon / publishable key belongs here. NEVER put the service_role (secret) key in any frontend file.
// Security comes from Row Level Security in supabase/schema.sql, not from hiding this key.
window.ROBOSTEAM_CONFIG = {
  SUPABASE_URL: 'https://sxzkacrtrdlxmgvvxsgv.supabase.co',
  SUPABASE_ANON_KEY: 'sb_publishable_6eWgEEdymBOsaDnQh2njMw_rmhUO5Ug',
};
