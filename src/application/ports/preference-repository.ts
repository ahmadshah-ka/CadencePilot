import type { PersonalPreferences } from "@/domain/preferences/preference-rules";
export interface PreferenceRecord {
  userId: string;
  revision: number;
  settings: PersonalPreferences;
}
/** User-scoped persistence; compare-and-swap protects drafts from concurrent replacement. */
export interface PreferenceRepository {
  get(userId: string): Promise<PreferenceRecord | null>;
  /** Revision zero means create-only. Existing drafts require their current revision. */
  save(
    userId: string,
    expectedRevision: number,
    settings: PersonalPreferences,
  ): Promise<PreferenceRecord>;
}
