"use client";

import { InfoIcon } from "@phosphor-icons/react";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";

/** A small button that explains, on hover or focus, exactly what a metric measures. */
export function MetricDefinition({ name, definition }: { name: string; definition: string }) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <button
          type="button"
          aria-label={`What ${name} means`}
          className="rounded-sm text-muted-foreground outline-none hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring"
        >
          <InfoIcon className="size-3.5" aria-hidden />
        </button>
      </TooltipTrigger>
      <TooltipContent className="max-w-64">{definition}</TooltipContent>
    </Tooltip>
  );
}
