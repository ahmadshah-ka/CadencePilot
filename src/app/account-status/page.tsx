import { redirect } from "next/navigation";
import { signOutAction } from "@/app/actions/auth-actions";
import { buttonClasses } from "@/presentation/components/ui/button";
import { CenteredPage } from "@/presentation/components/ui/centered-page";
import { getPrincipal, SIGN_IN_PATH } from "@/presentation/auth/page-guards";
import { getProductName } from "@/presentation/site/product-name";

export const dynamic = "force-dynamic";

export const metadata = { title: "Account status" };

const COPY = {
  pending: {
    title: "Request received",
    body: "Your account is waiting for approval. You can use the product once it has been approved. Sign in again later to check; email notifications are not sent yet.",
  },
  rejected: {
    title: "Access not granted",
    body: "Your access request was not approved. Contact the platform owner if you think this is a mistake.",
  },
  suspended: {
    title: "Access suspended",
    body: "Your access has been suspended. Contact the platform owner for more information.",
  },
  unknown: {
    title: "Account not ready",
    body: "Your account is still being set up. Please try again in a moment.",
  },
} as const;

/** Access policy: authenticated. Loads no product data, only the caller's own status. */
export default async function AccountStatusPage() {
  const principal = await getPrincipal();
  if (!principal) redirect(SIGN_IN_PATH);
  if (principal.accountStatus === "approved") redirect("/app");
  const copy = COPY[principal.accountStatus ?? "unknown"];

  return (
    <CenteredPage productName={getProductName()}>
      <h1 className="font-display text-4xl tracking-tight">{copy.title}</h1>
      <p role="status" className="text-muted">
        {copy.body}
      </p>
      <form action={signOutAction}>
        <button type="submit" className={buttonClasses("secondary")}>
          Sign out
        </button>
      </form>
    </CenteredPage>
  );
}
