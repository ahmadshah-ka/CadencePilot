import { describe, expect, it } from "vitest";
import { canAccessWorkspace, evaluateAccess, type Principal } from "./access-policy";
import type { AccountStatus } from "./account-status";

const principal = (status: AccountStatus | null, extra: Partial<Principal> = {}): Principal => ({
  userId: "u1",
  accountStatus: status,
  isOwner: false,
  mfaVerified: false,
  ...extra,
});

describe("evaluateAccess", () => {
  it("rejects anonymous callers with UNAUTHENTICATED for every requirement", () => {
    for (const kind of ["authenticated", "approved"] as const) {
      expect(evaluateAccess(null, { kind })).toEqual({
        allowed: false,
        code: "UNAUTHENTICATED",
        reason: "unauthenticated",
      });
    }
    expect(evaluateAccess(null, { kind: "owner", mfaRequired: true }).allowed).toBe(false);
  });

  it("lets any signed-in status satisfy 'authenticated'", () => {
    for (const status of ["pending", "rejected", "suspended", "approved", null] as const) {
      expect(evaluateAccess(principal(status), { kind: "authenticated" }).allowed).toBe(true);
    }
  });

  it.each([
    ["pending", "account_pending"],
    ["rejected", "account_rejected"],
    ["suspended", "account_suspended"],
    [null, "account_unknown"],
  ] as const)("blocks %s accounts from approved routes", (status, reason) => {
    expect(evaluateAccess(principal(status), { kind: "approved" })).toEqual({
      allowed: false,
      code: "FORBIDDEN",
      reason,
    });
  });

  it("allows approved accounts", () => {
    expect(evaluateAccess(principal("approved"), { kind: "approved" }).allowed).toBe(true);
  });

  it("denies non-owners on owner routes even when approved and MFA verified", () => {
    expect(
      evaluateAccess(principal("approved", { mfaVerified: true }), {
        kind: "owner",
        mfaRequired: true,
      }),
    ).toEqual({ allowed: false, code: "FORBIDDEN", reason: "not_owner" });
  });

  it("requires MFA for owners only when configured", () => {
    const owner = principal("approved", { isOwner: true });
    expect(evaluateAccess(owner, { kind: "owner", mfaRequired: true })).toMatchObject({
      reason: "mfa_required",
    });
    expect(evaluateAccess(owner, { kind: "owner", mfaRequired: false }).allowed).toBe(true);
    expect(
      evaluateAccess({ ...owner, mfaVerified: true }, { kind: "owner", mfaRequired: true }).allowed,
    ).toBe(true);
  });

  it("strips owner rights from a suspended owner", () => {
    const suspendedOwner = principal("suspended", { isOwner: true, mfaVerified: true });
    expect(evaluateAccess(suspendedOwner, { kind: "owner", mfaRequired: true }).allowed).toBe(
      false,
    );
  });
});

describe("canAccessWorkspace", () => {
  const member = { workspaceId: "w1", role: "owner", revoked: false } as const;

  it("requires an approved account and an unrevoked membership of that workspace", () => {
    expect(canAccessWorkspace(principal("approved"), member, "w1")).toBe(true);
    expect(canAccessWorkspace(principal("approved"), member, "w2")).toBe(false);
    expect(canAccessWorkspace(principal("approved"), null, "w1")).toBe(false);
    expect(canAccessWorkspace(principal("approved"), { ...member, revoked: true }, "w1")).toBe(
      false,
    );
    expect(canAccessWorkspace(principal("suspended"), member, "w1")).toBe(false);
  });

  it("does not let platform owner rights stand in for membership", () => {
    const owner = principal("approved", { isOwner: true, mfaVerified: true });
    expect(canAccessWorkspace(owner, null, "w1")).toBe(false);
  });
});
