import type { Identity, IdentityProvider } from "@/application/ports/identity";
import { createUserClient, type SupabaseSettings } from "./clients";

/**
 * Identity from the Supabase session cookies. getUser() revalidates the token with the auth
 * server, so an expired, revoked or forged cookie yields null.
 */
export function createSupabaseIdentityProvider(settings: SupabaseSettings): IdentityProvider {
  return {
    async getIdentity(): Promise<Identity | null> {
      const supabase = await createUserClient(settings);
      const { data, error } = await supabase.auth.getUser();
      const user = data.user;
      // Only provider-verified email identities are accepted (Google marks them confirmed).
      if (error || !user || !user.email_confirmed_at) return null;

      const assurance = await supabase.auth.mfa.getAuthenticatorAssuranceLevel();
      return {
        userId: user.id,
        email: user.email ?? null,
        aal: assurance.data?.currentLevel === "aal2" ? "aal2" : "aal1",
      };
    },
  };
}
