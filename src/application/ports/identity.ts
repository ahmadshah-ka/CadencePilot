/** A verified session identity. Produced only by the auth provider adapter, never from client input. */
export interface Identity {
  userId: string;
  email: string | null;
  /** Authenticator assurance level of the current session. */
  aal: "aal1" | "aal2";
}

/** Resolves the caller from the current request's session. */
export interface IdentityProvider {
  /** Returns null when there is no valid session (missing, expired or forged). */
  getIdentity(): Promise<Identity | null>;
}
