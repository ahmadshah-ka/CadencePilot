import Link from "next/link";
import { signOutAction } from "@/app/actions/auth-actions";
import { buttonClasses } from "@/presentation/components/ui/button";
import { PageHeader } from "@/presentation/components/ui/page-header";
import { StateMessage } from "@/presentation/components/ui/state-message";
import { requireApprovedPage } from "@/presentation/auth/page-guards";
import { getShellScope } from "@/presentation/workspaces/shell-scope";

export const dynamic = "force-dynamic";

/** Access policy: approved. Shows only the caller's own account and workspace. */
export default async function SettingsPage() {
  const principal = await requireApprovedPage("/app/settings");
  const scope = await getShellScope();
  return (
    <div className="space-y-8">
      <PageHeader title="Settings" description="Your account and workspace." />
      <dl className="max-w-xl divide-y divide-line border-y border-line">
        <div className="grid gap-1 py-3 sm:grid-cols-[10rem_1fr]">
          <dt className="text-muted">Account status</dt>
          <dd className="capitalize">{principal.accountStatus}</dd>
        </div>
        <div className="grid gap-1 py-3 sm:grid-cols-[10rem_1fr]">
          <dt className="text-muted">Workspace</dt>
          <dd>{scope.workspace ? scope.workspace.name : "Not created yet"}</dd>
        </div>
      </dl>
      <StateMessage tone="unavailable" title="Preferences are not available yet">
        Availability, timezone and goals are set during onboarding, which is still being built.
      </StateMessage>
      <div className="flex flex-wrap gap-3">
        {principal.isOwner ? (
          <Link href="/admin" className={buttonClasses("secondary")}>
            Owner area
          </Link>
        ) : null}
        <form action={signOutAction}>
          <button type="submit" className={buttonClasses("secondary")}>
            Sign out
          </button>
        </form>
      </div>
    </div>
  );
}
