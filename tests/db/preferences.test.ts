import type { PGlite } from "@electric-sql/pglite";
import { beforeAll, afterAll, it, expect } from "vitest";
import { createDatabase, createUser, as, failure } from "./harness";
let db: PGlite;
let alice: string;
let bob: string;
beforeAll(async () => {
  db = await createDatabase();
  alice = await createUser(db, "preferences-a@example.test");
  bob = await createUser(db, "preferences-b@example.test");
  await db.query("update public.account_access set status='approved' where user_id in ($1,$2)", [
    alice,
    bob,
  ]);
});
afterAll(async () => {
  await db.close();
});
it("isolates creator drafts and makes IDs/revisions immutable to API writes", async () => {
  const settings = { timezone: "Europe/London", availability: [], weeklyAvailability: [] };
  await as(db, { sub: alice }, () =>
    db.query("insert into public.creator_preferences(user_id,settings) values($1,$2)", [
      alice,
      settings,
    ]),
  );
  expect(
    (await as(db, { sub: bob }, () => db.query("select * from public.creator_preferences"))).rows,
  ).toHaveLength(0);
  expect(
    (
      await as(db, { sub: bob }, () =>
        db.query(
          "update public.creator_preferences set settings='{}' where user_id=$1 returning *",
          [alice],
        ),
      )
    ).rows,
  ).toHaveLength(0);
  expect(
    await failure(() =>
      as(db, { sub: bob }, () =>
        db.query("insert into public.creator_preferences(user_id,settings) values($1,'{}')", [
          alice,
        ]),
      ),
    ),
  ).toContain("row-level security");
  expect(
    await failure(() => as(db, "anon", () => db.query("select * from public.creator_preferences"))),
  ).toContain("permission denied");
  expect(
    await failure(() =>
      as(db, { sub: alice }, () => db.query("update public.creator_preferences set revision=10")),
    ),
  ).toContain("permission denied");
  expect(
    await failure(() =>
      as(db, { sub: alice }, () =>
        db.query("update public.creator_preferences set user_id=$1", [bob]),
      ),
    ),
  ).toContain("permission denied");
  const changed = await as(db, { sub: alice }, () =>
    db.query<{ revision: number }>(
      "update public.creator_preferences set settings=$1 where user_id=$2 and revision=1 returning revision",
      [settings, alice],
    ),
  );
  expect(changed.rows[0]!.revision).toBe(2);
  expect(
    (
      await as(db, { sub: alice }, () =>
        db.query(
          "update public.creator_preferences set settings=$1 where user_id=$2 and revision=1 returning revision",
          [settings, alice],
        ),
      )
    ).rows,
  ).toHaveLength(0);
});
it("blocks suspended users and prevents API deletion", async () => {
  expect(
    await failure(() =>
      as(db, { sub: alice }, () => db.query("delete from public.creator_preferences")),
    ),
  ).toContain("permission denied");
  await db.query("update public.account_access set status='suspended' where user_id=$1", [alice]);
  expect(
    (await as(db, { sub: alice }, () => db.query("select * from public.creator_preferences"))).rows,
  ).toHaveLength(0);
  const pending = await createUser(db, "preferences-pending@example.test");
  expect(
    await failure(() =>
      as(db, { sub: pending }, () =>
        db.query("insert into public.creator_preferences(user_id,settings) values($1,'{}')", [
          pending,
        ]),
      ),
    ),
  ).toContain("row-level security");
});
