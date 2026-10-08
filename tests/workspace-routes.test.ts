import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  createBrandHandler,
  currentWorkspaceHandler,
  ensureWorkspaceHandler,
  getBrandHandler,
  listBrandsHandler,
  updateBrandHandler,
} from "@/presentation/api/workspace-routes";
import {
  ALICE_ID,
  BOB_ID,
  OWNER_ID,
  VALID_ENV,
  jsonRequest,
  makeWorld,
  type TestWorld,
} from "./support/fakes";

let world: TestWorld;
let wsA: string;
let wsB: string;

const call = (
  handler: (r: Request, c: { params: Promise<Record<string, string>> }) => Promise<Response>,
  user: string | null,
  path: string,
  init: { method?: string; body?: unknown; origin?: string | null } = {},
  params: Record<string, string> = {},
) => {
  if (user) world.identity.signIn(user);
  else world.identity.current = null;
  return handler(jsonRequest(path, init), { params: Promise.resolve(params) });
};
const ensure = (user: string, name = "Studio") =>
  call(
    ensureWorkspaceHandler(() => world.container),
    user,
    "/api/v1/workspaces",
    { method: "POST", body: { name } },
  );
const create = (user: string | null, ws: string, body: unknown) =>
  call(
    createBrandHandler(() => world.container),
    user,
    `/api/v1/workspaces/${ws}/brands`,
    { method: "POST", body },
    { workspaceId: ws },
  );
const list = (user: string | null, ws: string, query = "") =>
  call(
    listBrandsHandler(() => world.container),
    user,
    `/api/v1/workspaces/${ws}/brands${query}`,
    {},
    { workspaceId: ws },
  );
const get = (user: string | null, ws: string, brand: string) =>
  call(
    getBrandHandler(() => world.container),
    user,
    `/api/v1/workspaces/${ws}/brands/${brand}`,
    {},
    { workspaceId: ws, brandId: brand },
  );
const patch = (user: string | null, ws: string, brand: string, body: unknown) =>
  call(
    updateBrandHandler(() => world.container),
    user,
    `/api/v1/workspaces/${ws}/brands/${brand}`,
    { method: "PATCH", body },
    { workspaceId: ws, brandId: brand },
  );

beforeEach(async () => {
  vi.spyOn(console, "log").mockImplementation(() => undefined);
  vi.spyOn(console, "error").mockImplementation(() => undefined);
  world = makeWorld();
  world.access.add(ALICE_ID, "approved");
  world.access.add(BOB_ID, "approved");
  wsA = (await (await ensure(ALICE_ID, "Alice Studio")).json()).workspace.id;
  wsB = (await (await ensure(BOB_ID, "Bob Studio")).json()).workspace.id;
});
afterEach(() => vi.restoreAllMocks());

describe("workspace onboarding", () => {
  it("is idempotent: repeated and parallel requests yield one workspace", async () => {
    const again = await Promise.all([ensure(ALICE_ID, "Other"), ensure(ALICE_ID, "Third")]);
    for (const res of again) expect((await res.json()).workspace.id).toBe(wsA);
    expect(
      [...world.workspaces.workspaces.values()].filter((w) => w.ownerId === ALICE_ID),
    ).toHaveLength(1);
  });

  it("validates the name and trims it", async () => {
    expect((await ensure(ALICE_ID, "   ")).status).toBe(400);
    expect((await ensure(ALICE_ID, "x".repeat(81))).status).toBe(400);
    const res = await call(
      ensureWorkspaceHandler(() => world.container),
      ALICE_ID,
      "/api/v1/workspaces",
      { method: "POST", body: { name: 5 } },
    );
    expect(res.status).toBe(400);
  });

  it("is closed to anonymous, pending, rejected and suspended accounts", async () => {
    world.access.add("66666666-6666-4666-8666-666666666666", "pending");
    expect(
      (
        await call(
          ensureWorkspaceHandler(() => world.container),
          null,
          "/api/v1/workspaces",
          { method: "POST", body: { name: "x" } },
        )
      ).status,
    ).toBe(401);
    for (const status of ["pending", "rejected", "suspended"] as const) {
      world.access.add(ALICE_ID, status);
      expect((await ensure(ALICE_ID)).status, status).toBe(403);
    }
  });

  it("returns the caller's own workspace as current, or null before onboarding", async () => {
    world.access.add(OWNER_ID, "approved");
    const none = await call(
      currentWorkspaceHandler(() => world.container),
      OWNER_ID,
      "/api/v1/workspaces/current",
    );
    expect((await none.json()).workspace).toBeNull();
    const mine = await call(
      currentWorkspaceHandler(() => world.container),
      ALICE_ID,
      "/api/v1/workspaces/current",
    );
    expect((await mine.json()).workspace.id).toBe(wsA);
  });
});

describe("customer isolation through the API", () => {
  let brandA: string;
  let brandB: string;
  beforeEach(async () => {
    brandA = (await (await create(ALICE_ID, wsA, { name: "Alpha" })).json()).brand.id;
    brandB = (await (await create(BOB_ID, wsB, { name: "Beta" })).json()).brand.id;
  });

  it("lets each customer see only their own brands", async () => {
    expect(
      (await (await list(ALICE_ID, wsA)).json()).items.map((b: { id: string }) => b.id),
    ).toEqual([brandA]);
    expect((await (await list(BOB_ID, wsB)).json()).items.map((b: { id: string }) => b.id)).toEqual(
      [brandB],
    );
  });

  it("returns 404 for a forged workspace id on list, create, read and update", async () => {
    expect((await list(ALICE_ID, wsB)).status).toBe(404);
    expect((await create(ALICE_ID, wsB, { name: "Plant" })).status).toBe(404);
    expect((await get(ALICE_ID, wsB, brandB)).status).toBe(404);
    expect(
      (await patch(ALICE_ID, wsB, brandB, { expectedRevision: 1, name: "Hijack" })).status,
    ).toBe(404);
    expect(world.workspaces.brands.get(brandB)?.name).toBe("Beta");
  });

  it("returns 404 when a foreign brand id is paired with the caller's own workspace", async () => {
    expect((await get(ALICE_ID, wsA, brandB)).status).toBe(404);
    expect(
      (await patch(ALICE_ID, wsA, brandB, { expectedRevision: 1, name: "Hijack" })).status,
    ).toBe(404);
    expect(world.workspaces.brands.get(brandB)?.name).toBe("Beta");
  });

  it("never lets body fields choose the workspace", async () => {
    const res = await create(ALICE_ID, wsA, { name: "Gamma", workspaceId: wsB, workspace_id: wsB });
    expect(res.status).toBe(201);
    expect((await res.json()).brand.workspaceId).toBe(wsA);
  });

  it("treats malformed ids as not found", async () => {
    expect((await list(ALICE_ID, "not-a-uuid")).status).toBe(404);
    expect((await get(ALICE_ID, wsA, "../../etc")).status).toBe(404);
  });

  it("gives the platform owner no access to customer workspaces", async () => {
    world.identity.signIn(OWNER_ID, "aal2");
    const res = await listBrandsHandler(() => world.container)(
      jsonRequest(`/api/v1/workspaces/${wsA}/brands`),
      {
        params: Promise.resolve({ workspaceId: wsA }),
      },
    );
    expect(res.status).toBe(404);
  });

  it("stops access the moment membership is revoked or the account is suspended", async () => {
    world.workspaces.members.find((m) => m.userId === ALICE_ID)!.revoked = true;
    expect((await list(ALICE_ID, wsA)).status).toBe(404);
    expect((await create(ALICE_ID, wsA, { name: "Late" })).status).toBe(404);
    world.workspaces.members.find((m) => m.userId === ALICE_ID)!.revoked = false;
    expect((await list(ALICE_ID, wsA)).status).toBe(200);
    world.access.add(ALICE_ID, "suspended");
    expect((await list(ALICE_ID, wsA)).status).toBe(403);
  });

  it("blocks anonymous callers and cross-origin mutations", async () => {
    expect((await list(null, wsA)).status).toBe(401);
    const res = await call(
      createBrandHandler(() => world.container),
      ALICE_ID,
      `/api/v1/workspaces/${wsA}/brands`,
      { method: "POST", body: { name: "X" }, origin: "https://evil.example" },
      { workspaceId: wsA },
    );
    expect(res.status).toBe(403);
  });
});

describe("brand lifecycle", () => {
  it("accepts arbitrary names and scoped configuration, normalising whitespace", async () => {
    const res = await create(ALICE_ID, wsA, {
      name: "  Narrative   Doc ",
      profile: { audience: "viewers" },
      targets: { weekly: 3 },
    });
    expect(res.status).toBe(201);
    const { brand } = await res.json();
    expect(brand).toMatchObject({
      name: "Narrative Doc",
      profile: { audience: "viewers" },
      targets: { weekly: 3 },
      revision: 1,
    });
  });

  it("rejects invalid input without writing", async () => {
    const before = world.workspaces.brands.size;
    for (const body of [
      { name: "" },
      { name: "x".repeat(81) },
      { name: "ok", profile: [] },
      { name: "ok", profile: "x" },
      { name: "ok", targets: { blob: "y".repeat(9000) } },
      {},
    ]) {
      expect((await create(ALICE_ID, wsA, body)).status, JSON.stringify(body).slice(0, 40)).toBe(
        400,
      );
    }
    expect(world.workspaces.brands.size).toBe(before);
  });

  it("enforces the per-workspace brand limit and duplicate names", async () => {
    const limited = makeWorld({ ...VALID_ENV, MAX_BRANDS_PER_WORKSPACE: "2" });
    limited.access.add(ALICE_ID, "approved");
    world = limited;
    const ws = (await (await ensure(ALICE_ID)).json()).workspace.id;
    expect((await create(ALICE_ID, ws, { name: "One" })).status).toBe(201);
    expect((await create(ALICE_ID, ws, { name: "one" })).status).toBe(409);
    expect((await create(ALICE_ID, ws, { name: "Two" })).status).toBe(201);
    const over = await create(ALICE_ID, ws, { name: "Three" });
    expect(over.status).toBe(409);
    expect((await over.json()).error.details.reason).toBe("brand_limit");
  });

  it("updates conditionally and reports stale revisions", async () => {
    const id = (await (await create(ALICE_ID, wsA, { name: "Alpha" })).json()).brand.id;
    const ok = await patch(ALICE_ID, wsA, id, { expectedRevision: 1, name: "Alpha 2" });
    expect(ok.status).toBe(200);
    expect((await ok.json()).brand.revision).toBe(2);
    expect((await patch(ALICE_ID, wsA, id, { expectedRevision: 1, name: "Late" })).status).toBe(
      409,
    );
    expect((await patch(ALICE_ID, wsA, id, { expectedRevision: 2 })).status).toBe(400);
    expect((await patch(ALICE_ID, wsA, id, { expectedRevision: 0, name: "x" })).status).toBe(400);
  });

  it("archives instead of deleting, hides archived brands by default and requires restore before edits", async () => {
    const id = (await (await create(ALICE_ID, wsA, { name: "Alpha" })).json()).brand.id;
    expect((await patch(ALICE_ID, wsA, id, { expectedRevision: 1, archived: true })).status).toBe(
      200,
    );
    expect((await (await list(ALICE_ID, wsA)).json()).items).toHaveLength(0);
    expect((await (await list(ALICE_ID, wsA, "?includeArchived=true")).json()).items).toHaveLength(
      1,
    );
    expect((await get(ALICE_ID, wsA, id)).status).toBe(200);
    const edit = await patch(ALICE_ID, wsA, id, { expectedRevision: 2, name: "Renamed" });
    expect(edit.status).toBe(409);
    expect((await edit.json()).error.details.reason).toBe("brand_archived");
    expect((await patch(ALICE_ID, wsA, id, { expectedRevision: 2, archived: false })).status).toBe(
      200,
    );
    expect((await patch(ALICE_ID, wsA, id, { expectedRevision: 3, archived: false })).status).toBe(
      400,
    );
    expect(world.workspaces.brands.has(id)).toBe(true);
  });

  it("handles an empty workspace and invalid query parameters", async () => {
    world.access.add(OWNER_ID, "approved");
    const ownerWs = (await (await ensure(OWNER_ID)).json()).workspace.id;
    expect((await (await list(OWNER_ID, ownerWs)).json()).items).toEqual([]);
    expect((await list(OWNER_ID, ownerWs, "?includeArchived=maybe")).status).toBe(400);
  });
});
