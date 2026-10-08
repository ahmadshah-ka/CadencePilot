import Link from "next/link";
import { signOutAction } from "@/app/actions/auth-actions";
import { listAccounts } from "@/application/access/access-use-cases";
import { ACCOUNT_STATUSES, type AccountStatus } from "@/domain/access/account-status";
import { getContainer } from "@/infrastructure/composition";
import { reviewAccountAction } from "./actions";
import { getAppConfig, requireOwnerPage } from "@/presentation/auth/page-guards";

export const dynamic = "force-dynamic";

const RESULT_MESSAGES: Record<string, string> = {
  ok: "Change saved.",
  stale: "That request changed since you loaded it. Review the current state and try again.",
  forbidden: "You are not allowed to do that.",
  invalid: "That request was not valid.",
  error: "Something went wrong. Nothing was changed.",
};

const ACTIONS: Record<AccountStatus, Array<{ decision: string; label: string }>> = {
  pending: [
    { decision: "approve", label: "Approve" },
    { decision: "reject", label: "Reject…" },
  ],
  approved: [{ decision: "suspend", label: "Suspend…" }],
  rejected: [{ decision: "approve", label: "Approve" }],
  suspended: [{ decision: "reinstate", label: "Reinstate" }],
};

/** Access policy: owner (+MFA when configured). Non-owners receive a 404. */
export default async function AdminPage({
  searchParams,
}: {
  searchParams: Promise<{ status?: string; cursor?: string; result?: string }>;
}) {
  const principal = await requireOwnerPage("/admin");
  const params = await searchParams;
  const status: AccountStatus = (ACCOUNT_STATUSES as readonly string[]).includes(
    params.status ?? "",
  )
    ? (params.status as AccountStatus)
    : "pending";
  const config = getAppConfig();
  const page = await listAccounts(
    { access: getContainer().access, ownerMfaRequired: config.ownerMfaRequired },
    principal,
    { status, cursor: params.cursor ?? null, limit: config.limits.listPageSize },
  );
  const message = params.result ? RESULT_MESSAGES[params.result] : undefined;

  return (
    <main className="mx-auto max-w-4xl space-y-6 p-6">
      <header className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold">Access requests</h1>
        <form action={signOutAction}>
          <button type="submit" className="rounded-md border px-3 py-1.5">
            Sign out
          </button>
        </form>
      </header>
      {message ? (
        <p role="status" className="rounded-md border p-3">
          {message}
        </p>
      ) : null}
      <nav aria-label="Filter by status" className="flex gap-2">
        {ACCOUNT_STATUSES.map((value) => (
          <Link
            key={value}
            href={`/admin?status=${value}`}
            aria-current={value === status ? "page" : undefined}
            className="rounded-md border px-3 py-1.5 capitalize aria-[current=page]:font-semibold"
          >
            {value}
          </Link>
        ))}
      </nav>
      {page.items.length === 0 ? (
        <p style={{ color: "var(--color-muted)" }}>No {status} accounts.</p>
      ) : (
        <ul className="divide-y rounded-md border">
          {page.items.map((account) => (
            <li
              key={account.userId}
              className="flex flex-wrap items-center justify-between gap-3 p-4"
            >
              <div>
                <p className="font-medium">{account.displayName ?? "(no name)"}</p>
                <p className="text-sm" style={{ color: "var(--color-muted)" }}>
                  {account.email ?? "(no email)"} · requested{" "}
                  {new Date(account.createdAt).toISOString().slice(0, 10)}
                </p>
              </div>
              <div className="flex gap-2">
                {ACTIONS[account.status].map((action) => (
                  <form key={action.decision} action={reviewAccountAction}>
                    <input type="hidden" name="userId" value={account.userId} />
                    <input type="hidden" name="decision" value={action.decision} />
                    <input type="hidden" name="expectedRevision" value={account.revision} />
                    <button type="submit" className="rounded-md border px-3 py-1.5">
                      {action.label}
                    </button>
                  </form>
                ))}
              </div>
            </li>
          ))}
        </ul>
      )}
      {page.nextCursor ? (
        <Link
          href={`/admin?status=${status}&cursor=${encodeURIComponent(page.nextCursor)}`}
          className="underline"
        >
          Next page
        </Link>
      ) : null}
    </main>
  );
}
