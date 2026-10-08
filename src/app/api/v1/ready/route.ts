import { readinessHandler } from "@/presentation/api/health-routes";

export const dynamic = "force-dynamic";
export const GET = readinessHandler();
