import { describe, expect, it } from "vitest";
import {
  DEMO_AVAILABILITY,
  DEMO_CLAIMS,
  DEMO_PLAN,
  DEMO_SOURCES,
  formatMinutes,
  summarizeCapacity,
} from "./demo-data";

describe("demo data", () => {
  it("shows a plan that fits the illustrative availability", () => {
    const summary = summarizeCapacity(DEMO_AVAILABILITY, DEMO_PLAN);
    expect(summary).toEqual({ availableMinutes: 390, plannedMinutes: 255, overBy: 0 });
  });

  it("reports how far over capacity a plan is", () => {
    expect(summarizeCapacity([{ minutes: 60 }], [{ minutes: 45 }, { minutes: 45 }])).toMatchObject({
      overBy: 30,
    });
    expect(summarizeCapacity([], [])).toEqual({
      availableMinutes: 0,
      plannedMinutes: 0,
      overBy: 0,
    });
  });

  it("formats durations", () => {
    expect(formatMinutes(0)).toBe("0m");
    expect(formatMinutes(45)).toBe("45m");
    expect(formatMinutes(120)).toBe("2h");
    expect(formatMinutes(255)).toBe("4h 15m");
  });

  it("only cites sources that exist and keeps every example clearly fictional", () => {
    const known = new Set(DEMO_SOURCES.map((s) => s.n));
    for (const claim of DEMO_CLAIMS) for (const n of claim.sources) expect(known.has(n)).toBe(true);
    for (const source of DEMO_SOURCES) expect(source.title).toMatch(/made up/);
    expect(
      DEMO_CLAIMS.filter((c) => c.status === "insufficient").every((c) => c.sources.length === 0),
    ).toBe(true);
  });
});
