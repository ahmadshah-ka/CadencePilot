import { PageHeader } from "@/presentation/components/ui/page-header";
import { StateMessage } from "@/presentation/components/ui/state-message";

export const dynamic = "force-dynamic";

/** Access policy: approved (enforced by the app layout). Honest placeholder until this feature is built. */
export default function ProgressPage() {
  return (
    <div className="space-y-8">
      <PageHeader
        title="Progress"
        description="What you actually recorded, edited and published."
      />
      <StateMessage tone="unavailable" title="No progress to show yet">
        Progress counts only work you mark as done. Nothing is estimated or inferred, and there are
        no results to show before you have records.
      </StateMessage>
    </div>
  );
}
