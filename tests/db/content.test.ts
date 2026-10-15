import type { PGlite } from "@electric-sql/pglite";
import { beforeAll, afterAll, describe, it, expect } from "vitest";
import { createDatabase, createUser, as, failure } from "./harness";
let db: PGlite,
  alice: string,
  bob: string,
  owner: string,
  wa: string,
  wb: string,
  ba: string,
  bb: string,
  secondBrand: string;
let sequence = 0;
const key = () => `00000000-0000-4000-8000-${String(++sequence).padStart(12, "0")}`;
const query = (actor: string, sql: string, args: unknown[] = []) =>
  as(db, { sub: actor }, () => db.query<Record<string, unknown>>(sql, args));
async function create(
  actor = alice,
  brand = ba,
  workspace = wa,
  format = "video",
  parent: string | null = null,
  series: string | null = null,
  request = key(),
  title = "Episode",
) {
  const r = await query(actor, "select public.create_manual_content($1,$2,$3,$4,$5,$6,$7) as id", [
    workspace,
    brand,
    request,
    title,
    format,
    parent,
    series,
  ]);
  return r.rows[0]!.id as string;
}
async function rev(id: string) {
  return (
    await db.query<{ revision: number }>("select revision from public.content_items where id=$1", [
      id,
    ])
  ).rows[0]!.revision;
}
async function task(id: string, stage: string, done = true, revision?: number) {
  return query(alice, "select public.set_manual_content_task($1,$2,$3,$4,$5,$6)", [
    wa,
    ba,
    id,
    revision ?? (await rev(id)),
    stage,
    done,
  ]);
}
async function pub(
  id: string,
  platform: string,
  revision = 0,
  date: string | null = "2020-01-01T00:00:00Z",
  url = "",
) {
  return query(alice, "select public.save_manual_publication($1,$2,$3,$4,$5,$6,$7)", [
    wa,
    ba,
    id,
    revision,
    platform,
    date,
    url,
  ]);
}
beforeAll(async () => {
  db = await createDatabase();
  alice = await createUser(db, "content-a@example.test");
  bob = await createUser(db, "content-b@example.test");
  owner = await createUser(db, "content-owner@example.test");
  await db.query("select public.bootstrap_platform_owner($1)", [owner]);
  await db.query("update public.account_access set status='approved' where user_id in($1,$2)", [
    alice,
    bob,
  ]);
  wa = (await query(alice, "select public.create_initial_workspace('A') as id")).rows[0]!
    .id as string;
  wb = (await query(bob, "select public.create_initial_workspace('B') as id")).rows[0]!
    .id as string;
  ba = (
    await query(alice, "insert into public.brands(workspace_id,name)values($1,'A')returning id", [
      wa,
    ])
  ).rows[0]!.id as string;
  secondBrand = (
    await query(
      alice,
      "insert into public.brands(workspace_id,name)values($1,'Second')returning id",
      [wa],
    )
  ).rows[0]!.id as string;
  bb = (
    await query(bob, "insert into public.brands(workspace_id,name)values($1,'B')returning id", [wb])
  ).rows[0]!.id as string;
});
afterAll(async () => {
  await db.close();
});
describe("feature 06 persisted invariants", () => {
  it("creates exactly one original and checklist under request replay; conflicting replay cannot overwrite", async () => {
    const request = key(),
      id = await create(alice, ba, wa, "video", null, null, request);
    expect(await create(alice, ba, wa, "video", null, null, request)).toBe(id);
    expect(
      (await db.query("select 1 from public.content_items where id=$1", [id])).rows,
    ).toHaveLength(1);
    expect(
      (
        await query(alice, "select stage from public.tasks where content_id=$1 order by position", [
          id,
        ])
      ).rows,
    ).toEqual([{ stage: "record" }, { stage: "edit" }, { stage: "ready" }]);
    expect(
      await failure(() => create(alice, ba, wa, "video", null, null, request, "Changed")),
    ).toContain("stale_revision");
  });
  it("keeps one original, a separate derivative and three platform publications without duplicate counts", async () => {
    const id = await create();
    const child = await create(alice, ba, wa, "short", id);
    for (const platform of ["youtube", "linkedin", "tiktok"]) await pub(id, platform);
    await pub(id, "youtube");
    const counts = await db.query<{ originals: number; derivatives: number; publications: number }>(
      "select (select count(*)::int from public.content_items where id in($1,$2) and kind='original')as originals,(select count(*)::int from public.content_items where id in($1,$2)and kind='derivative')as derivatives,(select count(*)::int from public.publications where content_id=$1 and published_at is not null)as publications",
      [id, child],
    );
    expect(counts.rows[0]).toEqual({ originals: 1, derivatives: 1, publications: 3 });
    await pub(id, "youtube", 1, null);
    expect(
      (
        await db.query<{ count: number }>(
          "select count(*)::int as count from public.publications where content_id=$1 and published_at is not null",
          [id],
        )
      ).rows[0]!.count,
    ).toBe(2);
    expect(await failure(() => pub(id, "youtube", 1))).toContain("stale_revision");
    expect(await failure(() => pub(id, "instagram", 0, "2999-01-01T00:00:00Z"))).toContain(
      "invalid_decision",
    );
  });
  it("enforces format-specific ordered steps, reopens dependent work and retains publication facts", async () => {
    const post = await create(alice, ba, wa, "post");
    expect(
      (
        await query(alice, "select stage from public.tasks where content_id=$1 order by position", [
          post,
        ])
      ).rows,
    ).toEqual([{ stage: "edit" }, { stage: "ready" }]);
    expect(await failure(() => task(post, "record"))).toContain("invalid_decision");
    expect(await failure(() => task(post, "ready"))).toContain("invalid_transition");
    const id = await create();
    const initial = await rev(id);
    await task(id, "record", true, initial);
    expect(await failure(() => task(id, "edit", true, initial))).toContain("stale_revision");
    await task(id, "edit");
    await task(id, "ready");
    await pub(id, "youtube");
    await task(id, "record", false);
    expect(
      (await db.query("select production_stage from public.content_items where id=$1", [id]))
        .rows[0],
    ).toEqual({ production_stage: "planned" });
    expect(
      (
        await db.query(
          "select 1 from public.tasks where content_id=$1 and completed_at is not null",
          [id],
        )
      ).rows,
    ).toHaveLength(0);
    expect(
      (
        await db.query(
          "select 1 from public.publications where content_id=$1 and published_at is not null",
          [id],
        )
      ).rows,
    ).toHaveLength(1);
    expect(
      await failure(() =>
        query(alice, "select public.set_manual_content_task($1,$2,$3,null,'record',true)", [
          wa,
          ba,
          id,
        ]),
      ),
    ).toContain("stale_revision");
  });
  it("denies foreign parents/series and derivative-of-derivative links", async () => {
    const foreign = await create(bob, bb, wb),
      otherBrand = await create(alice, secondBrand, wa),
      id = await create(),
      child = await create(alice, ba, wa, "short", id);
    for (const parent of [foreign, otherBrand, child])
      expect(await failure(() => create(alice, ba, wa, "short", parent))).toContain("not_found");
    const series = (
      await query(bob, "select public.create_manual_series($1,$2,$3,'B series') as id", [
        wb,
        bb,
        key(),
      ])
    ).rows[0]!.id;
    expect(await failure(() => create(alice, ba, wa, "video", null, series as string))).toContain(
      "not_found",
    );
  });
  it("retains source transcripts separately from derivative drafts and archives without deletion", async () => {
    const id = await create(),
      child = await create(alice, ba, wa, "short", id);
    await query(
      alice,
      "select public.edit_manual_content($1,$2,$3,$4,'Original','https://example.test/video','Untimed original transcript','Source notes')",
      [wa, ba, id, await rev(id)],
    );
    await query(
      alice,
      "select public.edit_manual_content($1,$2,$3,$4,'Derivative','','','My derivative draft')",
      [wa, ba, child, await rev(child)],
    );
    expect(
      (await db.query("select source_transcript,notes from public.content_items where id=$1", [id]))
        .rows[0],
    ).toEqual({ source_transcript: "Untimed original transcript", notes: "Source notes" });
    await query(alice, "select public.archive_manual_content($1,$2,$3,$4,true)", [
      wa,
      ba,
      id,
      await rev(id),
    ]);
    expect(await failure(() => create(alice, ba, wa, "short", id))).toContain("not_found");
    expect(
      (await query(alice, "select parent_id from public.content_items where id=$1", [child]))
        .rows[0]!.parent_id,
    ).toBe(id);
    expect(await failure(() => task(id, "record"))).toContain("invalid_transition");
    await query(alice, "select public.archive_manual_content($1,$2,$3,$4,false)", [
      wa,
      ba,
      id,
      await rev(id),
    ]);
    expect(await create(alice, ba, wa, "short", id)).toBeTruthy();
    expect(
      await failure(() => query(alice, "delete from public.content_items where id=$1", [id])),
    ).toContain("permission denied");
  });
  it("makes series creation replay-safe, updates conditional and rejects archived series assignment", async () => {
    const request = key();
    const args = [wa, ba, request, "Series"];
    const id = (await query(alice, "select public.create_manual_series($1,$2,$3,$4)as id", args))
      .rows[0]!.id;
    expect(
      (await query(alice, "select public.create_manual_series($1,$2,$3,$4)as id", args)).rows[0]!
        .id,
    ).toBe(id);
    expect(
      await failure(() =>
        query(alice, "select public.create_manual_series($1,$2,$3,'Different')", [wa, ba, request]),
      ),
    ).toContain("stale_revision");
    await query(alice, "select public.edit_manual_series($1,$2,$3,1,'Renamed',true)", [wa, ba, id]);
    expect(await failure(() => create(alice, ba, wa, "video", null, id as string))).toContain(
      "not_found",
    );
    expect(
      await failure(() =>
        query(alice, "select public.edit_manual_series($1,$2,$3,1,'Stale',false)", [wa, ba, id]),
      ),
    ).toContain("stale_revision");
  });
  it("enforces RLS, disallows direct writes and blocks suspended/revoked accounts", async () => {
    const id = await create();
    expect(
      (await query(bob, "select id from public.content_items where id=$1", [id])).rows,
    ).toHaveLength(0);
    expect((await query(owner, "select id from public.content_items")).rows).toHaveLength(0);
    expect(await failure(() => create(bob, ba, wa))).toContain("not_found");
    expect(
      await failure(() =>
        query(alice, "update public.content_items set title='Bypass' where id=$1", [id]),
      ),
    ).toContain("permission denied");
    expect(
      await failure(() => query(alice, "select request_payload from public.content_items")),
    ).toContain("permission denied");
    expect(
      await failure(() =>
        as(db, "anon", () =>
          db.query("select public.create_manual_content($1,$2,$3,'X','video',null,null)", [
            wa,
            ba,
            key(),
          ]),
        ),
      ),
    ).toContain("permission denied");
    await db.query("update public.workspace_members set revoked_at=now() where user_id=$1", [
      alice,
    ]);
    expect((await query(alice, "select id from public.content_items")).rows).toHaveLength(0);
    expect(await failure(() => create())).toContain("not_found");
    await db.query("update public.workspace_members set revoked_at=null where user_id=$1", [alice]);
    await db.query("update public.account_access set status='suspended' where user_id=$1", [alice]);
    expect(await failure(() => create())).toContain("not_found");
    await db.query("update public.account_access set status='approved' where user_id=$1", [alice]);
  });
});
