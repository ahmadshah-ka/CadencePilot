import { randomUUID } from "node:crypto";
import type { PGlite } from "@electric-sql/pglite";
import { beforeAll, afterAll, beforeEach, it, expect } from "vitest";
import { createDatabase, createUser, as, failure } from "./harness";
let db: PGlite,
  a: string,
  b: string,
  w: string,
  other: string,
  brand: string,
  second: string,
  foreign: string;
const mutate = (op: string, data: unknown = {}, who = a, ws = w, br = brand) =>
  as(
    db,
    "service",
    async () =>
      (
        await db.query<{ v: Record<string, unknown> }>(
          "select public.assistant_mutate($1,$2,$3,$4,$5)as v",
          [who, ws, br, op, data],
        )
      ).rows[0]!.v,
  );
const read = (kind: string, args: unknown = {}, who = a, ws = w, br = brand) =>
  as(
    db,
    { sub: who },
    async () =>
      (
        await db.query<{ v: unknown }>("select public.assistant_read($1,$2,$3,$4)as v", [
          ws,
          br,
          kind,
          args,
        ])
      ).rows[0]!.v,
  );
async function begin(text = "Remember my calm style", br = brand) {
  return mutate(
    "begin",
    {
      requestId: randomUUID(),
      text,
      leaseSeconds: 240,
      retentionDays: 30,
      admission: { minute: 60, day: 10000 },
    },
    a,
    w,
    br,
  );
}
function turn(t: Record<string, unknown>) {
  return { turnId: t.turn_id, assistantMessageId: t.assistant_message_id };
}
async function complete(text = "I can propose that.", proposals: unknown[] = [], br = brand) {
  const t = await begin("My style is calm", br);
  await mutate("finish", { ...turn(t), text, proposals }, a, w, br);
  return t;
}
beforeAll(async () => {
  db = await createDatabase();
  a = await createUser(db, "assistant-a@example.test");
  b = await createUser(db, "assistant-b@example.test");
  await db.query("update public.account_access set status='approved'where user_id in($1,$2)", [
    a,
    b,
  ]);
  w = (
    await db.query<{ id: string }>(
      "insert into public.workspaces(owner_user_id,name)values($1,'One')returning id",
      [a],
    )
  ).rows[0]!.id;
  other = (
    await db.query<{ id: string }>(
      "insert into public.workspaces(owner_user_id,name)values($1,'Other')returning id",
      [b],
    )
  ).rows[0]!.id;
  await db.query(
    "insert into public.workspace_members(workspace_id,user_id,role)values($1,$2,'owner'),($3,$4,'owner')",
    [w, a, other, b],
  );
  brand = (
    await db.query<{ id: string }>(
      "insert into public.brands(workspace_id,name)values($1,'A')returning id",
      [w],
    )
  ).rows[0]!.id;
  second = (
    await db.query<{ id: string }>(
      "insert into public.brands(workspace_id,name)values($1,'B')returning id",
      [w],
    )
  ).rows[0]!.id;
  foreign = (
    await db.query<{ id: string }>(
      "insert into public.brands(workspace_id,name)values($1,'Foreign')returning id",
      [other],
    )
  ).rows[0]!.id;
}, 30000);
afterAll(async () => {
  await db?.close();
});
beforeEach(async () => {
  await db.exec(
    "truncate public.assistant_memories,public.assistant_messages,public.assistant_summaries,public.assistant_conversations;",
  );
});
it("stores one idempotent pair, serializes pending turns and saves no partial response", async () => {
  const key = randomUUID(),
    input = {
      requestId: key,
      text: "Hello",
      leaseSeconds: 240,
      retentionDays: 30,
      admission: { minute: 60, day: 10000 },
    },
    t = await mutate("begin", input);
  expect((await mutate("begin", input)).replay).toBe(true);
  expect(await failure(() => begin())).toContain("stale_revision");
  await mutate("fail", turn(t));
  const state = (await read("snapshot")) as {
    messages: { role: string; body: string | null; status: string }[];
  };
  expect(state.messages).toHaveLength(2);
  expect(state.messages.find((m) => m.role === "assistant")!.body).toBeNull();
  expect(state.messages.every((m) => m.status === "failed")).toBe(true);
});
it("separates personal and brand facts, confirms explicitly, and checks provenance", async () => {
  const t = await complete("Review this.", [
    { kind: "memory", scope: "brand", key: "style", value: "calm" },
    { kind: "memory", scope: "personal", key: "time", value: "evenings" },
  ]);
  expect(((await read("snapshot")) as { memories: unknown[] }).memories).toHaveLength(0);
  await mutate("confirm", {
    messageId: t.assistant_message_id,
    index: 0,
    settings: null,
    revision: 0,
  });
  await mutate("confirm", {
    messageId: t.assistant_message_id,
    index: 0,
    settings: null,
    revision: 0,
  });
  await mutate("confirm", {
    messageId: t.assistant_message_id,
    index: 1,
    settings: null,
    revision: 0,
  });
  const state = (await read("snapshot")) as {
    memories: { scope: string; source_message_id: string }[];
  };
  expect(state.memories).toHaveLength(2);
  expect(state.memories.every((m) => m.source_message_id === t.user_message_id)).toBe(true);
  const otherBrand = (await read("snapshot", {}, a, w, second)) as {
    memories: { scope: string }[];
  };
  expect(otherBrand.memories.map((m) => m.scope)).toEqual(["personal"]);
});
it("invalidates summaries and excludes older messages after edit/forget, rejecting old proposals", async () => {
  const t = await complete("A calm style.", [
    { kind: "memory", scope: "brand", key: "style", value: "calm" },
  ]);
  let state = (await read("snapshot")) as {
    conversation: { context_revision: number };
    memories: { id: string; revision: number }[];
  };
  await mutate("summary", {
    contextRevision: state.conversation.context_revision,
    ids: [t.user_message_id, t.assistant_message_id],
    excerpt: 100,
  });
  await mutate("confirm", {
    messageId: t.assistant_message_id,
    index: 0,
    settings: null,
    revision: 0,
  });
  state = (await read("snapshot")) as typeof state;
  const memory = state.memories[0]!;
  expect(await read("history")).toEqual([]);
  expect(
    (await db.query<{ body: string }>("select body from public.assistant_summaries")).rows[0]!.body,
  ).toBe("");
  await mutate("memory", {
    id: memory.id,
    revision: memory.revision,
    scope: "brand",
    key: "style",
    value: "bold",
    forget: false,
  });
  const pending = await begin();
  await mutate("memory", {
    id: memory.id,
    revision: memory.revision + 1,
    scope: "brand",
    key: "style",
    value: "bold",
    forget: true,
  });
  expect(
    await failure(() => mutate("finish", { ...turn(pending), text: "Old answer", proposals: [] })),
  ).toContain("stale_revision");
  await mutate("fail", turn(pending));
  expect(((await read("snapshot")) as { memories: unknown[] }).memories).toHaveLength(0);
});
it("forgets a message pair and all memories sourced from it, with revisions", async () => {
  const t = await complete("Review.", [
    { kind: "memory", scope: "personal", key: "style", value: "calm" },
  ]);
  await mutate("confirm", {
    messageId: t.assistant_message_id,
    index: 0,
    settings: null,
    revision: 0,
  });
  const state = (await read("snapshot")) as { messages: { id: string; revision: number }[] };
  const message = state.messages.find((m) => m.id === t.user_message_id)!;
  await mutate("forget", { messageId: message.id, revision: message.revision });
  const after = (await read("snapshot")) as {
    messages: { body: null; proposals: unknown[] }[];
    memories: unknown[];
  };
  expect(after.messages.every((m) => m.body === null && m.proposals.length === 0)).toBe(true);
  expect(after.memories).toHaveLength(0);
  expect(
    await failure(() => mutate("forget", { messageId: message.id, revision: message.revision })),
  ).toContain("stale_revision");
});
it("keeps counts exact and treats one original on three platforms as three publications", async () => {
  const id = (
    await db.query<{ id: string }>(
      "insert into public.content_items(workspace_id,brand_id,title,format,production_stage,request_id,request_payload)values($1,$2,'Video','video','ready',$3,'{}')returning id",
      [w, brand, randomUUID()],
    )
  ).rows[0]!.id;
  for (const platform of ["youtube", "instagram", "linkedin"])
    await db.query(
      "insert into public.publications(workspace_id,brand_id,content_id,platform,published_at)values($1,$2,$3,$4,now())",
      [w, brand, id, platform],
    );
  expect(await read("stats")).toMatchObject({
    originals_created: "1",
    videos_ready: "1",
    publications: "3",
  });
  expect(await read("stats", {}, a, w, second)).toMatchObject({
    originals_created: "0",
    publications: "0",
  });
  await db.query("update public.content_items set archived_at=now()where id=$1", [id]);
  expect(await read("stats")).toMatchObject({ originals_created: "0", publications: "0" });
});
it("searches only completed scoped history and rejects foreign summary source IDs", async () => {
  const aTurn = await complete("A unique pineapple explanation."),
    bTurn = await complete("Foreign violet secret.", [], second);
  expect((await read("history", { query: "pineapple" })) as unknown[]).toHaveLength(1);
  expect(await read("history", { query: "violet" })).toEqual([]);
  const state = (await read("snapshot")) as { conversation: { context_revision: number } };
  expect(
    await failure(() =>
      mutate("summary", {
        contextRevision: state.conversation.context_revision,
        ids: [bTurn.assistant_message_id],
        excerpt: 100,
      }),
    ),
  ).toContain("not_found");
  expect(await read("message", { id: bTurn.assistant_message_id })).toBeNull();
  expect(
    ((await read("message", { id: aTurn.assistant_message_id })) as { body: string }).body,
  ).toContain("pineapple");
});
it("rejects foreign workspace/user IDs and all direct client mutations or service calls", async () => {
  expect(await failure(() => read("snapshot", {}, b, w, brand))).toContain("not_found");
  expect(await failure(() => mutate("begin", {}, a, other, foreign))).toContain("not_found");
  for (const sql of [
    "select * from public.assistant_messages",
    "select * from public.assistant_memories",
    "select * from public.assistant_summaries",
  ]) {
    expect((await as(db, { sub: b }, () => db.query(sql))).rows).toEqual([]);
  }
  expect(
    await failure(() => as(db, { sub: a }, () => db.exec("delete from public.assistant_messages"))),
  ).not.toBeNull();
  expect(
    await failure(() =>
      as(db, { sub: a }, () =>
        db.query("select public.assistant_mutate($1,$2,$3,'cleanup','{}')", [a, w, brand]),
      ),
    ),
  ).not.toBeNull();
});
it("rechecks revocation and suspension before streamed output/commit", async () => {
  const t = await begin();
  await db.query(
    "update public.workspace_members set revoked_at=now()where workspace_id=$1 and user_id=$2",
    [w, a],
  );
  expect(await failure(() => mutate("guard", turn(t)))).toContain("not_found");
  await db.exec("update public.workspace_members set revoked_at=null");
  await db.query("update public.account_access set status='suspended'where user_id=$1", [a]);
  expect(await failure(() => read("snapshot"))).toContain("not_found");
  await db.query("update public.account_access set status='approved'where user_id=$1", [a]);
});
it("validates stale setting confirmations and invalidates context on manual form changes", async () => {
  const settings = {
    topic: "Engineering",
    audience: "Creators",
    tone: "Calm",
    platforms: ["youtube"],
    targets: { videos: 2 },
    weeklyTargets: [],
  };
  const t = await complete("Review the target.", [
    { kind: "preference", field: "targets.videos", value: "2", before: null },
  ]);
  const row = (
    await db.query<{ revision: number }>("select revision from public.brands where id=$1", [brand])
  ).rows[0]!;
  await mutate("confirm", {
    messageId: t.assistant_message_id,
    index: 0,
    settings,
    revision: row.revision,
  });
  expect(
    (
      await db.query<{ targets: { onboarding: { videos: number } } }>(
        "select targets from public.brands where id=$1",
        [brand],
      )
    ).rows[0]!.targets.onboarding.videos,
  ).toBe(2);
  const pending = await begin();
  await db.query(
    "update public.brands set profile=jsonb_set(profile,'{note}','\"manual edit\"')where id=$1",
    [brand],
  );
  expect(await failure(() => mutate("guard", turn(pending)))).toContain("stale_revision");
});
it("expires history, purges its text on access, and enforces independent chat admission", async () => {
  const t = await complete();
  await db.query(
    "update public.assistant_messages set expires_at=now()-interval '1 second'where turn_id=$1",
    [t.turn_id],
  );
  expect(((await read("snapshot")) as { messages: unknown[] }).messages).toEqual([]);
  await mutate("cleanup");
  expect(
    (
      await db.query<{ body: null }>(
        "select body from public.assistant_messages where turn_id=$1",
        [t.turn_id],
      )
    ).rows.every((m) => m.body === null),
  ).toBe(true);
  expect(
    await failure(() =>
      mutate("begin", {
        requestId: randomUUID(),
        text: "Another",
        leaseSeconds: 240,
        retentionDays: 30,
        admission: { minute: 1, day: 10000 },
      }),
    ),
  ).toContain("rate_limited");
});
it("rejects expired leases and recovers a stale pending turn without saving its partial output", async () => {
  const t = await begin();
  await db.query(
    "update public.assistant_messages set lease_until=now()-interval '1 second'where turn_id=$1",
    [t.turn_id],
  );
  expect(await failure(() => mutate("guard", turn(t)))).toContain("stale_revision");
  const fresh = await begin("Next attempt");
  expect(fresh.replay).toBe(false);
  const old = (await read("message", { id: t.assistant_message_id })) as {
    body: null;
    status: string;
  };
  expect(old.body).toBeNull();
  expect(old.status).toBe("failed");
});
