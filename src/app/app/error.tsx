"use client";

import { Button } from "@/presentation/components/ui/button";
import { StateMessage } from "@/presentation/components/ui/state-message";

/** Segment error boundary: never shows error text, only a safe message and a retry. */
export default function AppError({ reset }: { error: Error; reset: () => void }) {
  return (
    <StateMessage
      tone="error"
      title="Something went wrong"
      action={
        <Button variant="secondary" onClick={reset}>
          Try again
        </Button>
      }
    >
      Nothing was changed. If this keeps happening, try again in a few minutes.
    </StateMessage>
  );
}
