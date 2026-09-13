import { createClient } from '@supabase/supabase-js';
import WebSocket from 'ws';

// Singleton pattern: reuse the same client across the app (same reasoning as
// src/prisma/client.ts — ts-node-dev hot-reloads would otherwise create
// multiple clients). Uses the service role key: this client only ever runs
// server-side (never sent to a client) to upload/delete objects in Storage.
const globalForSupabase = globalThis as unknown as { supabase: ReturnType<typeof createClient> };

export const supabase =
  globalForSupabase.supabase ??
  createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, {
    auth: { autoRefreshToken: false, persistSession: false },
    // We only ever use Storage, never Realtime — but the SDK's constructor
    // still eagerly resolves a WebSocket constructor for its (unused)
    // Realtime client, which throws on Node < 22 (no native WebSocket).
    // Providing `ws` explicitly avoids that, without bumping the Node version.
    realtime: { transport: WebSocket as unknown as never },
  });

if (process.env.NODE_ENV !== 'production') {
  globalForSupabase.supabase = supabase;
}
