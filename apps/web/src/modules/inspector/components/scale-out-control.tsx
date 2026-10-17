"use client";

import { CopyIcon } from "@phosphor-icons/react";
import { Button } from "@/components/ui/button";
import { findComponentDefinition, useWhiteboardStore } from "@/modules/whiteboard";

/**
 * Scaling out, next to the settings that scale up: one button that adds another copy of
 * this server and spreads traffic across the copies with a load balancer.
 */
export function ScaleOutControl({ nodeId, routerType }: { nodeId: string; routerType: string }) {
  const scaleOut = useWhiteboardStore((state) => state.scaleOut);
  const routerLabel = (findComponentDefinition(routerType)?.label ?? routerType).toLowerCase();
  return (
    <section aria-labelledby={`${nodeId}-scale-out`} className="flex flex-col gap-2">
      <h3 id={`${nodeId}-scale-out`} className="text-xs font-medium text-muted-foreground">
        Scale out
      </h3>
      <p className="text-xs text-muted-foreground">
        More servers instead of a bigger one. Each copy has its own workers, CPU and queue, and a {routerLabel}{" "}
        spreads requests across them.
      </p>
      <Button variant="outline" size="sm" className="self-start" onClick={() => scaleOut(nodeId)}>
        <CopyIcon aria-hidden />
        Add a copy behind a {routerLabel}
      </Button>
    </section>
  );
}
