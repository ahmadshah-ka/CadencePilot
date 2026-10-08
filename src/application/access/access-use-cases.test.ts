import { describe, expect, it, vi } from "vitest";
import type { Logger } from "@/application/ports/logger";
import { AppError } from "@/domain/errors/app-error";
import { ALICE_ID, FakeAccess, FakeIdentity, OWNER_ID } from "../../../tests/support/fakes";
import { assertAccess, listAccounts, resolvePrincipal, reviewAccount } from "./access-use-cases";

const logger: Logger = {
  debug: vi.fn(),
  info: vi.fn(),
  warn: vi.fn(),
  error: vi.fn(),
  child: () => logger,
};

function setup() {
  const access = new FakeAccess();
  const identity = new FakeIdentity();
  access.owners.add(OWNER_ID);
  access.add(OWNER_ID, "approved");
  return { access, identity };
}

describe("resolvePrincipal", () => {
  it("returns null without a session", async () => {
    const { access, identity } = setup();
    expect(await resolvePrincipal({ access, identity, logger })).toBeNull();
  });

  it("maps status, owner flag and MFA level from fresh state", async () => {
    const { access, identity } = setup();
    identity.signIn(OWNER_ID, "aal2");
    expect(await resolvePrincipal({ access, identity, logger })).toEqual({
      userId: OWNER_ID,
      accountStatus: "approved",
      isOwner: true,
      mfaVerified: true,
    });
  });

  it("does not report owner rights for a suspended account even if a platform_admins row exists", async () => {
    const { access, identity } = setup();
    access.add(OWNER_ID, "suspended");
    identity.signIn(OWNER_ID, "aal2");
    expect((await resolvePrincipal({ access, identity, logger }))?.isOwner).toBe(false);
  });

  it("creates a pending record for an unknown user", async () => {
    const { access, identity } = setup();
    identity.signIn(ALICE_ID);
    const principal = await resolvePrincipal({ access, identity, logger });
    expect(principal?.accountStatus).toBe("pending");
    expect(access.ensured).toEqual([ALICE_ID]);
  });
});

describe("assertAccess", () => {
  it("throws safe, coded errors", () => {
    expect(() => assertAccess(null, { kind: "approved" })).toThrow(AppError);
    try {
      assertAccess(null, { kind: "approved" });
    } catch (error) {
      expect((error as AppError).code).toBe("UNAUTHENTICATED");
    }
    try {
      assertAccess(
        { userId: "u", accountStatus: "pending", isOwner: false, mfaVerified: false },
        { kind: "approved" },
      );
    } catch (error) {
      expect((error as AppError).code).toBe("FORBIDDEN");
      expect((error as AppError).details).toEqual({ reason: "account_pending" });
    }
  });
});

describe("reviewAccount / listAccounts", () => {
  const owner = {
    userId: OWNER_ID,
    accountStatus: "approved",
    isOwner: true,
    mfaVerified: true,
  } as const;
  const command = {
    targetUserId: ALICE_ID,
    decision: "approve",
    expectedRevision: 1,
    note: null,
  } as const;

  it("rechecks authorization inside the use case", async () => {
    const { access } = setup();
    access.add(ALICE_ID, "pending");
    const deps = { access, logger, ownerMfaRequired: true };
    await expect(reviewAccount(deps, null, command)).rejects.toMatchObject({
      code: "UNAUTHENTICATED",
    });
    await expect(reviewAccount(deps, { ...owner, isOwner: false }, command)).rejects.toMatchObject({
      code: "FORBIDDEN",
    });
    await expect(
      reviewAccount(deps, { ...owner, mfaVerified: false }, command),
    ).rejects.toMatchObject({ code: "FORBIDDEN" });
    expect(access.reviews).toHaveLength(0);
    await expect(reviewAccount(deps, owner, command)).resolves.toEqual({
      status: "approved",
      revision: 2,
    });
  });

  it("logs ids and decision only", async () => {
    const { access } = setup();
    access.add(ALICE_ID, "pending");
    const info = vi.fn();
    await reviewAccount({ access, logger: { ...logger, info }, ownerMfaRequired: false }, owner, {
      ...command,
      note: "private note",
    });
    expect(JSON.stringify(info.mock.calls)).not.toContain("private note");
  });

  it("lists only for owners", async () => {
    const { access } = setup();
    const deps = { access, ownerMfaRequired: true };
    const query = { status: null, cursor: null, limit: 10 };
    await expect(listAccounts(deps, { ...owner, isOwner: false }, query)).rejects.toMatchObject({
      code: "FORBIDDEN",
    });
    expect((await listAccounts(deps, owner, query)).items).toHaveLength(1);
  });
});
