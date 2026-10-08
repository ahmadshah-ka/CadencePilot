import type { PGlite } from "@electric-sql/pglite";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { as, createDatabase, createUser, failure } from "./harness";

let db: PGlite;
let owner: string;
let alice: string;
let bob: string;

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
  await as(db, "postgres", () => db.query("select public.bootstrap_platform_owner($1)", [owner]));
  await review(owner, alice, "approve", 1);
  await review(owner, bob, "approve", 1);
});

afterAll(async () => {
  await db.close();
});

describe("feature 03: workspaces and brands", () => {
  let wsAlice: string;
  let wsBob: string;
  let brandAlice: string;
  let brandBob: string;

  const createWorkspace = (user: string, name = "Studio") =>
    as(db, { sub: user }, () =>
      db.query<{ id: string }>("select public.create_initial_workspace($1) as id", [name]),
    );

  it("refuses workspace creation for unapproved accounts", async () => {
    const pending = await createUser(db, "pending-ws@example.test");
    expect(await failure(() => createWorkspace(pending))).toContain("forbidden");
    const anonymous = await failure(() =>
      as(db, "anon", () => db.query("select public.create_initial_workspace('x')")),
    );
    expect(anonymous).toContain("permission denied");
  });

  it("creates exactly one workspace and owner membership, idempotently", async () => {
    wsAlice = (await createWorkspace(alice, "Alice Studio")).rows[0]!.id;
    const again = (await createWorkspace(alice, "Renamed Attempt")).rows[0]!.id;
    expect(again).toBe(wsAlice);
    const parallel = await Promise.all([createWorkspace(alice), createWorkspace(alice)]);
    expect(new Set(parallel.map((r) => r.rows[0]!.id))).toEqual(new Set([wsAlice]));
    expect(
      (await db.query("select 1 from public.workspaces where owner_user_id = $1", [alice])).rows,
    ).toHaveLength(1);
    const members = await db.query(
      "select role from public.workspace_members where workspace_id = $1",
      [wsAlice],
    );
    expect(members.rows).toEqual([{ role: "owner" }]);
  });

  it("rolls back fully on invalid input (no orphan rows)", async () => {
    const dave = await createUser(db, "dave@example.test");
    const base = await status(dave);
    await review(owner, dave, "approve", base.revision);
    expect(await failure(() => createWorkspace(dave, "   "))).toContain("invalid_name");
    expect(
      (await db.query("select 1 from public.workspaces where owner_user_id = $1", [dave])).rows,
    ).toHaveLength(0);
    expect(
      (await db.query("select 1 from public.workspace_members where user_id = $1", [dave])).rows,
    ).toHaveLength(0);
  });

  it("isolates customers: A cannot read, update, insert into or relink B's records", async () => {
    const bobUser = bob;
    await review(owner, bobUser, "approve", (await status(bobUser)).revision).catch(
      () => undefined,
    );
    wsBob = (await createWorkspace(bobUser, "Bob Studio")).rows[0]!.id;

    brandAlice = (
      await as(db, { sub: alice }, () =>
        db.query<{ id: string }>(
          "insert into public.brands (workspace_id, name) values ($1, 'Alpha') returning id",
          [wsAlice],
        ),
      )
    ).rows[0]!.id;
    brandBob = (
      await as(db, { sub: bobUser }, () =>
        db.query<{ id: string }>(
          "insert into public.brands (workspace_id, name) values ($1, 'Beta') returning id",
          [wsBob],
        ),
      )
    ).rows[0]!.id;

    const aliceSees = await as(db, { sub: alice }, () => db.query("select id from public.brands"));
    expect(aliceSees.rows).toEqual([{ id: brandAlice }]);
    expect(
      (await as(db, { sub: alice }, () => db.query("select id from public.workspaces"))).rows,
    ).toEqual([{ id: wsAlice }]);
    expect(
      (
        await as(db, { sub: alice }, () =>
          db.query("select 1 from public.workspace_members where workspace_id = $1", [wsBob]),
        )
      ).rows,
    ).toHaveLength(0);

    // Foreign update affects zero rows; foreign insert violates RLS.
    const foreignUpdate = await as(db, { sub: alice }, () =>
      db.query("update public.brands set name = 'Hijack' where id = $1 returning id", [brandBob]),
    );
    expect(foreignUpdate.rows).toHaveLength(0);
    expect(
      await failure(() =>
        as(db, { sub: alice }, () =>
          db.query("insert into public.brands (workspace_id, name) values ($1, 'Plant')", [wsBob]),
        ),
      ),
    ).toContain("row-level security");
    // Relinking own brand to a foreign workspace is blocked (column grant + immutability trigger).
    expect(
      await failure(() =>
        as(db, { sub: alice }, () =>
          db.query("update public.brands set workspace_id = $1 where id = $2", [wsBob, brandAlice]),
        ),
      ),
    ).toContain("permission denied");
    expect(
      await failure(() =>
        as(db, "postgres", () =>
          db.query("update public.brands set workspace_id = $1 where id = $2", [wsBob, brandAlice]),
        ),
      ),
    ).toContain("brand_workspace_immutable");
  });

  it("gives the platform owner no workspace or brand access", async () => {
    const brands = await as(db, { sub: owner }, () => db.query("select id from public.brands"));
    expect(brands.rows).toHaveLength(0);
    const workspaces = await as(db, { sub: owner }, () =>
      db.query("select id from public.workspaces"),
    );
    expect(workspaces.rows).toHaveLength(0);
  });

  it("denies anon and forbids brand deletion even for members", async () => {
    expect(
      await failure(() => as(db, "anon", () => db.query("select * from public.brands"))),
    ).toContain("permission denied");
    expect(
      await failure(() =>
        as(db, { sub: alice }, () =>
          db.query("delete from public.brands where id = $1", [brandAlice]),
        ),
      ),
    ).toContain("permission denied");
  });

  it("bumps revision on update and rejects duplicate active names", async () => {
    const updated = await as(db, { sub: alice }, () =>
      db.query<{ revision: number }>(
        "update public.brands set name = 'Alpha 2' where id = $1 returning revision",
        [brandAlice],
      ),
    );
    expect(updated.rows[0]!.revision).toBe(2);
    await as(db, { sub: alice }, () =>
      db.query("insert into public.brands (workspace_id, name) values ($1, 'Gamma')", [wsAlice]),
    );
    expect(
      await failure(() =>
        as(db, { sub: alice }, () =>
          db.query("insert into public.brands (workspace_id, name) values ($1, 'gamma')", [
            wsAlice,
          ]),
        ),
      ),
    ).toContain("brands_active_name_key");
  });

  it("revoked membership stops access immediately", async () => {
    await db.query(
      "update public.workspace_members set revoked_at = now() where workspace_id = $1 and user_id = $2",
      [wsAlice, alice],
    );
    expect(
      (await as(db, { sub: alice }, () => db.query("select id from public.brands"))).rows,
    ).toHaveLength(0);
    expect(
      await failure(() =>
        as(db, { sub: alice }, () =>
          db.query("insert into public.brands (workspace_id, name) values ($1, 'Late')", [wsAlice]),
        ),
      ),
    ).toContain("row-level security");
    await db.query(
      "update public.workspace_members set revoked_at = null where workspace_id = $1 and user_id = $2",
      [wsAlice, alice],
    );
  });

  it("suspension revokes workspace data access, reinstatement restores it", async () => {
    const before = await status(alice);
    await review(owner, alice, "suspend", before.revision);
    expect(
      (await as(db, { sub: alice }, () => db.query("select id from public.brands"))).rows,
    ).toHaveLength(0);
    expect(
      await failure(() =>
        as(db, { sub: alice }, () =>
          db.query("insert into public.brands (workspace_id, name) values ($1, 'Sus')", [wsAlice]),
        ),
      ),
    ).toContain("row-level security");
    await review(owner, alice, "reinstate", before.revision + 1);
    expect(
      (await as(db, { sub: alice }, () => db.query("select id from public.brands"))).rows.length,
    ).toBeGreaterThan(0);
  });
});
