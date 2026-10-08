import { getContainer } from "@/infrastructure/composition";
import { requireOwnerPage } from "@/presentation/auth/page-guards";
import { MfaForm } from "./mfa-form";

export const dynamic = "force-dynamic";

/** Access policy: owner without the MFA requirement (this page is how an owner satisfies it). */
export default async function MfaPage() {
  await requireOwnerPage("/admin/mfa", { allowWithoutMfa: true });
  const { verifiedFactorId } = await getContainer().session.getMfaState();
  return (
    <main className="mx-auto max-w-md space-y-4 p-6">
      <h1 className="text-2xl font-semibold">Two-step verification</h1>
      <p style={{ color: "var(--color-muted)" }}>
        Owner actions require a code from your authenticator app.
      </p>
      <MfaForm existingFactorId={verifiedFactorId} />
    </main>
  );
}
