"use client";

import { useId, useState } from "react";
import {
  DEMO_AVAILABILITY,
  DEMO_BRANDS,
  DEMO_CLAIMS,
  DEMO_DISCLAIMER,
  DEMO_PLAN,
  DEMO_PLATFORMS,
  DEMO_SOURCES,
  formatMinutes,
  summarizeCapacity,
} from "@/presentation/site/demo-data";

const STEPS = [
  {
    id: "brands",
    title: "Add your brands",
    summary:
      "Each brand has its own audience, goals and history, kept apart from your other brands.",
  },
  {
    id: "availability",
    title: "Set your availability",
    summary: "Tell it when you can really work. A weekly target is a preference, not a promise.",
  },
  {
    id: "plan",
    title: "Review the plan",
    summary: "A proposed week that fits your time. Nothing is scheduled until you accept it.",
  },
  {
    id: "topic",
    title: "Open a cited topic",
    summary:
      "Every topic opens to a brief: what is established, what is disputed, and where it came from.",
  },
  {
    id: "record",
    title: "Record",
    summary:
      "Start with the summary and outline. Recording does not depend on the research being finished.",
  },
  {
    id: "derive",
    title: "Create derivatives",
    summary: "Shorts and captions link back to the original so the work stays connected.",
  },
  {
    id: "publish",
    title: "Publish",
    summary: "Recorded, edited and published are tracked as separate facts, per platform.",
  },
  {
    id: "review",
    title: "Review the week",
    summary: "See what you actually finished, then plan the next week from reality.",
  },
] as const;

type StepId = (typeof STEPS)[number]["id"];

const STATUS_STYLE = {
  supported: "text-success",
  disputed: "text-warning",
  insufficient: "text-muted",
} as const;

function Panel({ step }: { step: StepId }) {
  const capacity = summarizeCapacity(DEMO_AVAILABILITY, DEMO_PLAN);
  switch (step) {
    case "brands":
      return (
        <ul className="divide-y divide-line">
          {DEMO_BRANDS.map((brand) => (
            <li key={brand.name} className="py-3">
              <p className="font-medium">{brand.name}</p>
              <p className="text-sm text-muted">{brand.focus}</p>
            </li>
          ))}
        </ul>
      );
    case "availability":
      return (
        <ul className="grid grid-cols-3 gap-3">
          {DEMO_AVAILABILITY.map((slot) => (
            <li key={slot.day} className="rounded-md border border-line p-3">
              <p className="text-sm text-muted">{slot.day}</p>
              <p className="font-display text-2xl">{formatMinutes(slot.minutes)}</p>
            </li>
          ))}
        </ul>
      );
    case "plan":
      return (
        <div className="space-y-4">
          <p>
            Planned {formatMinutes(capacity.plannedMinutes)} of{" "}
            {formatMinutes(capacity.availableMinutes)} available
            {capacity.overBy > 0 ? `, ${formatMinutes(capacity.overBy)} over` : ", fits your week"}.
          </p>
          <div
            role="img"
            aria-label={`${formatMinutes(capacity.plannedMinutes)} planned of ${formatMinutes(capacity.availableMinutes)} available`}
            className="h-2 overflow-hidden rounded-full bg-sunken"
          >
            <div
              className="h-full bg-accent"
              style={{
                width: `${Math.min(100, (capacity.plannedMinutes / capacity.availableMinutes) * 100)}%`,
              }}
            />
          </div>
          <ul className="divide-y divide-line">
            {DEMO_PLAN.map((item) => (
              <li key={item.id} className="flex items-baseline justify-between gap-4 py-3">
                <span>
                  <span className="text-sm text-muted">
                    {item.day} · {item.kind}
                  </span>
                  <span className="block">{item.title}</span>
                </span>
                <span className="shrink-0 text-sm text-muted">{formatMinutes(item.minutes)}</span>
              </li>
            ))}
          </ul>
        </div>
      );
    case "topic":
      return (
        <div className="space-y-4">
          <p className="text-sm text-muted">Research cutoff: example date, shown on every brief.</p>
          <ul className="space-y-3">
            {DEMO_CLAIMS.map((claim) => (
              <li key={claim.id}>
                <p>{claim.text}</p>
                <p className="text-sm">
                  <span className={`font-medium ${STATUS_STYLE[claim.status]}`}>
                    {claim.status}
                  </span>
                  <span className="text-muted">
                    {claim.sources.length > 0
                      ? ` · sources ${claim.sources.map((n) => `[${n}]`).join(" ")}`
                      : " · no source found yet"}
                  </span>
                </p>
              </li>
            ))}
          </ul>
          <ul className="space-y-1 border-t border-line pt-3 text-sm text-muted">
            {DEMO_SOURCES.map((source) => (
              <li key={source.n}>
                [{source.n}] {source.title} · {source.kind} · event {source.eventDate}, published{" "}
                {source.publishedDate}, retrieved {source.retrievedDate}
              </li>
            ))}
          </ul>
        </div>
      );
    case "record":
      return (
        <ul className="space-y-2">
          {["Read the summary", "Skim the outline", "Record the take", "Mark recorded"].map(
            (label, index) => (
              <li key={label} className="flex items-center gap-3">
                <span
                  aria-hidden="true"
                  className={`size-4 rounded border ${index < 3 ? "border-accent bg-accent" : "border-line"}`}
                />
                <span>{label}</span>
                <span className="sr-only">
                  {index < 3 ? "(done in this example)" : "(not yet)"}
                </span>
              </li>
            ),
          )}
        </ul>
      );
    case "derive":
      return (
        <ul className="space-y-2">
          <li className="rounded-md border border-line p-3">Original: the full recording</li>
          {DEMO_PLAN.filter((i) => i.kind === "Derivative").map((item) => (
            <li key={item.id} className="ml-6 rounded-md border border-line p-3 text-sm">
              Derivative: {item.title}
            </li>
          ))}
        </ul>
      );
    case "publish":
      return (
        <table className="w-full text-left text-sm">
          <thead>
            <tr className="text-muted">
              <th scope="col" className="py-2 font-normal">
                Platform
              </th>
              <th scope="col" className="py-2 font-normal">
                Recorded
              </th>
              <th scope="col" className="py-2 font-normal">
                Edited
              </th>
              <th scope="col" className="py-2 font-normal">
                Published
              </th>
            </tr>
          </thead>
          <tbody className="divide-y divide-line">
            {DEMO_PLATFORMS.map((row) => (
              <tr key={row.name}>
                <th scope="row" className="py-2 font-normal">
                  {row.name}
                </th>
                <td>{row.recorded ? "Yes" : "No"}</td>
                <td>{row.edited ? "Yes" : "No"}</td>
                <td>{row.published ? "Yes" : "No"}</td>
              </tr>
            ))}
          </tbody>
        </table>
      );
    case "review":
      return (
        <div className="space-y-3">
          <p>
            One original, posted on {DEMO_PLATFORMS.filter((p) => p.published).length} platforms,
            counts as one original and {DEMO_PLATFORMS.filter((p) => p.published).length}{" "}
            publications.
          </p>
          <p className="text-muted">
            Suggestions never count as completed work, and reopening an item corrects the totals.
          </p>
        </div>
      );
  }
}

/** Interactive, keyboard-operable walkthrough of the weekly workflow using clearly fictional data. */
export function WorkflowDemo() {
  const [index, setIndex] = useState(0);
  const panelId = useId();
  const step = STEPS[index]!;

  return (
    <div className="grid gap-8 lg:grid-cols-[18rem_1fr]">
      <ol
        aria-label="Workflow steps"
        className="flex gap-2 overflow-x-auto pb-2 lg:flex-col lg:overflow-visible lg:pb-0"
      >
        {STEPS.map((item, i) => (
          <li key={item.id} className="shrink-0">
            <button
              type="button"
              onClick={() => setIndex(i)}
              aria-current={i === index ? "step" : undefined}
              aria-controls={panelId}
              className={`cp-transition flex min-h-11 w-full items-center gap-3 rounded-md border px-3 py-2 text-left text-sm ${
                i === index
                  ? "border-accent bg-surface font-medium"
                  : "border-transparent text-muted hover:text-ink"
              }`}
            >
              <span aria-hidden="true" className="tabular-nums text-muted">
                {i + 1}
              </span>
              {item.title}
            </button>
          </li>
        ))}
      </ol>

      <section
        id={panelId}
        aria-live="polite"
        aria-labelledby={`${panelId}-title`}
        className="rounded-xl border border-line bg-surface p-6"
      >
        <p className="mb-4 inline-block rounded-full border border-line px-3 py-1 text-xs text-muted">
          {DEMO_DISCLAIMER}
        </p>
        <h3 id={`${panelId}-title`} className="font-display text-2xl">
          Step {index + 1}: {step.title}
        </h3>
        <p className="mt-1 max-w-prose text-muted">{step.summary}</p>
        <div className="mt-6">
          <Panel step={step.id} />
        </div>
        <div className="mt-8 flex justify-between">
          <button
            type="button"
            disabled={index === 0}
            onClick={() => setIndex(index - 1)}
            className="min-h-11 rounded-md px-3 text-sm underline-offset-4 hover:underline disabled:opacity-50"
          >
            Previous
          </button>
          <button
            type="button"
            disabled={index === STEPS.length - 1}
            onClick={() => setIndex(index + 1)}
            className="min-h-11 rounded-md px-3 text-sm underline-offset-4 hover:underline disabled:opacity-50"
          >
            Next
          </button>
        </div>
      </section>
    </div>
  );
}
