export interface SignedInUser {
  userId: string;
  /** True only when the provider verified the email address. */
  emailVerified: boolean;
}

export interface TotpEnrollment {
  factorId: string;
  /** SVG markup as a data URI, safe to use as an <img> source. */
  qrCodeDataUri: string;
  /** Manual-entry secret shown once during enrollment. Never log it. */
  secret: string;
}

export interface MfaState {
  /** A verified TOTP factor the user can use to elevate the session, or null if none. */
  verifiedFactorId: string | null;
}

/** Session-changing operations of the identity provider. */
export interface AuthSessionService {
  /** Starts Google OAuth with PKCE and returns the provider URL to redirect to. */
  startGoogleSignIn(redirectTo: string): Promise<string>;
  /** Exchanges an OAuth callback code (PKCE) for a session; null if invalid or expired. */
  completeSignIn(code: string): Promise<SignedInUser | null>;
  /** Ends the current session and clears its cookies. */
  signOut(): Promise<void>;
  getMfaState(): Promise<MfaState>;
  enrollTotp(): Promise<TotpEnrollment>;
  /** Verifies a TOTP code, elevating the session to aal2. Returns false for a wrong code. */
  verifyTotp(factorId: string, code: string): Promise<boolean>;
}
