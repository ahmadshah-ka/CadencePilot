import { getContainer } from "@/infrastructure/composition";
import { requireOwnerPage } from "@/presentation/auth/page-guards";
import { PageHeader } from "@/presentation/components/ui/page-header";
import { MfaForm } from "./mfa-form";

export const dynamic = "force-dynamic";

/** Access policy: owner without the MFA requirement (this page is how an owner satisfies it). */
export default async function MfaPage() {
  await requireOwnerPage("/admin/mfa", { allowWithoutMfa: true });
  const { verifiedFactorId } = await getContainer().session.getMfaState();
  return (
    <div className="max-w-md space-y-6">
      <PageHeader
        title="Two-step verification"
        description="Owner actions require a code from your authenticator app."
      />
      <MfaForm existingFactorId={verifiedFactorId} />
    </div>
  );
}
