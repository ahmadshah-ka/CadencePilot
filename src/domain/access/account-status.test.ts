import { describe, expect, it } from "vitest";
import { ACCOUNT_STATUSES, REVIEW_DECISIONS, nextAccountStatus } from "./account-status";

describe("nextAccountStatus", () => {
  it("permits exactly the documented transitions", () => {
    const allowed: Record<string, string> = {
      "pending:approve": "approved",
      "rejected:approve": "approved",
      "pending:reject": "rejected",
      "approved:suspend": "suspended",
      "suspended:reinstate": "approved",
    };
    for (const status of ACCOUNT_STATUSES) {
      for (const decision of REVIEW_DECISIONS) {
        expect(nextAccountStatus(status, decision), `${status}:${decision}`).toBe(
          allowed[`${status}:${decision}`] ?? null,
        );
      }
    }
  });
});
