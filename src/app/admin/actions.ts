"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { reviewAccount } from "@/application/access/access-use-cases";
import { DECISIONS_REQUIRING_CONFIRMATION, REVIEW_DECISIONS } from "@/domain/access/account-status";
import { isAppError } from "@/domain/errors/app-error";
import { getContainer } from "@/infrastructure/composition";
import { getAppConfig, getPrincipal, SIGN_IN_PATH } from "@/presentation/auth/page-guards";

const formSchema = z.object({
  userId: z.uuid(),
  decision: z.enum(REVIEW_DECISIONS),
  expectedRevision: z.coerce.number().int().positive(),
  note: z.string().trim().optional(),
  confirm: z.string().optional(),
});

/**
 * Owner approve / reject / suspend / reinstate. Server action: Next verifies the request origin.
 * Re-authorizes on every call (owner + MFA) and relies on the database's expected-revision check.
 */
export async function reviewAccountAction(formData: FormData): Promise<void> {
  const parsed = formSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) redirect("/admin?result=invalid");
  const { userId, decision, expectedRevision, note, confirm } = parsed.data;

  if (DECISIONS_REQUIRING_CONFIRMATION.includes(decision) && confirm !== "yes") {
    redirect(`/admin/review?user=${userId}&decision=${decision}&revision=${expectedRevision}`);
  }

  const config = getAppConfig();
  if (note && note.length > config.limits.reviewNoteMaxLength) redirect("/admin?result=invalid");

  const container = getContainer();
  let result = "ok";
  try {
    await reviewAccount(
      {
        access: container.access,
        logger: container.logger,
        ownerMfaRequired: config.ownerMfaRequired,
      },
      await getPrincipal(),
      { targetUserId: userId, decision, expectedRevision, note: note || null },
    );
  } catch (error) {
    if (isAppError(error) && error.code === "UNAUTHENTICATED") redirect(SIGN_IN_PATH);
    result = isAppError(error)
      ? error.code === "CONFLICT"
        ? "stale"
        : error.code === "FORBIDDEN"
          ? "forbidden"
          : "error"
      : "error";
    container.logger.warn("account review failed", { result, error });
  }
  revalidatePath("/admin");
  redirect(`/admin?result=${result}`);
}
