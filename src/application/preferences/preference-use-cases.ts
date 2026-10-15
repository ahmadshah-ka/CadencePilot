import type { PreferenceRepository } from "@/application/ports/preference-repository";
import { assertAccess } from "@/application/access/access-use-cases";
import {
  getBrand,
  updateBrand,
  type WorkspaceDeps,
} from "@/application/workspaces/workspace-use-cases";
import type { Principal } from "@/domain/access/access-policy";
import { AppError } from "@/domain/errors/app-error";
import { preferenceSchemas, type OnboardingPolicy } from "@/domain/preferences/preference-rules";

export interface PreferenceDeps {
  preferences: PreferenceRepository;
  policy: OnboardingPolicy;
}
const invalid = () => new AppError("INVALID_REQUEST", "Check your preferences and try again.");

/** Loads only the authenticated creator's draft; no caller-supplied user ID is accepted. */
export async function getPreferences(deps: PreferenceDeps, principal: Principal | null) {
  const user = assertAccess(principal, { kind: "approved" });
  return deps.preferences.get(user.userId);
}
/** Saves a validated partial questionnaire with optimistic concurrency. */
export async function savePreferences(
  deps: PreferenceDeps,
  principal: Principal | null,
  revision: number,
  input: unknown,
) {
  const user = assertAccess(principal, { kind: "approved" });
  const parsed = preferenceSchemas(deps.policy).personal.safeParse(input);
  if (!Number.isSafeInteger(revision) || revision < 0 || !parsed.success) throw invalid();
  if (new TextEncoder().encode(JSON.stringify(parsed.data)).length > deps.policy.maxSettingsBytes)
    throw invalid();
  return deps.preferences.save(user.userId, revision, parsed.data);
}
/** Brand onboarding shares the existing brand CAS revision and preserves unrelated JSON fields. */
export async function saveBrandPreferences(
  deps: WorkspaceDeps,
  policy: OnboardingPolicy,
  principal: Principal | null,
  workspaceId: string,
  brandId: string,
  expectedRevision: number,
  input: unknown,
) {
  const current = await getBrand(deps, principal, workspaceId, brandId);
  const parsed = preferenceSchemas(policy).brand.safeParse(input);
  if (!Number.isSafeInteger(expectedRevision) || expectedRevision < 1 || !parsed.success)
    throw invalid();
  const { targets, weeklyTargets, ...profile } = parsed.data;
  return updateBrand(deps, principal, workspaceId, brandId, {
    expectedRevision,
    profile: { ...current.profile, onboarding: profile },
    targets: { ...current.targets, onboarding: targets, weeklyOverrides: weeklyTargets },
  });
}
