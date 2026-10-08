import { PageHeader } from "@/presentation/components/ui/page-header";
import { StateMessage } from "@/presentation/components/ui/state-message";

export const dynamic = "force-dynamic";

/** Access policy: approved (enforced by the app layout). Honest placeholder until this feature is built. */
export default function ContentPage() {
  return (
    <div className="space-y-8">
      <PageHeader
        title="Content"
        description="Ideas, originals, derivatives and publication records."
      />
      <StateMessage tone="unavailable" title="Content records are not available yet">
        Your ideas, recordings, derivatives and publication checklist will live here once content
        tracking is built.
      </StateMessage>
    </div>
  );
}
