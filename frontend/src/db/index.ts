import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';
import * as schema from './schema';

const client = postgres(process.env.DATABASE_URL!, {
  max: 10,
  idle_timeout: 20,
  connect_timeout: 10,
});
export const db = drizzle(client, { schema });

// Supabase admin client (server only, bypasses RLS)
import { createClient } from '@supabase/supabase-js';

const adminUrl = process.env.VITE_SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
const adminKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

export const supabaseAdmin = (adminUrl && adminKey)
  ? createClient(adminUrl, adminKey, { auth: { autoRefreshToken: false, persistSession: false } })
  : null as any;
