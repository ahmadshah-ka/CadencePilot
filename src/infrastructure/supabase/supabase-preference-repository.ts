import type {
  PreferenceRepository,
  PreferenceRecord,
} from "@/application/ports/preference-repository";
import type { PersonalPreferences } from "@/domain/preferences/preference-rules";
import { AppError } from "@/domain/errors/app-error";
import { createUserClient, type SupabaseSettings } from "./clients";

interface Row {
  user_id: string;
  revision: number;
  settings: PersonalPreferences;
}
const COLUMNS = "user_id,revision,settings";
const fromRow = (row: Row): PreferenceRecord => ({
  userId: row.user_id,
  revision: row.revision,
  settings: row.settings,
});
const unavailable = () =>
  new AppError("DEPENDENCY_UNAVAILABLE", "Preferences are temporarily unavailable.");
/** Uses caller session and explicit user filtering; server secret is never used. */
export function createSupabasePreferenceRepository(
  settings: SupabaseSettings,
): PreferenceRepository {
  return {
    async get(userId) {
      const client = await createUserClient(settings);
      const { data, error } = await client
        .from("creator_preferences")
        .select(COLUMNS)
        .eq("user_id", userId)
        .maybeSingle<Row>();
      if (error) throw unavailable();
      return data ? fromRow(data) : null;
    },
    async save(userId, expectedRevision, preferences) {
      const client = await createUserClient(settings);
      const result =
        expectedRevision === 0
          ? await client
              .from("creator_preferences")
              .insert({ user_id: userId, settings: preferences })
              .select(COLUMNS)
              .maybeSingle<Row>()
          : await client
              .from("creator_preferences")
              .update({ settings: preferences })
              .eq("user_id", userId)
              .eq("revision", expectedRevision)
              .select(COLUMNS)
              .maybeSingle<Row>();
      if (result.error && result.error.code !== "23505") throw unavailable();
      if (!result.data || result.error)
        throw new AppError(
          "CONFLICT",
          "Your preferences changed in another tab. Reload before saving; your unsaved input is preserved.",
        );
      return fromRow(result.data);
    },
  };
}
