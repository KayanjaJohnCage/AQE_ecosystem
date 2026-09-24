import { createClient, type SupabaseClient } from "@supabase/supabase-js";

export function createServerSupabaseClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceRole = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!url || !serviceRole) {
    if (process.env.NODE_ENV === "production") {
      throw new Error("Production Supabase server configuration is missing.");
    }
    return null;
  }

  return createClient(url, serviceRole, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
      detectSessionInUrl: false,
    },
  }) as SupabaseClient;
}

export function createAnonSupabaseClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  if (!url || !anonKey) {
    if (process.env.NODE_ENV === "production") {
      throw new Error("Production Supabase public configuration is missing.");
    }
    return null;
  }

  return createClient(url, anonKey, {
    auth: {
      persistSession: true,
      autoRefreshToken: true,
    },
  }) as SupabaseClient;
}
