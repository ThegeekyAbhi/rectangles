"use client";

import { InfoIcon } from "@phosphor-icons/react";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";

/**
 * A small (i) button that explains something on hover or focus, so explanations stay
 * out of the way until they are wanted. `label` names the button for screen readers.
 */
export function InfoTip({
  label,
  side,
  children,
}: {
  label: string;
  side?: "top" | "right" | "bottom" | "left";
  children: React.ReactNode;
}) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <button
          type="button"
          aria-label={label}
          className="shrink-0 rounded-sm text-muted-foreground outline-none hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring"
        >
          <InfoIcon className="size-3.5" aria-hidden />
        </button>
      </TooltipTrigger>
      <TooltipContent side={side} className="max-w-64">
        {/* One block, so a paragraph and a list inside stack instead of sitting side by side. */}
        <div className="leading-relaxed">{children}</div>
      </TooltipContent>
    </Tooltip>
  );
}
