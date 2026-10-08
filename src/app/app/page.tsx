import Link from "next/link";
import { LinkButton, buttonClasses } from "@/presentation/components/ui/button";
import { Notice, PageHeader } from "@/presentation/components/ui/page-header";
import { StateMessage } from "@/presentation/components/ui/state-message";
import { getShellScope } from "@/presentation/workspaces/shell-scope";
import { createWorkspaceAction } from "./actions";

export const dynamic = "force-dynamic";

const RESULTS: Record<string, string> = {
  "workspace-created": "Your workspace is ready.",
  invalid: "Enter a workspace name (letters, numbers and spaces are fine).",
  error: "Something went wrong. Nothing was changed.",
};

type Step = { label: string; state: "done" | "next" | "later"; note?: string; href?: string };

/** Access policy: approved (enforced by the layout and again here). Home / This week. */
export default async function HomePage({
  searchParams,
}: {
  searchParams: Promise<{ result?: string }>;
}) {
  const { result } = await searchParams;
  const scope = await getShellScope();
  const message = result ? RESULTS[result] : undefined;
  const hasBrand = scope.brands.length > 0;

  const steps: Step[] = [
    { label: "Create your workspace", state: scope.workspace ? "done" : "next" },
    {
      label: "Add a brand",
      state: hasBrand ? "done" : scope.workspace ? "next" : "later",
      href: "/app/brands",
    },
    { label: "Set goals and availability", state: "later", note: "Arrives with onboarding" },
    { label: "Review your first weekly plan", state: "later", note: "Arrives with weekly plans" },
  ];

  return (
    <div className="space-y-8">
      <PageHeader
        title="This week"
        description="What to do next, and how your week is shaping up."
      />
      {message ? <Notice>{message}</Notice> : null}

      {!scope.workspace ? (
        <section aria-labelledby="ws-heading" className="max-w-lg space-y-4">
          <h2 id="ws-heading" className="font-display text-2xl">
            Create your private workspace
          </h2>
          <p className="text-muted">
            Your brands and everything you make live here. Nobody else can see them.
          </p>
          <form action={createWorkspaceAction} className="space-y-3">
            <label className="block">
              <span className="block text-sm">Workspace name</span>
              <input
                name="name"
                required
                className="mt-1 min-h-11 w-full rounded-md border border-line bg-surface px-3"
              />
            </label>
            <button type="submit" className={buttonClasses("primary")}>
              Create workspace
            </button>
          </form>
        </section>
      ) : (
        <StateMessage
          tone="empty"
          title="No plan yet"
          action={
            hasBrand ? undefined : (
              <LinkButton href="/app/brands" variant="primary">
                Add your first brand
              </LinkButton>
            )
          }
        >
          Weekly plans are not available in this early release. When they are, your next task and a
          view of your week&apos;s capacity will appear here. For now you can set up your brands.
        </StateMessage>
      )}

      <section aria-labelledby="setup-heading">
        <h2 id="setup-heading" className="font-display text-2xl">
          Setup
        </h2>
        <ol className="mt-3 divide-y divide-line border-y border-line">
          {steps.map((step) => (
            <li
              key={step.label}
              className="flex flex-wrap items-baseline justify-between gap-2 py-3"
            >
              <span>
                {step.href && step.state === "next" ? (
                  <Link href={step.href} className="underline underline-offset-4">
                    {step.label}
                  </Link>
                ) : (
                  step.label
                )}
              </span>
              <span className="text-sm text-muted">
                {step.state === "done"
                  ? "Done"
                  : step.state === "next"
                    ? "Next"
                    : (step.note ?? "Later")}
              </span>
            </li>
          ))}
        </ol>
      </section>
    </div>
  );
}
