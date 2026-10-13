import { CheckCircleIcon, CircleNotchIcon, WarningIcon } from "@phosphor-icons/react";
import { Button } from "@/components/ui/button";
import type { SaveStatus as SaveStatusValue } from "../hooks/use-autosave";

export function SaveStatus({ status, onRetry }: { status: SaveStatusValue; onRetry: () => void }) {
  return (
    <div
      className="flex items-center gap-1.5 text-xs text-muted-foreground"
      role="status"
      aria-live="polite"
    >
      {status === "saved" && (
        <>
          <CheckCircleIcon className="size-4" aria-hidden />
          Saved
        </>
      )}
      {status === "saving" && (
        <>
          <CircleNotchIcon className="size-4 animate-spin" aria-hidden />
          Saving…
        </>
      )}
      {status === "failed" && (
        <>
          <WarningIcon weight="fill" className="size-4 text-destructive" aria-hidden />
          <span className="text-destructive">Couldn&apos;t save</span>
          <Button variant="outline" size="xs" onClick={onRetry}>
            Retry
          </Button>
        </>
      )}
    </div>
  );
}
