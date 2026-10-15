"use client";
import { useState, type FormEvent, type ReactNode } from "react";
import policy from "@/config/onboarding-policy.json";
import type {
  AvailabilityWindow,
  PersonalPreferences,
  BrandPreferences,
} from "@/domain/preferences/preference-rules";
import { buttonClasses } from "@/presentation/components/ui/button";

const INPUT = "mt-1 min-h-11 w-full rounded-md border border-line bg-surface px-3";
const MINUTES_PER_HOUR = 60;
const HTTP_CONFLICT = 409;
interface Result {
  revision: number;
  error: string | null;
}

async function save(url: string, revision: number, settings: unknown): Promise<Result> {
  try {
    const response = await fetch(url, {
      method: "PUT",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ expectedRevision: revision, settings }),
    });
    const data = await response.json();
    if (!response.ok)
      return {
        revision,
        error:
          response.status === HTTP_CONFLICT
            ? "Another tab changed this record. Your input is still here; copy it before reloading."
            : "Could not save. Check the fields and your session, then retry. Your input is preserved.",
      };
    return { revision: data.preferences?.revision ?? data.brand.revision, error: null };
  } catch {
    return { revision, error: "Connection failed. Your input is preserved. Try saving again." };
  }
}

function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <label className="block">
      <span className="text-sm font-medium">{label}</span>
      {children}
    </label>
  );
}
const displayTime = (minute: number) =>
  `${String(Math.floor(minute / MINUTES_PER_HOUR)).padStart(2, "0")}:${String(minute % MINUTES_PER_HOUR).padStart(2, "0")}`;
const readTime = (value: string) => {
  const [hours, minutes] = value.split(":").map(Number);
  return hours! * MINUTES_PER_HOUR + minutes!;
};

function Availability({
  windows,
  onChange,
}: {
  windows: AvailabilityWindow[];
  onChange: (value: AvailabilityWindow[]) => void;
}) {
  const update = (index: number, patch: Partial<AvailabilityWindow>) =>
    onChange(windows.map((window, i) => (i === index ? { ...window, ...patch } : window)));
  return (
    <div className="space-y-3">
      {windows.length === 0 ? (
        <p className="text-sm text-muted">
          No time allocated. This is a valid choice; the planner must not assume you are free.
        </p>
      ) : null}
      {windows.map((window, index) => (
        <div key={index} className="grid gap-3 rounded-md border border-line p-3 sm:grid-cols-4">
          <Field label={`Window ${index + 1} day`}>
            <select
              className={INPUT}
              value={window.day}
              onChange={(e) => update(index, { day: Number(e.target.value) })}
            >
              {policy.weekdays.map((day, i) => (
                <option key={day} value={i}>
                  {day}
                </option>
              ))}
            </select>
          </Field>
          <Field label={`Window ${index + 1} start`}>
            <input
              className={INPUT}
              type="time"
              required
              value={displayTime(window.startMinute)}
              onChange={(e) => update(index, { startMinute: readTime(e.target.value) })}
            />
          </Field>
          <Field label={`Window ${index + 1} end`}>
            <input
              className={INPUT}
              type="time"
              required
              value={displayTime(window.endMinute)}
              onChange={(e) => update(index, { endMinute: readTime(e.target.value) })}
            />
          </Field>
          <button
            className={buttonClasses("secondary")}
            type="button"
            onClick={() => onChange(windows.filter((_, i) => i !== index))}
          >
            Remove window {index + 1}
          </button>
        </div>
      ))}
      <button
        type="button"
        className={buttonClasses("secondary")}
        disabled={windows.length >= policy.maxAvailabilityWindows}
        onClick={() =>
          onChange([...windows, { day: 0, startMinute: 0, endMinute: MINUTES_PER_HOUR }])
        }
      >
        Add availability window
      </button>
      <p className="text-sm text-muted">
        Enter local times. Split overnight windows across days. Availability is shared across your
        brands.
      </p>
    </div>
  );
}

/** Editable partial questionnaire; saves only on explicit user action, never infers a timezone. */
export function PersonalPreferenceForm({
  initial,
  initialRevision,
}: {
  initial: PersonalPreferences;
  initialRevision: number;
}) {
  const [settings, setSettings] = useState(initial),
    [revision, setRevision] = useState(initialRevision);
  const [message, setMessage] = useState(""),
    [busy, setBusy] = useState(false),
    [failed, setFailed] = useState(false);
  const [week, setWeek] = useState("");
  const active = settings.weeklyAvailability.find((item) => item.weekStart === week);
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setMessage("");
    const result = await save("/api/v1/preferences", revision, settings);
    setRevision(result.revision);
    setFailed(!!result.error);
    setMessage(result.error ?? "Availability saved. You can return and continue at any time.");
    setBusy(false);
  }
  return (
    <form onSubmit={submit} className="max-w-3xl space-y-6">
      <Field label="Your timezone (IANA name)">
        <input
          className={INPUT}
          value={settings.timezone}
          placeholder="For example, Europe/London"
          onChange={(e) => setSettings({ ...settings, timezone: e.target.value })}
        />
      </Field>
      <p className="text-sm text-muted">
        Leave the timezone blank to save an unfinished setup. Set it before scheduling work.
      </p>
      <fieldset className="space-y-3">
        <legend className="font-medium">Usual weekly availability</legend>
        <Availability
          windows={settings.availability}
          onChange={(availability) => setSettings({ ...settings, availability })}
        />
      </fieldset>
      <fieldset className="space-y-3 border-t border-line pt-5">
        <legend className="font-medium">One-week availability override</legend>
        <Field label="Week starting Monday">
          <input
            className={INPUT}
            type="date"
            value={week}
            onChange={(e) => setWeek(e.target.value)}
          />
        </Field>
        {active ? (
          <>
            <Availability
              windows={active.availability}
              onChange={(availability) =>
                setSettings({
                  ...settings,
                  weeklyAvailability: settings.weeklyAvailability.map((item) =>
                    item.weekStart === week ? { ...item, availability } : item,
                  ),
                })
              }
            />
            <button
              type="button"
              className={buttonClasses("secondary")}
              onClick={() =>
                setSettings({
                  ...settings,
                  weeklyAvailability: settings.weeklyAvailability.filter(
                    (item) => item.weekStart !== week,
                  ),
                })
              }
            >
              Use usual availability for this week
            </button>
          </>
        ) : (
          <button
            type="button"
            className={buttonClasses("secondary")}
            disabled={!week || settings.weeklyAvailability.length >= policy.maxWeeklyOverrides}
            onClick={() =>
              setSettings({
                ...settings,
                weeklyAvailability: [
                  ...settings.weeklyAvailability,
                  { weekStart: week, availability: [] },
                ],
              })
            }
          >
            Set this week unavailable, then add any free windows
          </button>
        )}
        <p className="text-sm text-muted">
          An empty override means no free time that week. Other weeks keep your usual availability.
        </p>
        {settings.weeklyAvailability.length ? (
          <p className="text-sm">
            Saved/draft override weeks:{" "}
            {settings.weeklyAvailability.map((item) => (
              <button
                key={item.weekStart}
                type="button"
                className="mr-3 underline"
                onClick={() => setWeek(item.weekStart)}
              >
                {item.weekStart}
              </button>
            ))}
          </p>
        ) : null}
      </fieldset>
      <p role={failed ? "alert" : "status"} aria-live="polite">
        {message}
      </p>
      <button type="submit" disabled={busy} className={buttonClasses("primary")}>
        {busy ? "Saving…" : "Save availability"}
      </button>
    </form>
  );
}

function TargetFields({
  targets,
  onChange,
  prefix,
}: {
  targets: Partial<Record<string, number>>;
  onChange: (targets: Partial<Record<string, number>>) => void;
  prefix: string;
}) {
  return (
    <div className="grid gap-3 sm:grid-cols-3">
      {policy.formats.map((format) => (
        <Field key={format} label={`${prefix} ${format} per week`}>
          <input
            className={INPUT}
            type="number"
            min={0}
            max={policy.weeklyTargetMax}
            step={1}
            value={targets[format] ?? ""}
            onChange={(e) => {
              const next = { ...targets };
              if (e.target.value === "") delete next[format];
              else next[format] = Number(e.target.value);
              onChange(next);
            }}
          />
        </Field>
      ))}
    </div>
  );
}

/** Explicit permanent goals and week-only overrides; unsaved input survives failed requests. */
export function BrandPreferenceForm({
  initial,
  initialRevision,
  workspaceId,
  brandId,
}: {
  initial: BrandPreferences;
  initialRevision: number;
  workspaceId: string;
  brandId: string;
}) {
  const [settings, setSettings] = useState(initial),
    [revision, setRevision] = useState(initialRevision);
  const [message, setMessage] = useState(""),
    [busy, setBusy] = useState(false),
    [failed, setFailed] = useState(false),
    [week, setWeek] = useState("");
  const active = settings.weeklyTargets.find((item) => item.weekStart === week);
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setMessage("");
    const result = await save(
      `/api/v1/workspaces/${workspaceId}/brands/${brandId}/preferences`,
      revision,
      settings,
    );
    setRevision(result.revision);
    setFailed(!!result.error);
    setMessage(result.error ?? "Brand preferences saved.");
    setBusy(false);
  }
  return (
    <form onSubmit={submit} className="max-w-3xl space-y-6">
      {(["topic", "audience", "tone"] as const).map((key) => (
        <Field
          key={key}
          label={
            key === "topic"
              ? "Topics and purpose"
              : key === "audience"
                ? "Who is this for?"
                : "Voice and tone"
          }
        >
          <textarea
            className={`${INPUT} py-2`}
            maxLength={policy.textMaxLength}
            rows={3}
            value={settings[key]}
            onChange={(e) => setSettings({ ...settings, [key]: e.target.value })}
          />
        </Field>
      ))}
      <fieldset>
        <legend className="mb-3 font-medium">Publishing platforms</legend>
        <div className="flex flex-wrap gap-4">
          {policy.platforms.map((platform) => (
            <label key={platform} className="flex min-h-11 items-center gap-2">
              <input
                type="checkbox"
                checked={settings.platforms.includes(platform)}
                onChange={(e) =>
                  setSettings({
                    ...settings,
                    platforms: e.target.checked
                      ? [...settings.platforms, platform]
                      : settings.platforms.filter((value) => value !== platform),
                  })
                }
              />
              {platform}
            </label>
          ))}
        </div>
      </fieldset>
      <fieldset className="space-y-3">
        <legend className="font-medium">Permanent weekly goals</legend>
        <TargetFields
          prefix="Usual"
          targets={settings.targets}
          onChange={(targets) => setSettings({ ...settings, targets })}
        />
        <p className="text-sm text-muted">
          Blank means not decided; zero means none. Goals are preferences, not completed work or a
          promise of available time.
        </p>
      </fieldset>
      <fieldset className="space-y-3 border-t border-line pt-5">
        <legend className="font-medium">Change goals for one week</legend>
        <Field label="Week starting Monday">
          <input
            type="date"
            className={INPUT}
            value={week}
            onChange={(e) => setWeek(e.target.value)}
          />
        </Field>
        {active ? (
          <>
            <TargetFields
              prefix="This week"
              targets={active.targets}
              onChange={(targets) =>
                setSettings({
                  ...settings,
                  weeklyTargets: settings.weeklyTargets.map((item) =>
                    item.weekStart === week ? { ...item, targets } : item,
                  ),
                })
              }
            />
            <button
              type="button"
              className={buttonClasses("secondary")}
              onClick={() =>
                setSettings({
                  ...settings,
                  weeklyTargets: settings.weeklyTargets.filter((item) => item.weekStart !== week),
                })
              }
            >
              Remove this week’s override
            </button>
          </>
        ) : (
          <button
            type="button"
            className={buttonClasses("secondary")}
            disabled={!week || settings.weeklyTargets.length >= policy.maxWeeklyOverrides}
            onClick={() =>
              setSettings({
                ...settings,
                weeklyTargets: [...settings.weeklyTargets, { weekStart: week, targets: {} }],
              })
            }
          >
            Add week-only goals
          </button>
        )}
        <p className="text-sm text-muted">
          Only entered numbers override your permanent goals. The override does not carry into
          another week.
        </p>
        {settings.weeklyTargets.length ? (
          <p className="text-sm">
            Saved/draft override weeks:{" "}
            {settings.weeklyTargets.map((item) => (
              <button
                key={item.weekStart}
                type="button"
                className="mr-3 underline"
                onClick={() => setWeek(item.weekStart)}
              >
                {item.weekStart}
              </button>
            ))}
          </p>
        ) : null}
      </fieldset>
      <p role={failed ? "alert" : "status"} aria-live="polite">
        {message}
      </p>
      <button type="submit" disabled={busy} className={buttonClasses("primary")}>
        {busy ? "Saving…" : "Save brand preferences"}
      </button>
    </form>
  );
}
