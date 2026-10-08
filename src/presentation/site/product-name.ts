import "server-only";
import { getContainer } from "@/infrastructure/composition";

/** Shown if configuration is invalid; the product name is a configurable input, not a constant. */
const NAME_WHEN_UNCONFIGURED = "Content planner";

/** The configured product display name (APP_NAME). */
export function getProductName(): string {
  const { config } = getContainer();
  return config.ok ? config.config.app.name : NAME_WHEN_UNCONFIGURED;
}
