import { describeIssues, parseConfig } from "../src/config/load-config";

/** Prints actionable configuration problems (variable names only, never values). */
const result = parseConfig(process.env);
if (result.ok) {
  console.log("Configuration is valid.");
} else {
  console.error("Configuration is invalid:");
  for (const line of describeIssues(result.issues)) console.error(`  - ${line}`);
  console.error("See .env.example for each variable's type, default and purpose.");
  process.exit(1);
}
