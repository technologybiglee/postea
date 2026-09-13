import { createClient } from '@supabase/supabase-js';

// Singleton pattern: reuse the same client across the app (same reasoning as
// src/prisma/client.ts — ts-node-dev hot-reloads would otherwise create
// multiple clients). Uses the service role key: this client only ever runs
// server-side (never sent to a client) to upload/delete objects in Storage.
const globalForSupabase = globalThis as unknown as { supabase: ReturnType<typeof createClient> };

export const supabase =
  globalForSupabase.supabase ??
  createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

if (process.env.NODE_ENV !== 'production') {
  globalForSupabase.supabase = supabase;
}
