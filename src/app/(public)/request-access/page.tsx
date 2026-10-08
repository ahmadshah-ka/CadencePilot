import type { Metadata } from "next";
import { signInWithGoogleAction } from "@/app/actions/auth-actions";
import { LinkButton, buttonClasses } from "@/presentation/components/ui/button";
import { getPrincipal } from "@/presentation/auth/page-guards";

export const metadata: Metadata = { title: "Request access" };

const STEPS = [
  [
    "Sign in with Google",
    "This creates your account and sends a request. It does not give you access yet.",
  ],
  [
    "Wait for review",
    "The platform owner reviews each request. You can sign in at any time to see where it stands; email notifications are not sent yet.",
  ],
  [
    "Start with a private workspace",
    "Once approved, you set up your workspace and brands. Nobody else can see them.",
  ],
] as const;

/** Access policy: public. Signed-in visitors see a link onward instead of the sign-in button. */
export default async function RequestAccessPage() {
  const principal = await getPrincipal().catch(() => null);

  return (
    <div className="py-16">
      <h1 className="font-display text-5xl tracking-tight">Request access</h1>
      <p className="mt-4 max-w-prose text-lg text-muted">
        This product is in early development, so access is opened one person at a time.
      </p>

      <ol className="mt-10 max-w-3xl divide-y divide-line border-y border-line">
        {STEPS.map(([title, body], index) => (
          <li key={title} className="grid gap-2 py-6 sm:grid-cols-[3rem_1fr]">
            <span aria-hidden="true" className="font-display text-2xl text-muted">
              {index + 1}
            </span>
            <div>
              <h2 className="font-display text-2xl">{title}</h2>
              <p className="mt-1 text-muted">{body}</p>
            </div>
          </li>
        ))}
      </ol>

      <div className="mt-10">
        {principal ? (
          <LinkButton href="/app" variant="primary" size="lg">
            Continue
          </LinkButton>
        ) : (
          <form action={signInWithGoogleAction}>
            <input type="hidden" name="next" value="/app" />
            <button type="submit" className={buttonClasses("primary", "lg")}>
              Continue with Google
            </button>
          </form>
        )}
      </div>
    </div>
  );
}
