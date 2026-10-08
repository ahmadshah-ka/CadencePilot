import { createBrandHandler, listBrandsHandler } from "@/presentation/api/workspace-routes";

export const dynamic = "force-dynamic";
export const GET = listBrandsHandler();
export const POST = createBrandHandler();
