import { createServer, type IncomingMessage, type Server, type ServerResponse } from "node:http";
import { randomUUID } from "node:crypto";

/**
 * A small in-memory stand-in for the parts of the Supabase HTTP API the app uses (GoTrue user
 * lookup and PostgREST tables/RPCs), including a rough emulation of the row-level-security
 * visibility rules. It exists so browser tests can drive the REAL application code (pages, server
 * actions, adapters) without a hosted project. It is NOT Supabase: passing tests against it do not
 * verify hosted behaviour or the SQL policies (those are covered by tests/db and the runbook).
 */

type Row = Record<string, unknown>;

export interface SeedUser {
  id: string;
  email: string;
  name?: string;
  status?: "pending" | "approved" | "rejected" | "suspended";
  owner?: boolean;
}

interface State {
  users: Map<string, SeedUser>;
  access: Map<string, Row>;
  admins: Set<string>;
  workspaces: Row[];
  members: Row[];
  brands: Row[];
  audit: Row[];
}

const fresh = (): State => ({
  users: new Map(),
  access: new Map(),
  admins: new Set(),
  workspaces: [],
  members: [],
  brands: [],
  audit: [],
});

const json = (
  res: ServerResponse,
  status: number,
  body: unknown,
  headers: Record<string, string> = {},
) => {
  res.writeHead(status, { "content-type": "application/json", ...headers });
  res.end(body === undefined ? undefined : JSON.stringify(body));
};
const postgrestError = (res: ServerResponse, status: number, code: string, message: string) =>
  json(res, status, { code, message, details: null, hint: null });

function readBody(req: IncomingMessage): Promise<Row> {
  return new Promise((resolve) => {
    const chunks: Buffer[] = [];
    req.on("data", (chunk: Buffer) => chunks.push(chunk));
    req.on("end", () => {
      const text = Buffer.concat(chunks).toString("utf8");
      resolve(text ? (JSON.parse(text) as Row) : {});
    });
  });
}

function callerId(req: IncomingMessage): string | null {
  const token = (req.headers.authorization ?? "").replace(/^Bearer /i, "");
  const payload = token.split(".")[1];
  if (!payload) return null;
  try {
    const claims = JSON.parse(Buffer.from(payload, "base64url").toString("utf8")) as {
      sub?: string;
    };
    return claims.sub ?? null;
  } catch {
    return null;
  }
}

export function startFakeSupabase(port: number): Promise<Server> {
  let state = fresh();

  const isApproved = (uid: string) => state.access.get(uid)?.status === "approved";
  const isActiveMember = (uid: string, workspaceId: unknown) =>
    isApproved(uid) &&
    state.members.some(
      (m) => m.workspace_id === workspaceId && m.user_id === uid && m.revoked_at === null,
    );

  /** Rough emulation of the RLS policies in supabase/migrations. */
  function visible(table: string, row: Row, uid: string): boolean {
    switch (table) {
      case "account_access":
        return row.user_id === uid || state.admins.has(uid);
      case "platform_admins":
        return row.user_id === uid;
      case "workspaces":
        return isActiveMember(uid, row.id);
      case "workspace_members":
      case "brands":
        return isActiveMember(uid, row.workspace_id);
      default:
        return false;
    }
  }

  const tables = (): Record<string, Row[]> => ({
    account_access: [...state.access.values()],
    platform_admins: [...state.admins].map((user_id) => ({ user_id, role: "owner" })),
    workspaces: state.workspaces,
    workspace_members: state.members,
    brands: state.brands,
  });

  function matches(row: Row, params: URLSearchParams): boolean {
    for (const [key, raw] of params) {
      if (["select", "order", "limit", "offset", "or", "columns"].includes(key)) continue;
      if (raw.startsWith("eq.")) {
        if (String(row[key]) !== raw.slice(3)) return false;
      } else if (raw === "is.null") {
        if (row[key] !== null && row[key] !== undefined) return false;
      }
    }
    return true;
  }

  function rpc(name: string, args: Row, uid: string | null, res: ServerResponse) {
    if (name === "ensure_account_access") {
      const id = String(args.p_user);
      const user = state.users.get(id);
      if (user && !state.access.has(id)) {
        state.access.set(id, accessRow(user, "pending"));
      }
      return json(res, 200, null);
    }
    if (name === "create_initial_workspace") {
      if (!uid || !isApproved(uid)) return postgrestError(res, 403, "42501", "forbidden");
      const workspaceName = String(args.p_name ?? "").trim();
      if (!workspaceName || workspaceName.length > 120)
        return postgrestError(res, 400, "22023", "invalid_name");
      const existing = state.workspaces.find((w) => w.owner_user_id === uid);
      if (existing) return json(res, 200, existing.id);
      const id = randomUUID();
      state.workspaces.push({
        id,
        owner_user_id: uid,
        name: workspaceName,
        created_at: new Date().toISOString(),
      });
      state.members.push({ workspace_id: id, user_id: uid, role: "owner", revoked_at: null });
      return json(res, 200, id);
    }
    if (name === "review_account_access") {
      const actor = String(args.p_actor);
      const target = String(args.p_target);
      if (!state.admins.has(actor)) return postgrestError(res, 403, "42501", "forbidden");
      if (actor === target) return postgrestError(res, 403, "42501", "self_review_not_allowed");
      const row = state.access.get(target);
      if (!row) return postgrestError(res, 404, "P0002", "not_found");
      if (row.revision !== args.p_expected_revision)
        return postgrestError(res, 409, "CP001", "stale_revision");
      const next = transition(String(row.status), String(args.p_decision));
      if (!next) return postgrestError(res, 409, "CP002", "invalid_transition");
      row.status = next;
      row.revision = (row.revision as number) + 1;
      row.reviewed_at = new Date().toISOString();
      state.audit.push({ actor, target, decision: args.p_decision });
      return json(res, 200, [{ user_id: target, status: next, revision: row.revision }]);
    }
    return postgrestError(res, 404, "PGRST202", "unknown function");
  }

  const server = createServer(async (req, res) => {
    const url = new URL(req.url ?? "/", `http://localhost:${port}`);
    const path = url.pathname;
    const uid = callerId(req);

    try {
      // ---- test control -------------------------------------------------------------------
      if (path === "/__test/reset") {
        state = fresh();
        return json(res, 200, { ok: true });
      }
      if (path === "/__test/seed" && req.method === "POST") {
        const { users } = (await readBody(req)) as unknown as { users: SeedUser[] };
        for (const user of users) {
          state.users.set(user.id, user);
          state.access.set(user.id, accessRow(user, user.status ?? "pending"));
          if (user.owner) state.admins.add(user.id);
        }
        return json(res, 200, { ok: true });
      }
      if (path === "/__test/state") {
        return json(res, 200, {
          audit: state.audit,
          brands: state.brands.length,
          workspaces: state.workspaces.length,
        });
      }
      if (path === "/__test/revoke" && req.method === "POST") {
        const { userId } = (await readBody(req)) as { userId: string };
        for (const m of state.members)
          if (m.user_id === userId) m.revoked_at = new Date().toISOString();
        return json(res, 200, { ok: true });
      }
      if (path === "/__test/set-status" && req.method === "POST") {
        const { userId, status } = (await readBody(req)) as { userId: string; status: string };
        const row = state.access.get(userId);
        if (row) {
          row.status = status;
          row.revision = (row.revision as number) + 1;
        }
        return json(res, 200, { ok: true });
      }

      // ---- GoTrue -------------------------------------------------------------------------
      if (path === "/auth/v1/user") {
        const user = uid ? state.users.get(uid) : undefined;
        if (!user) return json(res, 401, { code: 401, msg: "invalid JWT" });
        return json(res, 200, {
          id: user.id,
          aud: "authenticated",
          role: "authenticated",
          email: user.email,
          email_confirmed_at: "2026-01-01T00:00:00Z",
          app_metadata: { provider: "google" },
          user_metadata: { full_name: user.name ?? null },
          created_at: "2026-01-01T00:00:00Z",
        });
      }
      if (path === "/auth/v1/logout") return json(res, 204, undefined);

      // ---- PostgREST ----------------------------------------------------------------------
      if (path.startsWith("/rest/v1/rpc/")) {
        return rpc(path.slice("/rest/v1/rpc/".length), await readBody(req), uid, res);
      }
      if (path.startsWith("/rest/v1/")) {
        const table = path.slice("/rest/v1/".length);
        const all = tables()[table];
        if (!all || !uid) return postgrestError(res, 401, "42501", "permission denied");
        const accept = req.headers.accept ?? "";
        const wantsObject = accept.includes("vnd.pgrst.object");
        const prefersRepresentation = String(req.headers.prefer ?? "").includes(
          "return=representation",
        );

        if (req.method === "POST") {
          if (table !== "brands") return postgrestError(res, 403, "42501", "permission denied");
          const body = await readBody(req);
          if (!isActiveMember(uid, body.workspace_id)) {
            return postgrestError(
              res,
              403,
              "42501",
              'new row violates row-level security policy for table "brands"',
            );
          }
          const name = String(body.name);
          const duplicate = state.brands.some(
            (b) =>
              b.workspace_id === body.workspace_id &&
              !b.archived_at &&
              String(b.name).toLowerCase() === name.toLowerCase(),
          );
          if (duplicate)
            return postgrestError(
              res,
              409,
              "23505",
              "duplicate key value violates unique constraint",
            );
          const now = new Date().toISOString();
          const row: Row = {
            id: randomUUID(),
            workspace_id: body.workspace_id,
            name,
            profile: body.profile ?? {},
            targets: body.targets ?? {},
            revision: 1,
            archived_at: null,
            created_at: now,
            updated_at: now,
          };
          state.brands.push(row);
          return prefersRepresentation
            ? json(res, 201, wantsObject ? row : [row])
            : json(res, 201, undefined);
        }

        let rows = all.filter((row) => visible(table, row, uid) && matches(row, url.searchParams));

        if (req.method === "PATCH") {
          if (table !== "brands") return postgrestError(res, 403, "42501", "permission denied");
          const patch = await readBody(req);
          for (const row of rows) {
            Object.assign(row, patch, {
              revision: (row.revision as number) + 1,
              updated_at: new Date().toISOString(),
            });
          }
          if (!prefersRepresentation) return json(res, 204, undefined);
          return wantsObject && rows.length !== 1
            ? postgrestError(res, 406, "PGRST116", "no rows")
            : json(res, 200, wantsObject ? rows[0] : rows);
        }

        const order = url.searchParams.get("order");
        if (order) {
          const keys = order.split(",").map((part) => part.split(".")[0]!);
          rows = [...rows].sort((a, b) => {
            for (const key of keys) {
              const cmp = String(a[key]).localeCompare(String(b[key]));
              if (cmp !== 0) return cmp;
            }
            return 0;
          });
        }
        const limit = Number(url.searchParams.get("limit") ?? rows.length);
        if (req.method === "HEAD") {
          res.writeHead(200, { "content-range": `0-0/${rows.length}` });
          return res.end();
        }
        const page = rows.slice(0, limit);
        const range = { "content-range": `0-${Math.max(0, page.length - 1)}/${rows.length}` };
        if (wantsObject) {
          return page.length === 1
            ? json(res, 200, page[0], range)
            : postgrestError(
                res,
                406,
                "PGRST116",
                "JSON object requested, multiple (or no) rows returned",
              );
        }
        return json(res, 200, page, range);
      }

      return json(res, 404, { message: "not found" });
    } catch (error) {
      return json(res, 500, { message: String(error) });
    }
  });

  return new Promise((resolve) => server.listen(port, "127.0.0.1", () => resolve(server)));
}

function accessRow(user: SeedUser, status: string): Row {
  return {
    user_id: user.id,
    email: user.email,
    display_name: user.name ?? null,
    status,
    revision: 1,
    created_at: new Date().toISOString(),
    reviewed_at: null,
  };
}

function transition(current: string, decision: string): string | null {
  if (decision === "approve" && (current === "pending" || current === "rejected"))
    return "approved";
  if (decision === "reject" && current === "pending") return "rejected";
  if (decision === "suspend" && current === "approved") return "suspended";
  if (decision === "reinstate" && current === "suspended") return "approved";
  return null;
}
