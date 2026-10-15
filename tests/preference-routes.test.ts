import { beforeEach, describe, it, expect } from "vitest";
import type {
  PreferenceRepository,
  PreferenceRecord,
} from "@/application/ports/preference-repository";
import type { PersonalPreferences } from "@/domain/preferences/preference-rules";
import { AppError } from "@/domain/errors/app-error";
import {
  getPreferencesHandler,
  putPreferencesHandler,
  putBrandPreferencesHandler,
} from "@/presentation/api/preference-routes";
import {
  getPreferences,
  savePreferences,
  saveBrandPreferences,
} from "@/application/preferences/preference-use-cases";
import policy from "@/config/onboarding-policy.json";
import {
  makeWorld,
  jsonRequest,
  ALICE_ID,
  BOB_ID,
  VALID_ENV,
  type TestWorld,
} from "./support/fakes";

class Drafts implements PreferenceRepository {
  rows = new Map<string, PreferenceRecord>();
  async get(userId: string) {
    return this.rows.get(userId) ?? null;
  }
  async save(userId: string, expectedRevision: number, settings: PersonalPreferences) {
    const current = this.rows.get(userId);
    if ((current?.revision ?? 0) !== expectedRevision) throw new AppError("CONFLICT", "stale");
    const next = { userId, settings, revision: expectedRevision + 1 };
    this.rows.set(userId, next);
    return next;
  }
}
let world: TestWorld;
let preferences: Drafts;
const settings = { timezone: "Europe/London", availability: [], weeklyAvailability: [] };
const brandSettings = {
  topic: "Security",
  audience: "Developers",
  tone: "Clear",
  platforms: ["youtube"],
  targets: { videos: 2 },
  weeklyTargets: [],
};
const principal = {
  userId: ALICE_ID,
  accountStatus: "approved" as const,
  isOwner: false,
  mfaVerified: false,
};
beforeEach(() => {
  preferences = new Drafts();
  world = makeWorld(VALID_ENV, { preferences });
  world.access.add(ALICE_ID, "approved");
  world.access.add(BOB_ID, "approved");
  world.identity.signIn(ALICE_ID);
});
const put = (revision: number, value: unknown, origin?: string | null) =>
  putPreferencesHandler(() => world.container)(
    jsonRequest("/api/v1/preferences", {
      method: "PUT",
      body: { expectedRevision: revision, settings: value },
      origin,
    }),
  );

describe("onboarding access and draft persistence", () => {
  it("saves partial drafts and resumes only the current user's settings", async () => {
    expect((await put(0, settings)).status).toBe(200);
    const result = await getPreferencesHandler(() => world.container)(
      jsonRequest("/api/v1/preferences"),
    );
    expect((await result.json()).preferences).toMatchObject({ revision: 1, settings });
    world.identity.signIn(BOB_ID);
    const other = await getPreferencesHandler(() => world.container)(
      jsonRequest("/api/v1/preferences"),
    );
    expect((await other.json()).preferences).toBeNull();
  });
  it("does not overwrite a newer draft under concurrent saves", async () => {
    const responses = await Promise.all([
      put(0, settings),
      put(0, { ...settings, timezone: "UTC" }),
    ]);
    expect(responses.map((r) => r.status).sort()).toEqual([200, 409]);
    expect((await put(1, { ...settings, timezone: "UTC" })).status).toBe(200);
    expect((await put(1, settings)).status).toBe(409);
  });
  it("rejects invalid timezone, revisions, settings size, unknown fields and malformed input", async () => {
    expect((await put(0, { ...settings, timezone: "invalid" })).status).toBe(400);
    expect((await put(-1, settings)).status).toBe(400);
    expect((await put(0, { ...settings, userId: BOB_ID })).status).toBe(400);
    await expect(
      savePreferences(
        { preferences, policy: { ...policy, maxSettingsBytes: 1 } },
        principal,
        0,
        settings,
      ),
    ).rejects.toMatchObject({ code: "INVALID_REQUEST" });
    await expect(
      savePreferences({ preferences, policy }, principal, Number.NaN, settings),
    ).rejects.toMatchObject({ code: "INVALID_REQUEST" });
  });
  it("requires approved access and a same-origin mutation", async () => {
    expect((await put(0, settings, "https://evil.example")).status).toBe(403);
    expect((await put(0, settings, null)).status).toBe(403);
    world.access.add(ALICE_ID, "suspended");
    expect((await put(0, settings)).status).toBe(403);
    await expect(getPreferences({ preferences, policy }, null)).rejects.toMatchObject({
      code: "UNAUTHENTICATED",
    });
    world.identity.current = null;
    expect((await put(0, settings)).status).toBe(401);
    expect(preferences.rows.size).toBe(0);
  });
  it("preserves unrelated brand fields, uses brand revisions and rejects foreign brand IDs", async () => {
    const ws = await world.workspaces.createInitialWorkspace("Studio");
    const brand = await world.workspaces.createBrand(ws, {
      name: "First",
      profile: { legacy: "keep" },
      targets: { legacy: 3 },
    });
    const ctx = { params: Promise.resolve({ workspaceId: ws, brandId: brand.id }) };
    const handler = putBrandPreferencesHandler(() => world.container);
    const req = (revision: number, value: unknown) =>
      jsonRequest("/api/v1/brand/preferences", {
        method: "PUT",
        body: { expectedRevision: revision, settings: value },
      });
    expect((await handler(req(1, brandSettings), ctx)).status).toBe(200);
    const updated = world.workspaces.brands.get(brand.id)!;
    expect(updated.profile).toMatchObject({
      legacy: "keep",
      onboarding: { audience: "Developers" },
    });
    expect(updated.targets).toMatchObject({ legacy: 3, onboarding: { videos: 2 } });
    expect((await handler(req(1, brandSettings), ctx)).status).toBe(409);
    expect((await handler(req(2, { ...brandSettings, targets: { videos: -1 } }), ctx)).status).toBe(
      400,
    );
    expect((await handler(req(0, brandSettings), ctx)).status).toBe(400);
    await expect(
      saveBrandPreferences(
        {
          workspaces: world.workspaces,
          logger: world.container.logger,
          limits: world.container.config.ok
            ? world.container.config.config.limits
            : (() => {
                throw new Error("config");
              })(),
        },
        policy,
        principal,
        ws,
        brand.id,
        0,
        brandSettings,
      ),
    ).rejects.toMatchObject({ code: "INVALID_REQUEST" });
    world.identity.signIn(BOB_ID);
    expect((await handler(req(2, brandSettings), ctx)).status).toBe(404);
    expect(
      (
        await handler(req(2, brandSettings), {
          params: Promise.resolve({ workspaceId: "bad", brandId: brand.id }),
        })
      ).status,
    ).toBe(404);
  });
});

// Compile-time regression: the framework-facing context must not be optional.
it("exports a required framework context while supporting one-argument unit calls", () => {
  const handler = getPreferencesHandler(() => world.container);
  type OptionalContext = undefined extends Parameters<typeof handler>[1] ? true : false;
  const contextIsOptional: OptionalContext = false;
  expect(contextIsOptional).toBe(false);
  expect(typeof handler).toBe("function");
});
