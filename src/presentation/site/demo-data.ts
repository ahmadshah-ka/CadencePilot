/**
 * Made-up content for the public demonstration. It is illustrative only: no real brands, sources,
 * customers or results. Anything shown from here must carry the DEMO_DISCLAIMER label.
 */
export const DEMO_DISCLAIMER =
  "Illustrative example with made-up content. No real accounts, sources or results are shown.";

export const DEMO_BRANDS = [
  { name: "Example Brand A", focus: "Explainer videos" },
  { name: "Example Brand B", focus: "Short documentaries" },
] as const;

export const DEMO_AVAILABILITY = [
  { day: "Mon", minutes: 90 },
  { day: "Wed", minutes: 120 },
  { day: "Sat", minutes: 180 },
] as const;

export const DEMO_PLAN = [
  {
    id: "p1",
    day: "Sat",
    title: "Record: how lighthouse lenses work (example topic)",
    kind: "Original",
    minutes: 150,
  },
  {
    id: "p2",
    day: "Mon",
    title: "Cut a 40-second short from the recording",
    kind: "Derivative",
    minutes: 45,
  },
  {
    id: "p3",
    day: "Wed",
    title: "Write the caption and checklist for each platform",
    kind: "Derivative",
    minutes: 60,
  },
] as const;

export const DEMO_CLAIMS = [
  {
    id: "c1",
    text: "The lens design was first described in an early nineteenth-century record.",
    status: "supported",
    sources: [1, 2],
  },
  {
    id: "c2",
    text: "Historians disagree about who first built a working version.",
    status: "disputed",
    sources: [2, 3],
  },
  {
    id: "c3",
    text: "A widely repeated date for adoption could not be confirmed.",
    status: "insufficient",
    sources: [],
  },
] as const;

export const DEMO_SOURCES = [
  {
    n: 1,
    title: "Example archive record (made up)",
    kind: "Primary",
    eventDate: "1822",
    publishedDate: "1822",
    retrievedDate: "2026-10-01",
  },
  {
    n: 2,
    title: "Example history article (made up)",
    kind: "Secondary",
    eventDate: "1822",
    publishedDate: "2011-05-14",
    retrievedDate: "2026-10-01",
  },
  {
    n: 3,
    title: "Example museum essay (made up)",
    kind: "Secondary",
    eventDate: "1820s",
    publishedDate: "2018-09-02",
    retrievedDate: "2026-10-01",
  },
] as const;

export const DEMO_PLATFORMS = [
  { name: "Platform one", recorded: true, edited: true, published: true },
  { name: "Platform two", recorded: true, edited: true, published: true },
  { name: "Platform three", recorded: true, edited: false, published: false },
] as const;

export interface CapacitySummary {
  availableMinutes: number;
  plannedMinutes: number;
  overBy: number;
}

/** Totals planned work against available time; overBy is 0 when the plan fits. */
export function summarizeCapacity(
  availability: ReadonlyArray<{ minutes: number }>,
  plan: ReadonlyArray<{ minutes: number }>,
): CapacitySummary {
  const availableMinutes = availability.reduce((sum, slot) => sum + slot.minutes, 0);
  const plannedMinutes = plan.reduce((sum, item) => sum + item.minutes, 0);
  return {
    availableMinutes,
    plannedMinutes,
    overBy: Math.max(0, plannedMinutes - availableMinutes),
  };
}

/** "2h 30m" style duration. */
export function formatMinutes(total: number): string {
  const hours = Math.floor(total / 60);
  const minutes = total % 60;
  if (hours === 0) return `${minutes}m`;
  return minutes === 0 ? `${hours}h` : `${hours}h ${minutes}m`;
}
