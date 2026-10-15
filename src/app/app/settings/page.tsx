import Link from "next/link";
import { signOutAction } from "@/app/actions/auth-actions";
import { buttonClasses } from "@/presentation/components/ui/button";
import { PageHeader } from "@/presentation/components/ui/page-header";
import policy from "@/config/onboarding-policy.json";
import { getPreferences } from "@/application/preferences/preference-use-cases";
import { getContainer } from "@/infrastructure/composition";
import { PersonalPreferenceForm } from "@/presentation/components/preferences/preference-form";
import { requireApprovedPage } from "@/presentation/auth/page-guards";
import { getShellScope } from "@/presentation/workspaces/shell-scope";

export const dynamic = "force-dynamic";

/** Access policy: approved. Shows only the caller's own account and workspace. */
export default async function SettingsPage() {
  const principal = await requireApprovedPage("/app/settings");
  const scope = await getShellScope();
  const saved = await getPreferences(
    { preferences: getContainer().preferences, policy },
    principal,
  );
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
      <PersonalPreferenceForm
        initial={saved?.settings ?? { timezone: "", availability: [], weeklyAvailability: [] }}
        initialRevision={saved?.revision ?? 0}
      />
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
