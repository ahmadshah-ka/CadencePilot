import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";

/**
 * Fails if any secret canary value appears in browser-served build output (.next/static).
 * Run after `next build` with the canary variables set in the environment.
 */
const CANARY_VARIABLES = [
  "SUPABASE_SECRET_KEY",
  "DATABASE_URL",
  "WORKER_SHARED_SECRET",
  "LLM_API_KEY",
  "RESEARCH_API_KEY",
  "EMAIL_API_KEY",
];
const STATIC_DIR = join(".next", "static");

function* walk(dir: string): Generator<string> {
  for (const entry of readdirSync(dir)) {
    const path = join(dir, entry);
    if (statSync(path).isDirectory()) yield* walk(path);
    else yield path;
  }
}

const canaries = CANARY_VARIABLES.map((name) => process.env[name]).filter(
  (value): value is string => !!value && value.length >= 6,
);
if (canaries.length === 0) {
  console.error("No canary values set; set secret variables to canary strings before building.");
  process.exit(2);
}

let scanned = 0;
const leaks: string[] = [];
for (const file of walk(STATIC_DIR)) {
  scanned += 1;
  const text = readFileSync(file, "utf8");
  if (canaries.some((canary) => text.includes(canary))) leaks.push(file);
}
if (scanned === 0) {
  console.error(`No files found under ${STATIC_DIR}; run the build first.`);
  process.exit(2);
}
if (leaks.length > 0) {
  console.error(`Secret canary found in browser bundle files: ${leaks.join(", ")}`);
  process.exit(1);
}
console.log(`No secret canaries in ${scanned} browser bundle files.`);
