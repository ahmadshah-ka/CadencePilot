import { randomUUID } from "node:crypto";
import type { PGlite } from "@electric-sql/pglite";
import { beforeAll, afterAll, beforeEach, describe, it, expect } from "vitest";
import { createDatabase, createUser, as, failure } from "./harness";
let db: PGlite, alice: string, bob: string, workspace: string, brand: string;
const caps = [1000, 600, 10, 6, 1000, 10, 6];
function reserve(
  id = randomUUID(),
  tokens = 400,
  limits = caps,
  user = alice,
  ws = workspace,
  br = brand,
) {
  return as(db, "service", () =>
    db.query<{ ok: boolean }>(
      "select public.reserve_ai_budget($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16) as ok",
      [id, ws, br, user, randomUUID(), "groq", "configured", "probe-v1", tokens, ...limits],
    ),
  );
}
function settle(id: string, input: number | null, output: number | null, status = "success") {
  return as(db, "service", () =>
    db.query("select public.settle_ai_budget($1,$2,$3,$4,$5,$6)", [
      id,
      input,
      output,
      status,
      20,
      null,
    ]),
  );
}
async function row(id: string) {
  return (
    await db.query<{ charged_tokens: number; status: string; input_tokens: number | null }>(
      "select * from public.ai_reservations where id=$1",
      [id],
    )
  ).rows[0]!;
}
beforeAll(async () => {
  db = await createDatabase();
  alice = await createUser(db, "a-ai@example.test");
  bob = await createUser(db, "b-ai@example.test");
  await db.query("update public.account_access set status='approved' where user_id in ($1,$2)", [
    alice,
    bob,
  ]);
  workspace = (
    await db.query<{ id: string }>(
      "insert into public.workspaces(owner_user_id,name)values($1,'AI')returning id",
      [alice],
    )
  ).rows[0]!.id;
  await db.query(
    "insert into public.workspace_members(workspace_id,user_id,role)values($1,$2,'owner')",
    [workspace, alice],
  );
  brand = (
    await db.query<{ id: string }>(
      "insert into public.brands(workspace_id,name)values($1,'Brand')returning id",
      [workspace],
    )
  ).rows[0]!.id;
});
afterAll(async () => {
  await db?.close();
});
beforeEach(async () => {
  await db.exec("truncate public.ai_reservations,public.ai_budget_windows;");
});
describe("persistent AI quota invariants", () => {
  it("admits atomically, denies overspend and duplicate IDs, and reconciles once", async () => {
    const id = randomUUID();
    expect((await reserve(id)).rows[0]!.ok).toBe(true);
    expect((await reserve(id)).rows[0]!.ok).toBe(false);
    expect((await reserve()).rows[0]!.ok).toBe(false);
    await settle(id, 30, 20);
    expect(Number((await row(id)).charged_tokens)).toBe(50);
    await settle(id, 0, 0);
    expect(Number((await row(id)).charged_tokens)).toBe(50);
    expect((await reserve()).rows[0]!.ok).toBe(true);
  });
  it("serializes simultaneous admissions so only remaining budget is admitted", async () => {
    // One SQL session submits concurrent promises; PostgreSQL serializes each critical section.
    const replies = await as(db, "service", () =>
      Promise.all(
        Array.from({ length: 5 }, () =>
          db.query<{ ok: boolean }>(
            "select public.reserve_ai_budget($1,$2,$3,$4,$5,'groq','model','probe-v1',400,1000,600,10,6,1000,10,6)as ok",
            [randomUUID(), workspace, brand, alice, randomUUID()],
          ),
        ),
      ),
    );
    expect(replies.filter((r) => r.rows[0]!.ok)).toHaveLength(1);
    expect(
      Number(
        (
          await db.query<{ n: number }>(
            "select sum(charged_tokens)as n from public.ai_reservations",
          )
        ).rows[0]!.n,
      ),
    ).toBe(400);
  });
  it("retains unknown charges and never releases requests for rejected attempts", async () => {
    const id = randomUUID();
    await reserve(id);
    await settle(id, null, null, "unknown");
    expect(Number((await row(id)).charged_tokens)).toBe(400);
    expect((await row(id)).status).toBe("unknown");
    expect((await reserve()).rows[0]!.ok).toBe(false);
    await db.exec("truncate public.ai_reservations,public.ai_budget_windows;");
    const cap = [1000, 600, 1, 1, 1000, 10, 6];
    const zero = randomUUID();
    await reserve(zero, 400, cap);
    await settle(zero, 0, 0, "failed");
    expect((await reserve(randomUUID(), 100, cap)).rows[0]!.ok).toBe(false);
  });
  it("enforces global and tenant token/request windows independently", async () => {
    for (const limits of [
      [300, 300, 10, 6, 1000, 10, 6],
      [1000, 600, 10, 6, 300, 10, 6],
    ])
      expect((await reserve(randomUUID(), 400, limits)).rows[0]!.ok).toBe(false);
    for (const limits of [
      [1000, 600, 1, 1, 1000, 10, 6],
      [1000, 600, 10, 6, 1000, 1, 1],
    ]) {
      await db.exec("truncate public.ai_reservations,public.ai_budget_windows;");
      const id = randomUUID();
      await reserve(id, 100, limits);
      await settle(id, 0, 0, "failed");
      expect((await reserve(randomUUID(), 100, limits)).rows[0]!.ok).toBe(false);
    }
  });
  it("fails closed for foreign brand, revoked membership, suspended user and archived scopes", async () => {
    expect(await failure(() => reserve(randomUUID(), 100, caps, bob))).not.toBeNull();
    expect(
      await failure(() => reserve(randomUUID(), 100, caps, alice, workspace, randomUUID())),
    ).not.toBeNull();
    for (const [change, restore] of [
      [
        "update public.workspace_members set revoked_at=now()",
        "update public.workspace_members set revoked_at=null",
      ],
      [
        "update public.account_access set status='suspended'",
        "update public.account_access set status='approved'",
      ],
      [
        "update public.workspaces set archived_at=now()",
        "update public.workspaces set archived_at=null",
      ],
      ["update public.brands set archived_at=now()", "update public.brands set archived_at=null"],
    ]) {
      await db.exec(change!);
      expect(await failure(() => reserve())).not.toBeNull();
      await db.exec(restore!);
    }
  });
  it("does not expose ledgers or service RPCs to tenant or anonymous clients", async () => {
    for (const actor of ["anon" as const, { sub: alice }])
      for (const sql of [
        "select * from public.ai_reservations",
        "select * from public.ai_budget_windows",
        "delete from public.ai_reservations",
      ])
        expect(await failure(() => as(db, actor, () => db.exec(sql)))).not.toBeNull();
    expect(
      await failure(() =>
        as(db, { sub: alice }, () =>
          db.query("select public.settle_ai_budget($1,0,0,'success',0,null)", [randomUUID()]),
        ),
      ),
    ).not.toBeNull();
    expect(
      await failure(() =>
        as(db, { sub: alice }, () =>
          db.query(
            "select public.reserve_ai_budget($1,$2,$3,$4,$5,'groq','model','probe-v1',1,10,10,10,10,10,10,10)",
            [randomUUID(), workspace, brand, alice, randomUUID()],
          ),
        ),
      ),
    ).not.toBeNull();
  });
  it("rejects malformed caps/settlements and records actual overages without hiding them", async () => {
    expect(await failure(() => reserve(randomUUID(), -1))).not.toBeNull();
    expect(
      await failure(() => reserve(randomUUID(), 1, [100, 200, 10, 6, 1000, 10, 6])),
    ).not.toBeNull();
    const id = randomUUID();
    await reserve(id);
    expect(await failure(() => settle(id, null, 1))).not.toBeNull();
    expect(await failure(() => settle(id, -1, 1))).not.toBeNull();
    expect(await failure(() => settle(randomUUID(), 1, 1))).not.toBeNull();
    await settle(id, 500, 200);
    expect(Number((await row(id)).charged_tokens)).toBe(700);
    expect((await reserve()).rows[0]!.ok).toBe(false);
  });
});
