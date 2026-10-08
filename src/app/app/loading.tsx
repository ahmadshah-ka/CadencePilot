import { Skeleton } from "@/presentation/components/ui/state-message";

/** Shown while a shell page loads; skeletons only where they clarify the layout. */
export default function Loading() {
  return (
    <div role="status" aria-busy="true" aria-label="Loading" className="space-y-4">
      <Skeleton className="h-10 w-1/2" />
      <Skeleton className="h-4 w-2/3" />
      <Skeleton className="h-40 w-full" />
    </div>
  );
}
