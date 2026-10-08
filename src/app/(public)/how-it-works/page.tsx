import type { Metadata } from "next";
import { LinkButton } from "@/presentation/components/ui/button";

export const metadata: Metadata = { title: "How it works" };

const STEPS = [
  [
    "Request access",
    "Sign in with Google. Your request waits for the platform owner; until it is approved nothing in the product is available to you.",
  ],
  [
    "Set up your brands",
    "You get a private workspace and add the brands you create for, with their audiences, goals and tone. Brands never mix with each other or with anyone else's.",
  ],
  [
    "Say when you can work",
    "Share your weekly availability and any shifts or overrides. A target is a preference you can change, not a promise the plan must keep.",
  ],
  [
    "Review a proposed week",
    "The plan fits your hours or shows exactly where it does not. It stays a draft until you accept it.",
  ],
  [
    "Open a topic, then create",
    "Each topic opens to a researched brief with cited sources. Record, edit, make derivatives such as shorts and captions, and publish where you choose.",
  ],
  [
    "Tick what actually happened",
    "Mark recorded, edited and published separately. Review the week and plan the next one from what you really did.",
  ],
] as const;

/** Access policy: public. */
export default function HowItWorksPage() {
  return (
    <div className="py-16">
      <h1 className="font-display text-5xl tracking-tight">How it works</h1>
      <p className="mt-4 max-w-prose text-lg text-muted">
        From a brand and a few free evenings to a plan you can finish and a record of what you made.
      </p>

      <ol className="mt-12 max-w-3xl divide-y divide-line border-y border-line">
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

      <section aria-labelledby="approval" className="mt-16 max-w-3xl">
        <h2 id="approval" className="font-display text-3xl">
          Why access is by approval
        </h2>
        <p className="mt-3 text-muted">
          Research and AI assistance have real costs and real limits, so access is opened gradually.
          The owner approves or declines each request, can suspend access, and every decision is
          recorded. The owner cannot browse your conversations or your work.
        </p>
      </section>

      <section
        aria-labelledby="status"
        className="mt-16 max-w-3xl rounded-xl border border-line bg-sunken p-6"
      >
        <h2 id="status" className="font-display text-3xl">
          Where things stand
        </h2>
        <p className="mt-3 text-muted">
          This product is in early development. Available now: Google sign-in, owner-approved
          access, private workspaces and brands. Still being built: onboarding questions, research
          briefs, weekly plans, the calendar, reminders and progress views. The walkthrough on the
          home page is an illustration of the design, not a live feature.
        </p>
      </section>

      <div className="mt-12">
        <LinkButton href="/request-access" variant="primary" size="lg">
          Request access
        </LinkButton>
      </div>
    </div>
  );
}
