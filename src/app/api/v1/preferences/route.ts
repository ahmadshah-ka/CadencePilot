import { getPreferencesHandler, putPreferencesHandler } from "@/presentation/api/preference-routes";
export const dynamic = "force-dynamic";
export const GET = getPreferencesHandler();
export const PUT = putPreferencesHandler();
