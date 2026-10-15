import { notFound } from "next/navigation";
import { z } from "zod";
import policy from "@/config/onboarding-policy.json";
import { getBrand } from "@/application/workspaces/workspace-use-cases";
import { preferenceSchemas } from "@/domain/preferences/preference-rules";
import { getWorkspaceDeps, getOwnWorkspace } from "@/presentation/workspaces/workspace-context";
import { requireApprovedPage } from "@/presentation/auth/page-guards";
import { BrandPreferenceForm } from "@/presentation/components/preferences/preference-form";
import { PageHeader } from "@/presentation/components/ui/page-header";
export const dynamic = "force-dynamic";
/** Access policy: approved plus membership, never a platform-owner override. */
export default async function BrandPreferencesPage({
  params,
}: {
  params: Promise<{ brandId: string }>;
}) {
  const { brandId } = await params;
  const principal = await requireApprovedPage(`/app/brands/${brandId}/preferences`);
  if (!z.uuid().safeParse(brandId).success) notFound();
  const workspace = await getOwnWorkspace(principal);
  if (!workspace) notFound();
  const brand = await getBrand(getWorkspaceDeps(), principal, workspace.id, brandId);
  if (brand.archivedAt) notFound();
  const candidate = {
    ...(typeof brand.profile.onboarding === "object" && brand.profile.onboarding !== null
      ? brand.profile.onboarding
      : {}),
    targets: brand.targets.onboarding ?? {},
    weeklyTargets: brand.targets.weeklyOverrides ?? [],
  };
  const parsed = preferenceSchemas(policy).brand.safeParse(candidate);
  // Older arbitrary profile JSON is retained, never guessed into confirmed onboarding facts.
  const initial = parsed.success
    ? parsed.data
    : { topic: "", audience: "", tone: "", platforms: [], targets: {}, weeklyTargets: [] };
  return (
    <div className="space-y-8">
      <PageHeader
        title={`${brand.name}: preferences`}
        description="Save what you know now. Return to fill the gaps; nothing is inferred about your audience."
      />
      <BrandPreferenceForm
        initial={initial}
        initialRevision={brand.revision}
        workspaceId={workspace.id}
        brandId={brandId}
      />
    </div>
  );
}
