import { createDatabase, as } from "../db/harness";
type Row = Record<string, unknown>;
interface Snapshot {
  users: Iterable<{ id: string; email: string }>;
  access: Iterable<Row>;
  workspaces: Row[];
  members: Row[];
  brands: Row[];
}
const TABLE_COLUMNS: Record<string, string[]> = {
  content_items: [
    "id",
    "workspace_id",
    "brand_id",
    "parent_id",
    "series_id",
    "kind",
    "format",
    "title",
    "source_url",
    "source_transcript",
    "notes",
    "production_stage",
    "revision",
    "archived_at",
    "created_at",
  ],
  series: ["id", "workspace_id", "brand_id", "title", "revision", "archived_at", "created_at"],
  tasks: [
    "id",
    "workspace_id",
    "brand_id",
    "content_id",
    "stage",
    "position",
    "completed_at",
    "revision",
  ],
  publications: [
    "id",
    "workspace_id",
    "brand_id",
    "content_id",
    "platform",
    "published_at",
    "url",
    "revision",
  ],
};
const RPC_ARGS: Record<string, string[]> = {
  assistant_read: ["p_workspace", "p_brand", "p_kind", "p_args"],
  assistant_mutate: ["p_user", "p_workspace", "p_brand", "p_operation", "p_data"],
  create_manual_content: [
    "p_workspace",
    "p_brand",
    "p_request",
    "p_title",
    "p_format",
    "p_parent",
    "p_series",
  ],
  edit_manual_content: [
    "p_workspace",
    "p_brand",
    "p_id",
    "p_revision",
    "p_title",
    "p_url",
    "p_transcript",
    "p_notes",
  ],
  archive_manual_content: ["p_workspace", "p_brand", "p_id", "p_revision", "p_archived"],
  set_manual_content_task: [
    "p_workspace",
    "p_brand",
    "p_id",
    "p_revision",
    "p_stage",
    "p_completed",
  ],
  save_manual_publication: [
    "p_workspace",
    "p_brand",
    "p_id",
    "p_revision",
    "p_platform",
    "p_published_at",
    "p_url",
  ],
  create_manual_series: ["p_workspace", "p_brand", "p_request", "p_title"],
  edit_manual_series: ["p_workspace", "p_brand", "p_id", "p_revision", "p_title", "p_archived"],
};
export const CONTENT_TEST_TABLES = new Set(Object.keys(TABLE_COLUMNS));
export const CONTENT_TEST_RPCS = new Set(Object.keys(RPC_ARGS));
/** Browser-test bridge uses the real migration SQL in isolated in-process Postgres, not invented content rules. */
export async function createContentStore() {
  const db = await createDatabase();
  let tail = Promise.resolve();
  async function sync(s: Snapshot) {
    for (const u of s.users)
      await db.query(
        "insert into auth.users(id,email,email_confirmed_at) values($1,$2,now()) on conflict(id) do nothing",
        [u.id, u.email],
      );
    for (const a of s.access)
      await db.query("update public.account_access set status=$2 where user_id=$1", [
        a.user_id,
        a.status,
      ]);
    for (const w of s.workspaces)
      await db.query(
        "insert into public.workspaces(id,owner_user_id,name)values($1,$2,$3)on conflict(id)do nothing",
        [w.id, w.owner_user_id, w.name],
      );
    for (const m of s.members)
      await db.query(
        "insert into public.workspace_members(workspace_id,user_id,role,revoked_at)values($1,$2,$3,$4)on conflict(workspace_id,user_id)do update set revoked_at=excluded.revoked_at",
        [m.workspace_id, m.user_id, m.role, m.revoked_at],
      );
    for (const b of s.brands)
      await db.query(
        "insert into public.brands(id,workspace_id,name,profile,targets,archived_at)values($1,$2,$3,$4,$5,$6)on conflict(id)do update set archived_at=excluded.archived_at",
        [b.id, b.workspace_id, b.name, b.profile ?? {}, b.targets ?? {}, b.archived_at],
      );
  }
  async function execute(
    snapshot: Snapshot,
    userId: string | null,
    work: () => Promise<unknown>,
    service = false,
  ) {
    // Serialize role changes so parallel HTTP requests cannot borrow each other's test identity.
    const result = tail.then(async () => {
      await sync(snapshot);
      return as(db, service ? "service" : userId ? { sub: userId } : "anon", work);
    });
    tail = result.then(
      () => undefined,
      () => undefined,
    );
    return result;
  }
  return {
    close: () => db.close(),
    rpc: (snapshot: Snapshot, userId: string | null, name: string, body: Row, service = false) =>
      execute(
        snapshot,
        userId,
        async () => {
          const names = RPC_ARGS[name];
          if (!names) throw new Error("unknown content RPC");
          const placeholders = names.map((_, index) => `$${index + 1}`).join(",");
          const result = await db.query<{ value: unknown }>(
            `select public.${name}(${placeholders}) as value`,
            names.map((key) => body[key] ?? null),
          );
          return result.rows[0]?.value ?? null;
        },
        service,
      ),
    read: (snapshot: Snapshot, userId: string | null, table: string, params: URLSearchParams) =>
      execute(snapshot, userId, async () => {
        const columns = TABLE_COLUMNS[table];
        if (!columns) throw new Error("unknown content table");
        const selected = (params.get("select") ?? "").split(",");
        if (selected.some((column) => !columns.includes(column)))
          throw new Error("unsupported column");
        const conditions: string[] = [],
          values: unknown[] = [];
        for (const [column, raw] of params) {
          if (!columns.includes(column)) continue;
          if (raw.startsWith("eq.")) {
            values.push(raw.slice(3));
            conditions.push(`${column}=$${values.length}`);
          } else if (raw === "is.null") conditions.push(`${column} is null`);
        }
        const cursor = params.get("or");
        if (cursor) {
          const match = /created_at\.gt\."([0-9TZ:.+-]+)".*id\.gt\.([0-9a-f-]{36})/i.exec(cursor);
          if (!match) throw new Error("invalid cursor");
          values.push(match[1], match[2]);
          conditions.push(
            `(created_at,id)>($${values.length - 1}::timestamptz,$${values.length}::uuid)`,
          );
        }
        const order = (params.get("order") ?? "")
          .split(",")
          .filter(Boolean)
          .map((value) => {
            const [column, direction] = value.split(".");
            if (
              !column ||
              !columns.includes(column) ||
              !["asc", "desc"].includes(direction ?? "asc")
            )
              throw new Error("invalid sort");
            return `${column} ${direction ?? "asc"}`;
          });
        const limit = Number(params.get("limit") ?? 100);
        if (!Number.isSafeInteger(limit) || limit < 1 || limit > 101)
          throw new Error("invalid limit");
        values.push(limit);
        const result = await db.query(
          `select ${selected.join(",")} from public.${table}${conditions.length ? ` where ${conditions.join(" and ")}` : ""}${order.length ? ` order by ${order.join(",")}` : ""} limit $${values.length}`,
          values,
        );
        return result.rows;
      }),
  };
}
