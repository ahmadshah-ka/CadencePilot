import { describe, expect, it, vi } from "vitest";
import type { Logger } from "@/application/ports/logger";
import { ALICE_ID, FakeAccess, fakeSession } from "../../../tests/support/fakes";
import { completeSignIn } from "./sign-in-use-cases";

const logger: Logger = {
  debug: vi.fn(),
  info: vi.fn(),
  warn: vi.fn(),
  error: vi.fn(),
  child: () => logger,
};

const run = (
  session = fakeSession(),
  input: { code: string | null; providerError: string | null } = {
    code: "abc",
    providerError: null,
  },
) => {
  const access = new FakeAccess();
  return { access, promise: completeSignIn({ session, access, logger }, input) };
};

describe("completeSignIn", () => {
  it("treats a provider error or missing code as a cancellation without touching the session", async () => {
    const completeSpy = vi.fn();
    const session = fakeSession({ completeSignIn: completeSpy });
    expect(await run(session, { code: null, providerError: null }).promise).toBe("cancelled");
    expect(await run(session, { code: "abc", providerError: "access_denied" }).promise).toBe(
      "cancelled",
    );
    expect(completeSpy).not.toHaveBeenCalled();
  });

  it("fails when the code is invalid, expired or reused", async () => {
    const { access, promise } = run(fakeSession({ completeSignIn: async () => null }));
    expect(await promise).toBe("failed");
    expect(access.ensured).toHaveLength(0);
  });

  it("signs out and fails when the provider did not verify the email", async () => {
    const signOut = vi.fn(async () => undefined);
    const { access, promise } = run(
      fakeSession({
        completeSignIn: async () => ({ userId: ALICE_ID, emailVerified: false }),
        signOut,
      }),
    );
    expect(await promise).toBe("failed");
    expect(signOut).toHaveBeenCalledOnce();
    expect(access.ensured).toHaveLength(0);
  });

  it("creates a pending record on success and never an approved one", async () => {
    const { access, promise } = run();
    expect(await promise).toBe("ok");
    expect(access.ensured).toEqual([ALICE_ID]);
    expect(access.accounts.get(ALICE_ID)?.status).toBe("pending");
  });

  it("is idempotent for duplicate sign-ins", async () => {
    const access = new FakeAccess();
    const deps = { session: fakeSession(), access, logger };
    await completeSignIn(deps, { code: "a", providerError: null });
    access.accounts.get(ALICE_ID)!.status = "approved";
    await completeSignIn(deps, { code: "b", providerError: null });
    expect(access.accounts.get(ALICE_ID)?.status).toBe("approved");
  });

  it("converts adapter exceptions into a generic failure", async () => {
    const { promise } = run(
      fakeSession({
        completeSignIn: async () => {
          throw new Error("provider exploded with secret");
        },
      }),
    );
    expect(await promise).toBe("failed");
  });
});
