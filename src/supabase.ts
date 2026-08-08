import { createClient, SupabaseClient } from '@supabase/supabase-js';
import { config } from './config';

// Cliente con service role (acceso admin, solo server-side).
export const supabase: SupabaseClient = createClient(
  config.supabaseUrl,
  config.supabaseServiceRoleKey,
  { auth: { persistSession: false } }
);
