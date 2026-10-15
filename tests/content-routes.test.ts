import { beforeEach, describe, it, expect, vi } from "vitest";
import type {
  ContentRepository,
  ContentDetail,
  ContentScope,
} from "@/application/ports/content-repository";
import { contentHandler, contentDeps } from "@/presentation/api/content-routes";
import { contentCommand, listContent, getContent } from "@/application/content/content-use-cases";
import {
  makeWorld,
  jsonRequest,
  ALICE_ID,
  BOB_ID,
  OWNER_ID,
  VALID_ENV,
  type TestWorld,
} from "./support/fakes";
const CONTENT_ID = "00000000-0000-4000-8000-000000000010",
  FOREIGN_ID = "00000000-0000-4000-8000-000000000011",
  REQUEST_ID = "00000000-0000-4000-8000-000000000012";
let world: TestWorld, scope: ContentScope, detail: ContentDetail, repo: ContentRepository;
const principal = {
  userId: ALICE_ID,
  accountStatus: "approved" as const,
  isOwner: false,
  mfaVerified: false,
};
const create = {
  requestId: REQUEST_ID,
  title: "Episode",
  format: "video",
  parentId: null,
  seriesId: null,
};
beforeEach(async () => {
  repo = {
    list: vi.fn(async () => ({ items: [], nextCursor: null })),
    detail: vi.fn(async () => detail),
    listSeries: vi.fn(async () => ({ items: [], nextCursor: null })),
    create: vi.fn(async () => CONTENT_ID),
    edit: vi.fn(async () => {}),
    archive: vi.fn(async () => {}),
    setTask: vi.fn(async () => {}),
    savePublication: vi.fn(async () => {}),
    createSeries: vi.fn(async () => REQUEST_ID),
    editSeries: vi.fn(async () => {}),
  };
  world = makeWorld(VALID_ENV, { content: repo });
  world.access.add(ALICE_ID, "approved");
  world.access.add(BOB_ID, "approved");
  world.identity.signIn(ALICE_ID);
  const workspaceId = await world.workspaces.createInitialWorkspace("Studio"),
    brand = await world.workspaces.createBrand(workspaceId, {
      name: "Brand",
      profile: {},
      targets: {},
    });
  scope = { workspaceId, brandId: brand.id };
  detail = {
    item: {
      ...scope,
      id: CONTENT_ID,
      parentId: null,
      seriesId: null,
      kind: "original",
      format: "video",
      title: "Episode",
      sourceUrl: "",
      sourceTranscript: "",
      notes: "",
      productionStage: "planned",
      revision: 1,
      archivedAt: null,
      createdAt: "2026-01-01T00:00:00Z",
    },
    tasks: [],
    publications: [],
  };
});
const context = () => ({ params: Promise.resolve({ ...scope, contentId: CONTENT_ID }) });
const post = (action: string, id: string | null, input: unknown, origin?: string | null) =>
  contentHandler("command", () => world.container)(
    jsonRequest("/api/v1/content-commands", {
      method: "POST",
      body: { action, id, input },
      origin,
    }),
    context(),
  );
describe("manual content API and use cases", () => {
  it("creates a manual record and accepts each valid mutation without changing scope", async () => {
    expect((await post("create", null, create)).status).toBe(200);
    expect(repo.create).toHaveBeenCalledWith(scope, create);
    expect(
      (
        await post("edit", CONTENT_ID, {
          expectedRevision: 1,
          title: "Edited",
          sourceUrl: "https://example.test",
          sourceTranscript: "Untimed transcript",
          notes: "Independent draft",
        })
      ).status,
    ).toBe(200);
    expect(
      (await post("task", CONTENT_ID, { expectedRevision: 1, stage: "record", completed: true }))
        .status,
    ).toBe(200);
    expect(
      (await post("archive", CONTENT_ID, { expectedRevision: 1, archived: true })).status,
    ).toBe(200);
    expect(
      (
        await post("publication", CONTENT_ID, {
          expectedRevision: 0,
          platform: "youtube",
          publishedAt: null,
          url: "",
        })
      ).status,
    ).toBe(200);
    expect(
      (await post("create-series", null, { requestId: REQUEST_ID, title: "Series" })).status,
    ).toBe(200);
    expect(
      (
        await post("edit-series", REQUEST_ID, {
          expectedRevision: 1,
          title: "Renamed",
          archived: false,
        })
      ).status,
    ).toBe(200);
  });
  it("supports scoped lists, details and paginated series", async () => {
    for (const kind of ["list", "series", "detail"] as const)
      expect(
        (
          await contentHandler(kind, () => world.container)(
            jsonRequest("/api/v1/content"),
            context(),
          )
        ).status,
      ).toBe(200);
    expect(repo.list).toHaveBeenCalledWith(
      scope,
      expect.objectContaining({ limit: 25, includeArchived: false }),
    );
    expect(
      (
        await contentHandler("list", () => world.container)(
          jsonRequest("/api/v1/content?includeArchived=maybe"),
          context(),
        )
      ).status,
    ).toBe(400);
    expect(
      (
        await contentHandler("detail", () => world.container)(jsonRequest("/api/v1/content"), {
          params: Promise.resolve({ ...scope, contentId: "bad" }),
        })
      ).status,
    ).toBe(404);
    expect(
      (
        await contentHandler("list", () => world.container)(jsonRequest("/api/v1/content"), {
          params: Promise.resolve({ workspaceId: "bad", brandId: scope.brandId }),
        })
      ).status,
    ).toBe(404);
  });
  it("denies foreign workspace/brand access, suspended accounts, owner bypass and CSRF", async () => {
    expect((await post("create", null, create, "https://evil.example")).status).toBe(403);
    expect((await post("create", null, create, null)).status).toBe(403);
    world.identity.signIn(BOB_ID);
    expect((await post("create", null, create)).status).toBe(404);
    world.identity.signIn(OWNER_ID);
    expect((await post("create", null, create)).status).toBe(404);
    world.identity.signIn(ALICE_ID);
    world.access.add(ALICE_ID, "suspended");
    expect((await post("create", null, create)).status).toBe(403);
    world.identity.current = null;
    expect((await post("create", null, create)).status).toBe(401);
    expect(repo.create).not.toHaveBeenCalled();
  });
  it("rejects malformed, future, unsafe and inapplicable mutations before persistence", async () => {
    expect((await post("create", null, { ...create, title: "" })).status).toBe(400);
    expect((await post("create", null, { ...create, title: "x".repeat(40000) })).status).toBe(400);
    expect(
      (
        await post("publication", CONTENT_ID, {
          expectedRevision: 0,
          platform: "youtube",
          publishedAt: "2999-01-01T00:00:00Z",
          url: "",
        })
      ).status,
    ).toBe(400);
    expect(
      (
        await post("edit", CONTENT_ID, {
          expectedRevision: 1,
          title: "X",
          sourceUrl: "javascript:alert(1)",
          sourceTranscript: "",
          notes: "",
        })
      ).status,
    ).toBe(400);
    detail.item.format = "post";
    expect(
      (await post("task", CONTENT_ID, { expectedRevision: 1, stage: "record", completed: true }))
        .status,
    ).toBe(400);
    detail.item.archivedAt = "2026-01-01T00:00:00Z";
    expect(
      (
        await post("edit", CONTENT_ID, {
          expectedRevision: 1,
          title: "X",
          sourceUrl: "",
          sourceTranscript: "",
          notes: "",
        })
      ).status,
    ).toBe(409);
    expect((await post("edit", null, {})).status).toBe(404);
    expect(
      (await post("edit-series", null, { expectedRevision: 1, title: "X", archived: false }))
        .status,
    ).toBe(404);
    expect(repo.savePublication).not.toHaveBeenCalled();
    expect(repo.setTask).not.toHaveBeenCalled();
    expect(repo.edit).not.toHaveBeenCalled();
  });
  it("enforces parent identity even if a provider returns the wrong row", async () => {
    expect((await post("create", null, { ...create, parentId: FOREIGN_ID })).status).toBe(404);
    detail.item.id = FOREIGN_ID;
    detail.item.kind = "derivative";
    expect((await post("create", null, { ...create, parentId: FOREIGN_ID })).status).toBe(409);
    detail.item.kind = "original";
    detail.item.archivedAt = "2026-01-01T00:00:00Z";
    expect((await post("create", null, { ...create, parentId: FOREIGN_ID })).status).toBe(409);
    detail.item.archivedAt = null;
    expect((await post("create", null, { ...create, parentId: FOREIGN_ID })).status).toBe(200);
    detail.item.brandId = REQUEST_ID;
    await expect(
      getContent(contentDeps(world.container), principal, scope, FOREIGN_ID),
    ).rejects.toMatchObject({ code: "NOT_FOUND" });
    vi.mocked(repo.detail).mockResolvedValueOnce(null);
    expect((await post("create", null, { ...create, parentId: FOREIGN_ID })).status).toBe(404);
  });
  it("rejects archived brands, unknown commands, invalid page limits and missing details", async () => {
    const deps = contentDeps(world.container);
    await expect(
      contentCommand(deps, principal, scope, "unknown", CONTENT_ID, {}),
    ).rejects.toMatchObject({ code: "INVALID_REQUEST" });
    await expect(
      listContent(deps, principal, scope, { limit: 0, cursor: null, includeArchived: false }),
    ).rejects.toMatchObject({ code: "INVALID_REQUEST" });
    await expect(
      listContent(deps, principal, scope, { limit: 26, cursor: null, includeArchived: false }),
    ).rejects.toMatchObject({ code: "INVALID_REQUEST" });
    vi.mocked(repo.detail).mockResolvedValueOnce(null);
    await expect(getContent(deps, principal, scope, CONTENT_ID)).rejects.toMatchObject({
      code: "NOT_FOUND",
    });
    world.workspaces.brands.get(scope.brandId)!.archivedAt = "2026-01-01T00:00:00Z";
    expect((await post("create", null, create)).status).toBe(409);
  });
});
