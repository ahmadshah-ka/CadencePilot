import Link from "next/link";
import { LinkButton } from "@/presentation/components/ui/button";
import { WorkflowDemo } from "@/presentation/components/site/workflow-demo";
import {
  DEMO_AVAILABILITY,
  DEMO_DISCLAIMER,
  DEMO_PLAN,
  formatMinutes,
  summarizeCapacity,
} from "@/presentation/site/demo-data";
import { getProductName } from "@/presentation/site/product-name";

const PRINCIPLES = [
  {
    title: "Start from your real week",
    body: "Plans are built from the hours you actually have. When a plan is too big, you see the conflict and a suggested reduction instead of a guilt-inducing to-do list.",
  },
  {
    title: "Research before you record",
    body: "Every topic opens to a brief with dated sources, supported and disputed claims, and the gaps that remain, so you can speak with confidence about what is known.",
  },
  {
    title: "Track what really happened",
    body: "Recorded, edited and published are separate facts. One video posted in three places is one original and three publications, and suggestions never count as finished work.",
  },
] as const;

/** Access policy: public. */
export default function ProductPage() {
  const name = getProductName();
  const capacity = summarizeCapacity(DEMO_AVAILABILITY, DEMO_PLAN);

  return (
    <>
      <section className="grid items-center gap-12 py-16 lg:grid-cols-[1.1fr_0.9fr] lg:py-24">
        <div>
          <p className="text-sm uppercase tracking-widest text-muted">
            Content planning, grounded in evidence
          </p>
          <h1 className="mt-4 font-display text-5xl leading-[1.05] tracking-tight sm:text-6xl">
            Turn good ideas into a week you can finish.
          </h1>
          <p className="mt-6 max-w-xl text-lg text-muted">
            {name} combines your brand goals, your actual availability and researched, cited topics
            to propose an achievable weekly creation schedule, then helps you track what you made
            and published.
          </p>
          <div className="mt-8 flex flex-wrap gap-3">
            <LinkButton href="/request-access" variant="primary" size="lg">
              Request access
            </LinkButton>
            <LinkButton href="#demo" variant="secondary" size="lg">
              See the workflow
            </LinkButton>
          </div>
          <p className="mt-4 text-sm text-muted">
            Early development. Access is granted by approval while the first features are built.
          </p>
        </div>

        <aside
          aria-label="Example weekly plan"
          className="rounded-xl border border-line bg-surface p-6"
        >
          <p className="mb-4 inline-block rounded-full border border-line px-3 py-1 text-xs text-muted">
            {DEMO_DISCLAIMER}
          </p>
          <p className="text-sm text-muted">Example week</p>
          <p className="font-display text-3xl">
            {formatMinutes(capacity.plannedMinutes)}{" "}
            <span className="text-lg text-muted">
              of {formatMinutes(capacity.availableMinutes)} available
            </span>
          </p>
          <ul className="mt-4 divide-y divide-line">
            {DEMO_PLAN.map((item) => (
              <li key={item.id} className="flex items-baseline justify-between gap-4 py-3">
                <span>
                  <span className="text-sm text-muted">
                    {item.day} · {item.kind}
                  </span>
                  <span className="block text-sm">{item.title}</span>
                </span>
                <span className="shrink-0 text-sm text-muted">{formatMinutes(item.minutes)}</span>
              </li>
            ))}
          </ul>
        </aside>
      </section>

      <section aria-labelledby="principles" className="border-t border-line py-16">
        <h2 id="principles" className="sr-only">
          Principles
        </h2>
        <div className="grid gap-10 md:grid-cols-3">
          {PRINCIPLES.map((item) => (
            <div key={item.title}>
              <h3 className="font-display text-2xl">{item.title}</h3>
              <p className="mt-3 text-muted">{item.body}</p>
            </div>
          ))}
        </div>
      </section>

      <section
        id="demo"
        aria-labelledby="demo-heading"
        className="scroll-mt-8 border-t border-line py-16"
      >
        <h2 id="demo-heading" className="font-display text-4xl tracking-tight">
          The weekly workflow
        </h2>
        <p className="mt-3 max-w-prose text-muted">
          Step through a week from first brand to weekly review. Everything below is a made-up
          example to show how the product is designed to work.
        </p>
        <div className="mt-8">
          <WorkflowDemo />
        </div>
      </section>

      <section
        aria-labelledby="research-teaser"
        className="grid gap-8 border-t border-line py-16 md:grid-cols-2"
      >
        <div>
          <h2 id="research-teaser" className="font-display text-4xl tracking-tight">
            Research you can check
          </h2>
          <p className="mt-3 text-muted">
            Claims link to their sources. Event, publication and retrieval dates are kept apart.
            Disputed and unsupported claims are labelled instead of hidden.
          </p>
        </div>
        <div className="md:pt-3">
          <Link href="/research" className="underline underline-offset-4">
            How research works
          </Link>
        </div>
      </section>

      <section
        aria-labelledby="access-heading"
        className="rounded-xl border border-line bg-sunken px-6 py-12 text-center sm:px-12"
      >
        <h2 id="access-heading" className="font-display text-4xl tracking-tight">
          Access is by approval
        </h2>
        <p className="mx-auto mt-3 max-w-prose text-muted">
          Sign in with Google to request access. The platform owner reviews each request, and you
          get a private workspace for your brands once approved.
        </p>
        <div className="mt-6">
          <LinkButton href="/request-access" variant="primary" size="lg">
            Request access
          </LinkButton>
        </div>
      </section>
    </>
  );
}
