"use server";

import { cookies } from "next/headers";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { getContainer } from "@/infrastructure/composition";
import { getPrincipal } from "@/presentation/auth/page-guards";
import { ALL_BRANDS, BRAND_SCOPE_COOKIE } from "@/presentation/workspaces/shell-scope";

const COOKIE_MAX_AGE_SECONDS = 60 * 60 * 24 * 30;
const choiceSchema = z.union([z.literal(ALL_BRANDS), z.uuid()]);

/**
 * Switches the visible brand. The value is only a preference: it is validated here and again on
 * every render against the brands the user is allowed to see, so it cannot widen access.
 */
export async function selectBrandAction(choice: string): Promise<void> {
  if (!(await getPrincipal())) return;
  const parsed = choiceSchema.safeParse(choice);
  if (!parsed.success) return;
  const config = getContainer().config;
  const jar = await cookies();
  jar.set(BRAND_SCOPE_COOKIE, parsed.data, {
    httpOnly: true,
    sameSite: "lax",
    secure: config.ok && config.config.app.env !== "development",
    path: "/app",
    maxAge: COOKIE_MAX_AGE_SECONDS,
  });
  revalidatePath("/app", "layout");
}
