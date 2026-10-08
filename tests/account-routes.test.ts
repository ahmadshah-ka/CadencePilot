import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  listAccountsHandler,
  meHandler,
  reviewAccountHandler,
} from "@/presentation/api/account-routes";
import { createRouteHandler, jsonResponse } from "@/presentation/api/route-handler";
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

beforeEach(() => {
  vi.spyOn(console, "log").mockImplementation(() => undefined);
  vi.spyOn(console, "error").mockImplementation(() => undefined);
  world = makeWorld();
  world.access.add(ALICE_ID, "pending");
  world.access.add(BOB_ID, "pending");
});
afterEach(() => vi.restoreAllMocks());

const body = async (response: Response) => response.json();
const reasonOf = async (response: Response) => (await body(response)).error.details?.reason;
const review = (userId: string, payload: unknown, init: { origin?: string | null } = {}) =>
  reviewAccountHandler(() => world.container)(
    jsonRequest(`/api/v1/admin/accounts/${userId}/review`, {
      method: "POST",
      body: payload,
      ...init,
    }),
    { params: Promise.resolve({ userId }) },
  );

describe("GET /api/v1/me (authenticated)", () => {
  it("rejects anonymous callers", async () => {
    const res = await meHandler(() => world.container)(jsonRequest("/api/v1/me"));
    expect(res.status).toBe(401);
  });

  it.each(["pending", "rejected", "suspended"] as const)(
    "shows a %s user their own status",
    async (status) => {
      world.access.add(ALICE_ID, status);
      world.identity.signIn(ALICE_ID);
      const res = await meHandler(() => world.container)(jsonRequest("/api/v1/me"));
      expect(res.status).toBe(200);
      expect(await body(res)).toEqual({
        userId: ALICE_ID,
        status,
        isOwner: false,
        mfaVerified: false,
      });
    },
  );

  it("repairs a missing access record as pending, never approved", async () => {
    world.identity.signIn("44444444-4444-4444-8444-444444444444");
    const res = await meHandler(() => world.container)(jsonRequest("/api/v1/me"));
    expect((await body(res)).status).toBe("pending");
  });

  it("is unavailable, not open, when configuration is invalid", async () => {
    const broken = makeWorld({});
    broken.identity.signIn(ALICE_ID);
    const res = await meHandler(() => broken.container)(jsonRequest("/api/v1/me"));
    expect(res.status).toBe(503);
  });
});

describe("approved-policy routes (what every product API uses)", () => {
  let handled = 0;
  const handle = async ({ traceId }: { traceId: string }) => {
    handled += 1;
    return jsonResponse({ ok: true }, 200, traceId);
  };
  const route = () =>
    createRouteHandler(
      { policy: "approved", handle },
      () => world.container,
    )(jsonRequest("/api/v1/x"));
  beforeEach(() => {
    handled = 0;
  });

  it("blocks anonymous, pending, rejected and suspended callers before the handler runs", async () => {
    expect((await route()).status).toBe(401);
    for (const status of ["pending", "rejected", "suspended"] as const) {
      world.access.add(ALICE_ID, status);
      world.identity.signIn(ALICE_ID);
      const res = await route();
      expect(res.status, status).toBe(403);
      expect(await reasonOf(res)).toBe(`account_${status}`);
    }
    expect(handled).toBe(0);
  });

  it("admits an approved user, and suspension takes effect on the very next request", async () => {
    world.access.add(ALICE_ID, "approved");
    world.identity.signIn(ALICE_ID);
    expect((await route()).status).toBe(200);
    world.access.add(ALICE_ID, "suspended");
    expect((await route()).status).toBe(403);
    expect(handled).toBe(1);
  });

  it("rejects cookie-authenticated mutations from another or missing origin", async () => {
    world.access.add(ALICE_ID, "approved");
    world.identity.signIn(ALICE_ID);
    const post = (origin: string | null) =>
      createRouteHandler(
        { policy: "approved", handle },
        () => world.container,
      )(jsonRequest("/api/v1/x", { method: "POST", body: {}, origin }));
    expect((await post("https://evil.example")).status).toBe(403);
    expect((await post(null)).status).toBe(403);
    expect((await post(VALID_ENV.APP_URL)).status).toBe(200);
  });
});

describe("owner routes", () => {
  const list = () =>
    listAccountsHandler(() => world.container)(
      jsonRequest("/api/v1/admin/accounts?status=pending"),
    );

  it("denies anonymous (401) and non-owner approved users (403)", async () => {
    expect((await list()).status).toBe(401);
    world.access.add(ALICE_ID, "approved");
    world.identity.signIn(ALICE_ID, "aal2");
    const res = await list();
    expect(res.status).toBe(403);
    expect(await reasonOf(res)).toBe("not_owner");
  });

  it("denies a pending user who claims nothing: identity is never taken from the request", async () => {
    world.identity.signIn(ALICE_ID);
    const res = await listAccountsHandler(() => world.container)(
      new Request(`${VALID_ENV.APP_URL}/api/v1/admin/accounts`, {
        headers: { "x-user-id": OWNER_ID, authorization: "Bearer forged", "x-role": "owner" },
      }),
    );
    expect(res.status).toBe(403);
  });

  it("requires MFA from owners when configured", async () => {
    world.identity.signIn(OWNER_ID, "aal1");
    const res = await list();
    expect(res.status).toBe(403);
    expect(await reasonOf(res)).toBe("mfa_required");
  });

  it("lets a verified owner list applicants filtered by status", async () => {
    world.identity.signIn(OWNER_ID, "aal2");
    const res = await list();
    expect(res.status).toBe(200);
    const data = await body(res);
    expect(data.items.map((a: { userId: string }) => a.userId).sort()).toEqual(
      [ALICE_ID, BOB_ID].sort(),
    );
  });

  it("rejects an invalid status filter", async () => {
    world.identity.signIn(OWNER_ID, "aal2");
    const res = await listAccountsHandler(() => world.container)(
      jsonRequest("/api/v1/admin/accounts?status=owner"),
    );
    expect(res.status).toBe(400);
  });

  it("lets an owner skip MFA only when the deployment disables it", async () => {
    const relaxed = makeWorld({ ...VALID_ENV, OWNER_MFA_REQUIRED: "false" });
    relaxed.identity.signIn(OWNER_ID, "aal1");
    const res = await listAccountsHandler(() => relaxed.container)(
      jsonRequest("/api/v1/admin/accounts"),
    );
    expect(res.status).toBe(200);
  });
});

describe("POST /api/v1/admin/accounts/{id}/review", () => {
  beforeEach(() => world.identity.signIn(OWNER_ID, "aal2"));

  it("approves a pending applicant and records the reviewer", async () => {
    const res = await review(ALICE_ID, { decision: "approve", expectedRevision: 1 });
    expect(res.status).toBe(200);
    expect(await body(res)).toEqual({ status: "approved", revision: 2 });
    expect(world.access.reviews[0]).toMatchObject({ actorId: OWNER_ID, targetId: ALICE_ID });
  });

  it("applies one of two competing reviews and reports the other as a conflict", async () => {
    const [a, b] = await Promise.all([
      review(ALICE_ID, { decision: "approve", expectedRevision: 1 }),
      review(ALICE_ID, { decision: "approve", expectedRevision: 1 }),
    ]);
    expect([a.status, b.status].sort()).toEqual([200, 409]);
    expect(world.access.reviews).toHaveLength(1);
  });

  it("returns 409 for an invalid transition and 404 for an unknown target", async () => {
    expect((await review(ALICE_ID, { decision: "suspend", expectedRevision: 1 })).status).toBe(409);
    expect(
      (
        await review("55555555-5555-4555-8555-555555555555", {
          decision: "approve",
          expectedRevision: 1,
        })
      ).status,
    ).toBe(404);
    expect((await review("not-a-uuid", { decision: "approve", expectedRevision: 1 })).status).toBe(
      404,
    );
  });

  it("validates the body without echoing values", async () => {
    for (const bad of [
      {},
      { decision: "make-owner", expectedRevision: 1 },
      { decision: "approve", expectedRevision: "1" },
      { decision: "approve", expectedRevision: 1, note: "x".repeat(501) },
    ]) {
      const res = await review(ALICE_ID, bad);
      expect(res.status).toBe(400);
      expect(JSON.stringify(await body(res))).not.toContain("make-owner");
    }
    expect(world.access.reviews).toHaveLength(0);
  });

  it("rejects oversized bodies and non-JSON content", async () => {
    const big = await review(ALICE_ID, {
      decision: "approve",
      expectedRevision: 1,
      note: "x".repeat(40000),
    });
    expect(big.status).toBe(400);
    const wrongType = await reviewAccountHandler(() => world.container)(
      new Request(`${VALID_ENV.APP_URL}/api/v1/admin/accounts/${ALICE_ID}/review`, {
        method: "POST",
        headers: { origin: VALID_ENV.APP_URL, "content-type": "text/plain" },
        body: "decision=approve",
      }),
      { params: Promise.resolve({ userId: ALICE_ID }) },
    );
    expect(wrongType.status).toBe(400);
  });

  it("denies cross-origin requests, non-owners, and owners without MFA", async () => {
    expect(
      (
        await review(
          ALICE_ID,
          { decision: "approve", expectedRevision: 1 },
          { origin: "https://evil.example" },
        )
      ).status,
    ).toBe(403);
    world.identity.signIn(OWNER_ID, "aal1");
    expect((await review(ALICE_ID, { decision: "approve", expectedRevision: 1 })).status).toBe(403);
    world.access.add(BOB_ID, "approved");
    world.identity.signIn(BOB_ID, "aal2");
    expect((await review(ALICE_ID, { decision: "approve", expectedRevision: 1 })).status).toBe(403);
    expect(world.access.reviews).toHaveLength(0);
  });

  it("denies a pending applicant trying to approve themselves", async () => {
    world.identity.signIn(ALICE_ID, "aal2");
    expect((await review(ALICE_ID, { decision: "approve", expectedRevision: 1 })).status).toBe(403);
    expect(world.access.accounts.get(ALICE_ID)?.status).toBe("pending");
  });
});
