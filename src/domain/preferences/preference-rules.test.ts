import { describe, it, expect } from "vitest";
import policy from "@/config/onboarding-policy.json";
import {
  preferenceSchemas,
  isTimezone,
  isWeekStart,
  effectiveTargets,
  effectiveAvailability,
  availabilityMinutes,
} from "./preference-rules";
const schemas = preferenceSchemas(policy);
const personal = { timezone: "", availability: [], weeklyAvailability: [] };
const brand = { topic: "", audience: "", tone: "", platforms: [], targets: {}, weeklyTargets: [] };
describe("resumable preferences", () => {
  it("allows unknown facts, zero targets and no availability without inventing a profile", () => {
    expect(schemas.personal.parse(personal)).toEqual(personal);
    expect(schemas.brand.parse({ ...brand, targets: { videos: 0 } }).audience).toBe("");
    expect(isTimezone("Europe/London")).toBe(true);
    expect(isTimezone("not/a-zone")).toBe(false);
    expect(schemas.personal.safeParse({ ...personal, timezone: "not/a-zone" }).success).toBe(false);
  });
  it.each(["2026-10-12", "2026-03-23"])("accepts real Monday %s", (date) =>
    expect(isWeekStart(date)).toBe(true),
  );
  it.each(["2026-10-13", "2026-02-30", "bad", "9999-99-99"])(
    "rejects invalid week start %s",
    (date) => expect(isWeekStart(date)).toBe(false),
  );
  it("rejects overlaps and inverted windows but permits adjacent time slots", () => {
    const first = { day: 0, startMinute: 60, endMinute: 120 };
    expect(
      schemas.personal.safeParse({
        ...personal,
        availability: [first, { ...first, startMinute: 90 }],
      }).success,
    ).toBe(false);
    expect(
      schemas.personal.safeParse({ ...personal, availability: [{ ...first, startMinute: 180 }] })
        .success,
    ).toBe(false);
    expect(
      schemas.personal.safeParse({
        ...personal,
        availability: [first, { ...first, startMinute: 120, endMinute: 180 }],
      }).success,
    ).toBe(true);
    expect(availabilityMinutes([first])).toBe(60);
    expect(availabilityMinutes([])).toBe(0);
  });
  it("expires overrides by week without changing permanent targets or usual availability", () => {
    const weekStart = "2026-10-12";
    const prefs = {
      ...brand,
      targets: { videos: 2, shorts: 4 },
      weeklyTargets: [{ weekStart, targets: { videos: 5 } }],
    };
    expect(effectiveTargets(prefs, weekStart)).toEqual({ videos: 5, shorts: 4 });
    expect(effectiveTargets(prefs, "2026-10-19")).toEqual({ videos: 2, shorts: 4 });
    expect(prefs.targets.videos).toBe(2);
    const schedule = {
      ...personal,
      availability: [{ day: 0, startMinute: 60, endMinute: 120 }],
      weeklyAvailability: [{ weekStart, availability: [] }],
    };
    expect(effectiveAvailability(schedule, weekStart)).toEqual([]);
    expect(effectiveAvailability(schedule, "2026-10-19")).toEqual(schedule.availability);
  });
  it("rejects unknown, duplicate and out-of-bounds configuration", () => {
    for (const patch of [
      { platforms: ["unknown"] },
      { platforms: ["youtube", "youtube"] },
      { targets: { videos: -1 } },
      { targets: { videos: 101 } },
      { targets: { videos: 1.5 } },
      { targets: { fake: 2 } },
      { topic: "x".repeat(policy.textMaxLength + 1) },
      {
        weeklyTargets: [
          { weekStart: "2026-10-12", targets: {} },
          { weekStart: "2026-10-12", targets: {} },
        ],
      },
    ])
      expect(schemas.brand.safeParse({ ...brand, ...patch }).success).toBe(false);
    expect(
      schemas.personal.safeParse({
        ...personal,
        weeklyAvailability: [
          { weekStart: "2026-10-12", availability: [] },
          { weekStart: "2026-10-12", availability: [] },
        ],
      }).success,
    ).toBe(false);
    expect(
      schemas.personal.safeParse({
        ...personal,
        availability: [{ day: 7, startMinute: 0, endMinute: 1 }],
      }).success,
    ).toBe(false);
  });
});
