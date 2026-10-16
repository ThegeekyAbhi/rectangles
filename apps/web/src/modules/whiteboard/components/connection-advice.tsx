"use client";

import { ProhibitIcon, WarningIcon, XIcon } from "@phosphor-icons/react";
import { Panel } from "@xyflow/react";
import { useHotkeys } from "react-hotkeys-hook";
import { Button } from "@/components/ui/button";
import { useConnectionAdviceStore } from "../store/connection-advice-store";

/**
 * Explains a connection: why it was refused, or why it works but is unusual. Closes on
 * Esc. A warning can be muted; a refusal cannot, as it is the only explanation given.
 */
export function ConnectionAdvice() {
  const advice = useConnectionAdviceStore((state) => state.advice);
  const close = useConnectionAdviceStore((state) => state.close);
  const muteAndClose = useConnectionAdviceStore((state) => state.muteAndClose);

  useHotkeys("escape", close, { enabled: advice !== null });

  if (advice === null) {
    return null;
  }
  const isWarning = advice.kind === "warn";
  const Icon = isWarning ? WarningIcon : ProhibitIcon;

  return (
    <Panel position="top-center" className="w-[min(28rem,calc(100vw-2rem))]">
      <div
        role="status"
        className="flex gap-3 rounded-lg border bg-popover p-3 text-popover-foreground shadow-md"
      >
        <Icon weight="duotone" className="mt-0.5 size-5 shrink-0 text-muted-foreground" aria-hidden />
        <div className="min-w-0 flex-1">
          <p className="text-sm font-medium">{advice.title}</p>
          <p className="mt-1 text-sm text-muted-foreground">{advice.body}</p>
          {advice.fix !== undefined && <p className="mt-2 text-sm">{advice.fix}</p>}
          {isWarning && (
            <Button variant="link" size="xs" className="mt-1 -ml-2 text-muted-foreground" onClick={muteAndClose}>
              Don&apos;t show this again
            </Button>
          )}
        </div>
        <Button variant="ghost" size="icon-xs" onClick={close} aria-label="Close">
          <XIcon />
        </Button>
      </div>
    </Panel>
  );
}
