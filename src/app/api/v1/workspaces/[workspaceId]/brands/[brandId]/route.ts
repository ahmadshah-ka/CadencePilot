import { getBrandHandler, updateBrandHandler } from "@/presentation/api/workspace-routes";

export const dynamic = "force-dynamic";
export const GET = getBrandHandler();
export const PATCH = updateBrandHandler();
