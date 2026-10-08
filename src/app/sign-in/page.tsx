import { redirect } from "next/navigation";
import { signInWithGoogleAction } from "@/app/actions/auth-actions";
import { sanitizeNextPath } from "@/domain/access/safe-redirect";
import { getPrincipal } from "@/presentation/auth/page-guards";

export const dynamic = "force-dynamic";

const MESSAGES: Record<string, string> = {
  cancelled: "Sign-in was cancelled. You can try again whenever you are ready.",
  failed: "Sign-in could not be completed. Please try again.",
  unavailable: "Sign-in is temporarily unavailable. Please try again shortly.",
};

/** Access policy: public. Already-signed-in users are sent on to the app. */
export default async function SignInPage({
  searchParams,
}: {
  searchParams: Promise<{ next?: string; error?: string }>;
}) {
  const { next, error } = await searchParams;
  if (await getPrincipal()) redirect(sanitizeNextPath(next));
  const message = error ? MESSAGES[error] : undefined;

  return (
    <main className="mx-auto flex min-h-screen max-w-md flex-col justify-center gap-6 p-6">
      <h1 className="text-2xl font-semibold">Sign in</h1>
      <p style={{ color: "var(--color-muted)" }}>
        Access is by approval. Sign in with Google to request access or continue.
      </p>
      {message ? (
        <p role="alert" className="rounded-md border p-3">
          {message}
        </p>
      ) : null}
      <form action={signInWithGoogleAction}>
        <input type="hidden" name="next" value={sanitizeNextPath(next)} />
        <button
          type="submit"
          className="w-full rounded-md px-4 py-3 font-medium text-white focus-visible:outline-2 focus-visible:outline-offset-2"
          style={{ background: "var(--color-accent)" }}
        >
          Continue with Google
        </button>
      </form>
    </main>
  );
}
