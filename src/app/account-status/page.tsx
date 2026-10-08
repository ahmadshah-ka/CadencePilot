import { redirect } from "next/navigation";
import { signOutAction } from "@/app/actions/auth-actions";
import { getPrincipal, SIGN_IN_PATH } from "@/presentation/auth/page-guards";

export const dynamic = "force-dynamic";

const COPY = {
  pending: {
    title: "Request received",
    body: "Your account is waiting for approval. You can use the product once it has been approved.",
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
    <main className="mx-auto flex min-h-screen max-w-md flex-col justify-center gap-4 p-6">
      <h1 className="text-2xl font-semibold">{copy.title}</h1>
      <p role="status" style={{ color: "var(--color-muted)" }}>
        {copy.body}
      </p>
      <form action={signOutAction}>
        <button type="submit" className="rounded-md border px-4 py-2">
          Sign out
        </button>
      </form>
    </main>
  );
}
