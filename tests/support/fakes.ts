import type {
  AccessRepository,
  AccountRecord,
  ReviewInput,
} from "@/application/ports/access-repository";
import type { AuthSessionService } from "@/application/ports/auth-session";
import type { Identity, IdentityProvider } from "@/application/ports/identity";
import { nextAccountStatus, type AccountStatus } from "@/domain/access/account-status";
import { AppError } from "@/domain/errors/app-error";
import {
  createContainer,
  type AdapterOverrides,
  type Container,
} from "@/infrastructure/composition";

export const VALID_ENV = {
  APP_NAME: "Test App",
  APP_URL: "https://app.example.test",
  NEXT_PUBLIC_SUPABASE_URL: "http://localhost:54321",
  NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: "publishable-placeholder",
  SUPABASE_SECRET_KEY: "canary-supabase-secret-7f3a",
};

export const OWNER_ID = "11111111-1111-4111-8111-111111111111";
export const ALICE_ID = "22222222-2222-4222-8222-222222222222";
export const BOB_ID = "33333333-3333-4333-8333-333333333333";

export class FakeAccess implements AccessRepository {
  accounts = new Map<string, AccountRecord>();
  owners = new Set<string>();
  ensured: string[] = [];
  reviews: ReviewInput[] = [];

  add(userId: string, status: AccountStatus, revision = 1): void {
    this.accounts.set(userId, {
      userId,
      email: `${userId.slice(0, 4)}@example.test`,
      displayName: null,
      status,
      revision,
      createdAt: "2026-01-01T00:00:00.000Z",
      reviewedAt: null,
    });
  }
  async getAccount(userId: string) {
    return this.accounts.get(userId) ?? null;
  }
  async isOwner(userId: string) {
    return this.owners.has(userId);
  }
  async ensureAccount(userId: string) {
    this.ensured.push(userId);
    if (!this.accounts.has(userId)) this.add(userId, "pending");
  }
  async listAccounts(query: { status: AccountStatus | null; limit: number }) {
    const items = [...this.accounts.values()].filter(
      (a) => !query.status || a.status === query.status,
    );
    return { items: items.slice(0, query.limit), nextCursor: null };
  }
  async review(input: ReviewInput) {
    if (!this.owners.has(input.actorId)) throw new AppError("FORBIDDEN", "no");
    const target = this.accounts.get(input.targetId);
    if (!target) throw new AppError("NOT_FOUND", "no");
    if (target.revision !== input.expectedRevision) throw new AppError("CONFLICT", "stale");
    const next = nextAccountStatus(target.status, input.decision);
    if (!next) throw new AppError("CONFLICT", "transition");
    this.reviews.push(input);
    target.status = next;
    target.revision += 1;
    return { status: next, revision: target.revision };
  }
}

export class FakeIdentity implements IdentityProvider {
  current: Identity | null = null;
  signIn(userId: string, aal: Identity["aal"] = "aal1"): void {
    this.current = { userId, email: null, aal };
  }
  async getIdentity() {
    return this.current;
  }
}

export function fakeSession(overrides: Partial<AuthSessionService> = {}): AuthSessionService {
  return {
    startGoogleSignIn: async () => "https://accounts.example.test/auth",
    completeSignIn: async () => ({ userId: ALICE_ID, emailVerified: true }),
    signOut: async () => undefined,
    getMfaState: async () => ({ verifiedFactorId: null }),
    enrollTotp: async () => ({ factorId: "f", qrCodeDataUri: "data:", secret: "s" }),
    verifyTotp: async () => true,
    ...overrides,
  };
}

export interface TestWorld {
  container: Container;
  access: FakeAccess;
  identity: FakeIdentity;
}

/** A container wired to in-memory fakes, with one approved owner already present. */
export function makeWorld(
  env: Record<string, string | undefined> = VALID_ENV,
  extra: AdapterOverrides = {},
): TestWorld {
  const access = new FakeAccess();
  const identity = new FakeIdentity();
  access.owners.add(OWNER_ID);
  access.add(OWNER_ID, "approved");
  const container = createContainer(env, { access, identity, session: fakeSession(), ...extra });
  return { container, access, identity };
}

export const jsonRequest = (
  path: string,
  init: { method?: string; body?: unknown; origin?: string | null } = {},
): Request => {
  const headers: Record<string, string> = { "content-type": "application/json" };
  if (init.origin !== null) headers.origin = init.origin ?? VALID_ENV.APP_URL;
  return new Request(`${VALID_ENV.APP_URL}${path}`, {
    method: init.method ?? "GET",
    headers,
    ...(init.body !== undefined ? { body: JSON.stringify(init.body) } : {}),
  });
};
