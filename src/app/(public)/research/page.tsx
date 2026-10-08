import type { Metadata } from "next";

export const metadata: Metadata = { title: "Research" };

const METHOD = [
  [
    "Ask a clear question",
    "A topic is broken into sub-questions, and the plan for searching is saved with the brief.",
  ],
  [
    "Gather and read sources",
    "Relevant primary records and reputable secondary interpretation are collected. Search snippets are only leads; a source has to be read before it supports anything.",
  ],
  [
    "Corroborate",
    "Important claims are checked against independent sources. Reports that repeat each other are traced back to where they began.",
  ],
  [
    "Look for disagreement",
    "Conflicting evidence is searched for on purpose, and gaps are followed up when they matter.",
  ],
  [
    "Write the brief",
    "A summary comes first, then the timeline, the evidence, an angle and an outline, with every claim linked to its sources.",
  ],
] as const;

const STATUSES = [
  ["Supported", "Sources you can open back the claim, with the reasoning shown."],
  ["Disputed", "Credible sources disagree. Both sides are shown."],
  ["Insufficient", "Not enough accessible evidence yet. It is not presented as fact."],
] as const;

/** Access policy: public. */
export default function ResearchPage() {
  return (
    <div className="py-16">
      <h1 className="font-display text-5xl tracking-tight">Research you can check</h1>
      <p className="mt-4 max-w-prose text-lg text-muted">
        Briefs are meant to help you understand a topic well enough to talk about it, and to show
        how they got there.
      </p>

      <ol className="mt-12 max-w-3xl divide-y divide-line border-y border-line">
        {METHOD.map(([title, body], index) => (
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

      <section aria-labelledby="statuses" className="mt-16 max-w-3xl">
        <h2 id="statuses" className="font-display text-3xl">
          How claims are labelled
        </h2>
        <dl className="mt-4 divide-y divide-line border-y border-line">
          {STATUSES.map(([term, description]) => (
            <div key={term} className="grid gap-1 py-4 sm:grid-cols-[10rem_1fr]">
              <dt className="font-medium">{term}</dt>
              <dd className="text-muted">{description}</dd>
            </div>
          ))}
        </dl>
        <p className="mt-4 text-muted">
          Three dates are always kept apart: when something happened, when a source was published,
          and when it was retrieved. Every brief shows its research cutoff, and refreshing it
          creates a new version instead of overwriting the old one.
        </p>
      </section>

      <section
        aria-labelledby="limits"
        className="mt-16 max-w-3xl rounded-xl border border-line bg-sunken p-6"
      >
        <h2 id="limits" className="font-display text-3xl">
          What to keep in mind
        </h2>
        <ul className="mt-3 list-disc space-y-2 pl-5 text-muted">
          <li>
            Sources can be wrong, biased or incomplete, including primary ones. The brief shows the
            evidence so you can judge.
          </li>
          <li>
            An AI model checking another model&apos;s work is not independent verification, so
            citations link to real sources.
          </li>
          <li>Sources that cannot be accessed are labelled and are not used to support claims.</li>
          <li>
            No claim is made that this is the best research tool available. How well it works will
            be measured and reported honestly.
          </li>
          <li>Research is not yet available in this early release.</li>
        </ul>
      </section>
    </div>
  );
}
