import { redirect } from "next/navigation";
import { signInWithGoogleAction } from "@/app/actions/auth-actions";
import { sanitizeNextPath } from "@/domain/access/safe-redirect";
import { buttonClasses } from "@/presentation/components/ui/button";
import { CenteredPage } from "@/presentation/components/ui/centered-page";
import { getPrincipal } from "@/presentation/auth/page-guards";
import { getProductName } from "@/presentation/site/product-name";

export const dynamic = "force-dynamic";

export const metadata = { title: "Sign in" };

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
  if (await getPrincipal().catch(() => null)) redirect(sanitizeNextPath(next));
  const message = error ? MESSAGES[error] : undefined;

  return (
    <CenteredPage productName={getProductName()}>
      <h1 className="font-display text-4xl tracking-tight">Sign in</h1>
      <p className="text-muted">
        Access is by approval. Sign in with Google to request access or continue.
      </p>
      {message ? (
        <p role="alert" className="rounded-md border border-danger px-4 py-3 text-sm">
          {message}
        </p>
      ) : null}
      <form action={signInWithGoogleAction}>
        <input type="hidden" name="next" value={sanitizeNextPath(next)} />
        <button type="submit" className={`${buttonClasses("primary", "lg")} w-full`}>
          Continue with Google
        </button>
      </form>
    </CenteredPage>
  );
}
