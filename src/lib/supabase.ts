import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !supabaseAnonKey) {
  console.error('Supabase URL or Anon Key is missing in .env.local');
}

// Client for public reads (Used in pages)
export const supabasePublic = createClient(
  supabaseUrl || '', 
  supabaseAnonKey || ''
);

// Client for administrative writes (Used in API routes)
export const supabaseAdmin = createClient(
  supabaseUrl || '', 
  supabaseServiceKey || ''
);
