"use client";

import { useTransition } from "react";
import { selectBrandAction } from "@/app/actions/scope-actions";

/** Visible scope control: changing it re-renders every page for the chosen brand (or all brands). */
export function BrandSwitcher({
  brands,
  selectedId,
}: {
  brands: ReadonlyArray<{ id: string; name: string }>;
  selectedId: string | null;
}) {
  const [pending, startTransition] = useTransition();
  return (
    <label className="flex items-center gap-2 text-sm">
      <span className="text-muted">Brand</span>
      <select
        value={selectedId ?? "all"}
        disabled={pending || brands.length === 0}
        onChange={(event) => startTransition(() => selectBrandAction(event.target.value))}
        className="min-h-11 rounded-md border border-line bg-surface px-3 text-ink"
      >
        <option value="all">All brands</option>
        {brands.map((brand) => (
          <option key={brand.id} value={brand.id}>
            {brand.name}
          </option>
        ))}
      </select>
    </label>
  );
}
