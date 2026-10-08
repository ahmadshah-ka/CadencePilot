import { PageHeader } from "@/presentation/components/ui/page-header";
import { StateMessage } from "@/presentation/components/ui/state-message";

export const dynamic = "force-dynamic";

/** Access policy: approved. Dedicated mobile route for the brand assistant (feature 08). */
export default function AssistantPage() {
  return (
    <div className="space-y-8">
      <PageHeader
        title="Brand assistant"
        description="Ask about a brand, its plan and its research."
      />
      <StateMessage tone="unavailable" title="The assistant is not available yet">
        When it arrives it will answer in the context of the brand you are viewing and show where
        each remembered fact came from. It will appear in a side panel on large screens and on this
        page on phones.
      </StateMessage>
    </div>
  );
}
