import Link from "next/link";
import { signOutAction } from "@/app/actions/auth-actions";
import { requireApprovedPage } from "@/presentation/auth/page-guards";

export const dynamic = "force-dynamic";

/** Access policy: approved. Placeholder until the application shell (feature 04). */
export default async function AppHomePage() {
  const principal = await requireApprovedPage("/app");
  return (
    <main className="mx-auto max-w-2xl space-y-4 p-6">
      <h1 className="text-2xl font-semibold">You are approved</h1>
      <p style={{ color: "var(--color-muted)" }}>Your account has access to the product.</p>
      {principal.isOwner ? (
        <Link href="/admin" className="underline">
          Owner area
        </Link>
      ) : null}
      <form action={signOutAction}>
        <button type="submit" className="rounded-md border px-4 py-2">
          Sign out
        </button>
      </form>
    </main>
  );
}
