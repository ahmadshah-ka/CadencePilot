import Link from "next/link";
import { redirect } from "next/navigation";
import { z } from "zod";
import { REVIEW_DECISIONS } from "@/domain/access/account-status";
import { getAppConfig, requireOwnerPage } from "@/presentation/auth/page-guards";
import { buttonClasses } from "@/presentation/components/ui/button";
import { PageHeader } from "@/presentation/components/ui/page-header";
import { reviewAccountAction } from "../actions";

export const dynamic = "force-dynamic";

const EFFECTS = {
  reject: "The applicant will be told their request was not approved and cannot use the product.",
  suspend:
    "The account loses access to all product operations immediately. Their data is kept and access can be reinstated.",
} as const;

const querySchema = z.object({
  user: z.uuid(),
  decision: z.enum(REVIEW_DECISIONS),
  revision: z.coerce.number().int().positive(),
});

/** Access policy: owner. Explicit confirmation step for reject and suspend. */
export default async function ConfirmReviewPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | undefined>>;
}) {
  await requireOwnerPage("/admin");
  const query = querySchema.safeParse(await searchParams);
  if (!query.success || !(query.data.decision in EFFECTS)) redirect("/admin?result=invalid");
  const { user, decision, revision } = query.data;
  const effect = EFFECTS[decision as keyof typeof EFFECTS];
  const maxNote = getAppConfig().limits.reviewNoteMaxLength;

  return (
    <div className="max-w-xl space-y-6">
      <PageHeader title={`Confirm: ${decision}`} description={effect} />
      <form action={reviewAccountAction} className="space-y-4">
        <input type="hidden" name="userId" value={user} />
        <input type="hidden" name="decision" value={decision} />
        <input type="hidden" name="expectedRevision" value={revision} />
        <input type="hidden" name="confirm" value="yes" />
        <label className="block">
          <span className="block text-sm">Note (optional, kept in the audit trail)</span>
          <textarea
            name="note"
            maxLength={maxNote}
            className="mt-1 w-full rounded-md border border-line bg-surface p-3"
          />
        </label>
        <div className="flex flex-wrap items-center gap-3">
          <button type="submit" className={buttonClasses("danger")}>
            Confirm {decision}
          </button>
          <Link href="/admin" className="px-2 py-2 underline underline-offset-4">
            Cancel
          </Link>
        </div>
      </form>
    </div>
  );
}
