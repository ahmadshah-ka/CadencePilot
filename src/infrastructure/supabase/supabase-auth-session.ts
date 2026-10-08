import type {
  AuthSessionService,
  MfaState,
  SignedInUser,
  TotpEnrollment,
} from "@/application/ports/auth-session";
import { AppError } from "@/domain/errors/app-error";
import { createUserClient, type SupabaseSettings } from "./clients";

const UNAVAILABLE = () =>
  new AppError("DEPENDENCY_UNAVAILABLE", "The service is temporarily unavailable.");
const TOTP = "totp" as const;

export function createSupabaseAuthSession(settings: SupabaseSettings): AuthSessionService {
  return {
    async startGoogleSignIn(redirectTo) {
      const supabase = await createUserClient(settings);
      // skipBrowserRedirect: the server action performs the redirect; the PKCE verifier cookie is
      // set by the client above.
      const { data, error } = await supabase.auth.signInWithOAuth({
        provider: "google",
        options: { redirectTo, skipBrowserRedirect: true },
      });
      if (error || !data.url) throw UNAVAILABLE();
      return data.url;
    },

    async completeSignIn(code): Promise<SignedInUser | null> {
      const supabase = await createUserClient(settings);
      const { data, error } = await supabase.auth.exchangeCodeForSession(code);
      if (error || !data.user) return null;
      return { userId: data.user.id, emailVerified: Boolean(data.user.email_confirmed_at) };
    },

    async signOut() {
      const supabase = await createUserClient(settings);
      await supabase.auth.signOut();
    },

    async getMfaState(): Promise<MfaState> {
      const supabase = await createUserClient(settings);
      const { data, error } = await supabase.auth.mfa.listFactors();
      if (error) throw UNAVAILABLE();
      return { verifiedFactorId: data.totp[0]?.id ?? null };
    },

    async enrollTotp(): Promise<TotpEnrollment> {
      const supabase = await createUserClient(settings);
      const { data, error } = await supabase.auth.mfa.enroll({ factorType: TOTP });
      if (error || !data) throw UNAVAILABLE();
      return {
        factorId: data.id,
        qrCodeDataUri: data.totp.qr_code,
        secret: data.totp.secret,
      };
    },

    async verifyTotp(factorId, code) {
      const supabase = await createUserClient(settings);
      const { error } = await supabase.auth.mfa.challengeAndVerify({ factorId, code });
      return !error;
    },
  };
}
