import "server-only";
import { createServerClient } from "@supabase/ssr";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { cookies } from "next/headers";

export interface SupabaseSettings {
  url: string;
  publishableKey: string;
  secretKey?: string;
  /** Mark session cookies Secure outside local development. */
  secureCookies: boolean;
}

/**
 * Supabase client acting as the signed-in user (anon key + session cookies), so row-level security
 * applies. Session cookies are HttpOnly because the browser never talks to Supabase directly;
 * SameSite=Lax (the library default) is kept so the OAuth redirect back to /auth/callback works.
 */
export async function createUserClient(settings: SupabaseSettings): Promise<SupabaseClient> {
  const store = await cookies();
  return createServerClient(settings.url, settings.publishableKey, {
    cookies: {
      getAll: () => store.getAll(),
      setAll: (list) => {
        try {
          for (const { name, value, options } of list) {
            store.set(name, value, { ...options, httpOnly: true, secure: settings.secureCookies });
          }
        } catch {
          // Called from a Server Component, where cookies are read-only; proxy.ts refreshes them.
        }
      },
    },
  });
}

/**
 * Service-role client that bypasses RLS. Only for narrow, audited server operations (owner review,
 * account-record repair). Never expose to the browser; never pass user input as a table name.
 */
export function createServiceClient(settings: SupabaseSettings): SupabaseClient {
  if (!settings.secretKey) throw new Error("service client requested without a secret key");
  return createClient(settings.url, settings.secretKey, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
  });
}
