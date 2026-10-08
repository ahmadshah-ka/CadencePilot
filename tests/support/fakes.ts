import type {
  AccessRepository,
  AccountRecord,
  ReviewInput,
} from "@/application/ports/access-repository";
import type { AuthSessionService } from "@/application/ports/auth-session";
import type { Identity, IdentityProvider } from "@/application/ports/identity";
import type {
  BrandPatch,
  BrandRecord,
  WorkspaceRecord,
  WorkspaceRepository,
} from "@/application/ports/workspace-repository";
import type { WorkspaceMembership } from "@/domain/access/access-policy";
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

/**
 * In-memory workspaces that, like row-level security, only ever reveal the signed-in user's own
 * rows. Application-level isolation is tested here; real RLS is tested in tests/db.
 */
export class FakeWorkspaces implements WorkspaceRepository {
  workspaces = new Map<string, WorkspaceRecord & { ownerId: string }>();
  members: Array<{
    workspaceId: string;
    userId: string;
    role: "owner" | "member";
    revoked: boolean;
  }> = [];
  brands = new Map<string, BrandRecord>();
  private seq = 0;
  constructor(private readonly identity: FakeIdentity) {}

  private get me(): string {
    const id = this.identity.current?.userId;
    if (!id) throw new AppError("FORBIDDEN", "no session");
    return id;
  }
  private visible(workspaceId: string): boolean {
    return this.members.some(
      (m) => m.workspaceId === workspaceId && m.userId === this.me && !m.revoked,
    );
  }
  private nextId(): string {
    this.seq += 1;
    return `00000000-0000-4000-8000-${String(this.seq).padStart(12, "0")}`;
  }

  async getMembership(userId: string, workspaceId: string): Promise<WorkspaceMembership | null> {
    const row = this.members.find((m) => m.workspaceId === workspaceId && m.userId === userId);
    // Like RLS, a revoked membership is invisible to the member.
    return row && !row.revoked ? { workspaceId, role: row.role, revoked: false } : null;
  }
  async findOwnWorkspace() {
    const mine = [...this.workspaces.values()].find((w) => this.visible(w.id));
    return mine ? { id: mine.id, name: mine.name, createdAt: mine.createdAt } : null;
  }
  async createInitialWorkspace(name: string) {
    const existing = [...this.workspaces.values()].find((w) => w.ownerId === this.me);
    if (existing) return existing.id;
    const id = this.nextId();
    this.workspaces.set(id, { id, name, createdAt: "2026-01-01T00:00:00.000Z", ownerId: this.me });
    this.members.push({ workspaceId: id, userId: this.me, role: "owner", revoked: false });
    return id;
  }
  async getWorkspace(workspaceId: string) {
    const w = this.workspaces.get(workspaceId);
    return w && this.visible(workspaceId)
      ? { id: w.id, name: w.name, createdAt: w.createdAt }
      : null;
  }
  async listBrands(workspaceId: string, query: { includeArchived: boolean; limit: number }) {
    const items = [...this.brands.values()].filter(
      (b) =>
        b.workspaceId === workspaceId &&
        this.visible(workspaceId) &&
        (query.includeArchived || !b.archivedAt),
    );
    return { items: items.slice(0, query.limit), nextCursor: null };
  }
  async getBrand(workspaceId: string, brandId: string) {
    const b = this.brands.get(brandId);
    return b && b.workspaceId === workspaceId && this.visible(workspaceId) ? b : null;
  }
  async countActiveBrands(workspaceId: string) {
    return [...this.brands.values()].filter((b) => b.workspaceId === workspaceId && !b.archivedAt)
      .length;
  }
  async createBrand(
    workspaceId: string,
    input: { name: string; profile: Record<string, unknown>; targets: Record<string, unknown> },
  ) {
    if (!this.visible(workspaceId)) throw new AppError("FORBIDDEN", "rls");
    const dupe = [...this.brands.values()].some(
      (b) =>
        b.workspaceId === workspaceId &&
        !b.archivedAt &&
        b.name.toLowerCase() === input.name.toLowerCase(),
    );
    if (dupe) throw new AppError("CONFLICT", "dup");
    const id = this.nextId();
    const brand: BrandRecord = {
      id,
      workspaceId,
      ...input,
      revision: 1,
      archivedAt: null,
      createdAt: "t",
      updatedAt: "t",
    };
    this.brands.set(id, brand);
    return brand;
  }
  async updateBrand(
    workspaceId: string,
    brandId: string,
    expectedRevision: number,
    patch: BrandPatch,
  ) {
    const brand = await this.getBrand(workspaceId, brandId);
    if (!brand) throw new AppError("NOT_FOUND", "nf");
    if (brand.revision !== expectedRevision) throw new AppError("CONFLICT", "stale");
    if (patch.name !== undefined) brand.name = patch.name;
    if (patch.profile !== undefined) brand.profile = patch.profile;
    if (patch.targets !== undefined) brand.targets = patch.targets;
    if (patch.archived !== undefined) brand.archivedAt = patch.archived ? "archived" : null;
    brand.revision += 1;
    return brand;
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
  workspaces: FakeWorkspaces;
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
  const workspaces = new FakeWorkspaces(identity);
  access.owners.add(OWNER_ID);
  access.add(OWNER_ID, "approved");
  const container = createContainer(env, {
    access,
    identity,
    workspaces,
    session: fakeSession(),
    ...extra,
  });
  return { container, access, identity, workspaces };
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
