import type { PGlite } from "@electric-sql/pglite";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { as, createDatabase, createUser, failure } from "./harness";

let db: PGlite;
let owner: string;
let alice: string;
let bob: string;
let carol: string;

const status = async (user: string) =>
  (
    await db.query<{ status: string; revision: number }>(
      "select status, revision from public.account_access where user_id = $1",
      [user],
    )
  ).rows[0]!;

const review = (actor: string, target: string, decision: string, revision: number) =>
  as(db, "service", () =>
    db.query("select * from public.review_account_access($1, $2, $3, $4, null)", [
      actor,
      target,
      decision,
      revision,
    ]),
  );

beforeAll(async () => {
  db = await createDatabase();
  owner = await createUser(db, "owner@example.test");
  alice = await createUser(db, "alice@example.test");
  bob = await createUser(db, "bob@example.test");
  carol = await createUser(db, "carol@example.test");
  await as(db, "postgres", () => db.query("select public.bootstrap_platform_owner($1)", [owner]));
});

afterAll(async () => {
  await db.close();
});

describe("feature 02: account access", () => {
  it("creates new users as pending with a profile", async () => {
    expect((await status(alice)).status).toBe("pending");
    const profile = await db.query("select 1 from public.profiles where user_id = $1", [alice]);
    expect(profile.rows).toHaveLength(1);
  });

  it("does not grant owner from signup metadata or to the first signup", async () => {
    const forged = await db.query<{ id: string }>(
      `insert into auth.users (email, email_confirmed_at, raw_user_meta_data)
       values ('forger@example.test', now(), '{"role":"owner","is_admin":true,"status":"approved"}') returning id`,
    );
    const id = forged.rows[0]!.id;
    expect((await status(id)).status).toBe("pending");
    const admin = await db.query("select 1 from public.platform_admins where user_id = $1", [id]);
    expect(admin.rows).toHaveLength(0);
    const asForger = await as(db, { sub: id }, () =>
      db.query("select public.is_platform_owner() as o"),
    );
    expect(asForger.rows[0]).toEqual({ o: false });
  });

  it("bootstrap is one-time, requires a verified user, and is closed to API roles", async () => {
    expect(
      await failure(() =>
        as(db, "postgres", () => db.query("select public.bootstrap_platform_owner($1)", [alice])),
      ),
    ).toContain("owner_already_exists");
    for (const actor of [{ sub: alice }, "anon", "service"] as const) {
      const message = await failure(() =>
        as(db, actor, () => db.query("select public.bootstrap_platform_owner($1)", [alice])),
      );
      expect(message, JSON.stringify(actor)).toContain("permission denied");
    }
    const owners = await db.query("select 1 from public.platform_admins");
    expect(owners.rows).toHaveLength(1);
  });

  it("lets an applicant read only their own access row; never write it", async () => {
    const rows = await as(db, { sub: alice }, () =>
      db.query("select user_id from public.account_access"),
    );
    expect(rows.rows).toEqual([{ user_id: alice }]);
    const write = await failure(() =>
      as(db, { sub: alice }, () =>
        db.query("update public.account_access set status = 'approved' where user_id = $1", [
          alice,
        ]),
      ),
    );
    expect(write).toContain("permission denied");
    const insertAdmin = await failure(() =>
      as(db, { sub: alice }, () =>
        db.query("insert into public.platform_admins (user_id, role) values ($1, 'owner')", [
          alice,
        ]),
      ),
    );
    expect(insertAdmin).toContain("permission denied");
    expect((await status(alice)).status).toBe("pending");
  });

  it("denies anon and non-owners the review function and audit/notification tables", async () => {
    for (const actor of [{ sub: alice }, "anon"] as const) {
      const message = await failure(() =>
        as(db, actor, () =>
          db.query("select * from public.review_account_access($1, $2, 'approve', 1, null)", [
            alice,
            alice,
          ]),
        ),
      );
      expect(message).toContain("permission denied");
    }
    const audit = await as(db, { sub: alice }, () => db.query("select * from public.audit_events"));
    expect(audit.rows).toHaveLength(0);
    expect(
      await failure(() =>
        as(db, { sub: alice }, () => db.query("select * from public.notification_intents")),
      ),
    ).toContain("permission denied");
  });

  it("rejects a review whose actor is not an owner, even via the service role", async () => {
    expect(await failure(() => review(alice, bob, "approve", 1))).toContain("forbidden");
    expect((await status(bob)).status).toBe("pending");
  });

  it("approves once; a second concurrent-style review is stale and changes nothing", async () => {
    const first = await review(owner, alice, "approve", 1);
    expect(first.rows[0]).toMatchObject({ status: "approved", revision: 2 });
    expect(await failure(() => review(owner, alice, "approve", 1))).toContain("stale_revision");
    expect((await status(alice)).revision).toBe(2);
    const intents = await db.query("select 1 from public.notification_intents where user_id = $1", [
      alice,
    ]);
    expect(intents.rows).toHaveLength(1);
    const audit = await db.query(
      "select 1 from public.audit_events where action = 'account_approve' and target_user_id = $1",
      [alice],
    );
    expect(audit.rows).toHaveLength(1);
  });

  it("serialises truly parallel reviews so exactly one wins", async () => {
    const results = await Promise.allSettled([
      review(owner, bob, "approve", 1),
      review(owner, bob, "reject", 1),
    ]);
    expect(results.filter((r) => r.status === "fulfilled")).toHaveLength(1);
    expect((await status(bob)).revision).toBe(2);
  });

  it("enforces transitions and forbids self-review", async () => {
    expect(await failure(() => review(owner, carol, "suspend", 1))).toContain("invalid_transition");
    expect(await failure(() => review(owner, owner, "suspend", 2))).toContain(
      "self_review_not_allowed",
    );
    expect(await failure(() => review(owner, carol, "bogus", 1))).toContain("invalid_decision");
    expect(
      await failure(() => review(owner, "00000000-0000-0000-0000-000000000000", "approve", 1)),
    ).toContain("not_found");
  });

  it("rejects, suspends and reinstates with audit records", async () => {
    await review(owner, carol, "reject", 1);
    expect((await status(carol)).status).toBe("rejected");
    await review(owner, carol, "approve", 2);
    await review(owner, carol, "suspend", 3);
    expect((await status(carol)).status).toBe("suspended");
    await review(owner, carol, "reinstate", 4);
    expect((await status(carol)).status).toBe("approved");
    const audit = await as(db, { sub: owner }, () =>
      db.query("select action from public.audit_events where target_user_id = $1 order by id", [
        carol,
      ]),
    );
    expect(audit.rows.map((r) => (r as { action: string }).action)).toEqual([
      "account_reject",
      "account_approve",
      "account_suspend",
      "account_reinstate",
    ]);
  });

  it("lets the owner read all applicants and audit events", async () => {
    const rows = await as(db, { sub: owner }, () =>
      db.query("select user_id from public.account_access"),
    );
    expect(rows.rows.length).toBeGreaterThanOrEqual(4);
  });

  it("ensure_account_access is service-only and idempotent", async () => {
    expect(
      await failure(() =>
        as(db, { sub: alice }, () => db.query("select public.ensure_account_access($1)", [alice])),
      ),
    ).toContain("permission denied");
    await as(db, "service", () => db.query("select public.ensure_account_access($1)", [alice]));
    expect((await status(alice)).status).toBe("approved");
  });

  it("only approved users may update their own profile", async () => {
    const pending = await createUser(db, "pending-profile@example.test");
    const denied = await as(db, { sub: pending }, () =>
      db.query("update public.profiles set timezone = 'UTC' where user_id = $1 returning user_id", [
        pending,
      ]),
    );
    expect(denied.rows).toHaveLength(0);
    const allowed = await as(db, { sub: alice }, () =>
      db.query("update public.profiles set timezone = 'UTC' where user_id = $1 returning user_id", [
        alice,
      ]),
    );
    expect(allowed.rows).toHaveLength(1);
  });
});
