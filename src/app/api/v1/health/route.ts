import { livenessHandler } from "@/presentation/api/health-routes";

export const dynamic = "force-dynamic";
export const GET = livenessHandler();
