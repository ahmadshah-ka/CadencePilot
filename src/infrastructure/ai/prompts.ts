import "server-only";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { z } from "zod";
import connectionCheckSchema from "@/config/ai-schemas/connection-check-v1.json";
const PROBE_FILE = "connection-check-v1.txt";
export const PROBE_VERSION = "connection-check-v1";
export const probeOutput = {
  name: "connection_check",
  schema: connectionCheckSchema,
  validate: z.object({ status: z.literal("ok") }).strict(),
};
/** Fixed versioned prompt only; user/model strings cannot select filesystem paths. */
export async function loadProbePrompt(): Promise<string> {
  return readFile(join(process.cwd(), "prompts", PROBE_FILE), "utf8");
}
