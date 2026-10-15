import { z } from "zod";

export interface OnboardingPolicy {
  textMaxLength: number;
  weeklyTargetMax: number;
  maxWeeklyOverrides: number;
  maxAvailabilityWindows: number;
  maxSettingsBytes: number;
  minutesPerDay: number;
  daysPerWeek: number;
  platforms: readonly string[];
  formats: readonly string[];
}

/** Tests an IANA timezone without assuming a creator's country or browser timezone. */
export function isTimezone(value: string): boolean {
  try {
    new Intl.DateTimeFormat(undefined, { timeZone: value });
    return true;
  } catch {
    return false;
  }
}

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;
const WEEK_START_DAY = 1;
/** Accepts only real ISO Monday dates; arithmetic is UTC to avoid host timezone/DST drift. */
export function isWeekStart(value: string): boolean {
  if (!ISO_DATE.test(value)) return false;
  const date = new Date(`${value}T00:00:00Z`);
  return (
    Number.isFinite(date.getTime()) &&
    date.toISOString().slice(0, 10) === value &&
    date.getUTCDay() === WEEK_START_DAY
  );
}

/** Schemas for partial/resumable onboarding; zero availability/targets are valid choices. */
export function preferenceSchemas(policy: OnboardingPolicy) {
  const text = z.string().trim().max(policy.textMaxLength);
  const targets = z.partialRecord(
    z.enum(policy.formats as [string, ...string[]]),
    z.number().int().min(0).max(policy.weeklyTargetMax),
  );
  const window = z
    .object({
      day: z
        .number()
        .int()
        .min(0)
        .max(policy.daysPerWeek - 1),
      startMinute: z
        .number()
        .int()
        .min(0)
        .max(policy.minutesPerDay - 1),
      endMinute: z.number().int().min(1).max(policy.minutesPerDay),
    })
    .strict()
    .refine(
      (w) => w.endMinute > w.startMinute,
      "End must be after start; split overnight windows across days.",
    );
  const windows = z
    .array(window)
    .max(policy.maxAvailabilityWindows)
    .superRefine((items, ctx) => {
      const sorted = [...items].sort((a, b) => a.day - b.day || a.startMinute - b.startMinute);
      for (let index = 1; index < sorted.length; index++) {
        const previous = sorted[index - 1]!,
          current = sorted[index]!;
        if (previous.day === current.day && previous.endMinute > current.startMinute)
          ctx.addIssue({ code: "custom", message: "Availability windows must not overlap." });
      }
    });
  const weekStart = z.string().refine(isWeekStart, "Choose a valid Monday as the week start.");
  const personal = z
    .object({
      timezone: z.union([
        z.literal(""),
        z.string().refine(isTimezone, "Enter a valid IANA timezone."),
      ]),
      availability: windows,
      weeklyAvailability: z
        .array(z.object({ weekStart, availability: windows }).strict())
        .max(policy.maxWeeklyOverrides),
    })
    .strict()
    .superRefine((value, ctx) => {
      if (
        new Set(value.weeklyAvailability.map((w) => w.weekStart)).size !==
        value.weeklyAvailability.length
      )
        ctx.addIssue({
          code: "custom",
          message: "A week can have only one availability override.",
        });
    });
  const brand = z
    .object({
      topic: text,
      audience: text,
      tone: text,
      platforms: z
        .array(
          z.string().refine((p) => policy.platforms.includes(p), "Choose a supported platform."),
        )
        .max(policy.platforms.length),
      targets,
      weeklyTargets: z
        .array(z.object({ weekStart, targets }).strict())
        .max(policy.maxWeeklyOverrides),
    })
    .strict()
    .superRefine((value, ctx) => {
      if (new Set(value.platforms).size !== value.platforms.length)
        ctx.addIssue({ code: "custom", message: "Platforms must not repeat." });
      if (new Set(value.weeklyTargets.map((w) => w.weekStart)).size !== value.weeklyTargets.length)
        ctx.addIssue({ code: "custom", message: "A week can have only one target override." });
    });
  return { personal, brand, weekStart };
}

export interface AvailabilityWindow {
  day: number;
  startMinute: number;
  endMinute: number;
}
export interface PersonalPreferences {
  timezone: string;
  availability: AvailabilityWindow[];
  weeklyAvailability: Array<{ weekStart: string; availability: AvailabilityWindow[] }>;
}
export interface BrandPreferences {
  topic: string;
  audience: string;
  tone: string;
  platforms: string[];
  targets: Partial<Record<string, number>>;
  weeklyTargets: Array<{ weekStart: string; targets: Partial<Record<string, number>> }>;
}

/** Overrides apply to exactly one local week; previous overrides never become permanent. */
export function effectiveTargets(
  preferences: BrandPreferences,
  weekStart: string,
): Partial<Record<string, number>> {
  const override = preferences.weeklyTargets.find((week) => week.weekStart === weekStart);
  return { ...preferences.targets, ...override?.targets };
}
/** An explicitly empty override means no capacity that week, rather than falling back. */
export function effectiveAvailability(
  preferences: PersonalPreferences,
  weekStart: string,
): AvailabilityWindow[] {
  return (
    preferences.weeklyAvailability.find((week) => week.weekStart === weekStart)?.availability ??
    preferences.availability
  );
}
/** Wall-clock planning minutes; these are preferences, not exact elapsed DST durations. */
export function availabilityMinutes(windows: readonly AvailabilityWindow[]): number {
  return windows.reduce((sum, window) => sum + window.endMinute - window.startMinute, 0);
}
