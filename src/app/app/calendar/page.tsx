import { PageHeader } from "@/presentation/components/ui/page-header";
import { StateMessage } from "@/presentation/components/ui/state-message";

export const dynamic = "force-dynamic";

/** Access policy: approved (enforced by the app layout). Honest placeholder until this feature is built. */
export default function CalendarPage() {
  return (
    <div className="space-y-8">
      <PageHeader
        title="Calendar"
        description="Your plan across the weeks, with an accessible list view."
      />
      <StateMessage tone="unavailable" title="The calendar is not available yet">
        Once weekly plans exist you will see work sessions and publication dates here, with controls
        to reschedule without dragging.
      </StateMessage>
    </div>
  );
}
