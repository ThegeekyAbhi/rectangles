"use client";

import { useRef, useState } from "react";
import { cn } from "@/lib/utils";

/**
 * A name edited in place. It reads as plain text until it is pointed at or focused.
 * Enter or leaving the field commits; Escape cancels. An empty or unchanged name is
 * not committed. Remount it (with a `key`) when `value` changes from outside.
 */
export function InlineNameInput({
  value,
  ariaLabel,
  maxLength,
  className,
  onCommit,
}: {
  value: string;
  ariaLabel: string;
  maxLength: number;
  className?: string;
  /** Receives the trimmed name. */
  onCommit: (name: string) => void;
}) {
  const [draft, setDraft] = useState(value);
  const isCancelling = useRef(false);

  const commit = () => {
    const trimmed = draft.trim();
    if (isCancelling.current || trimmed === "" || trimmed === value) {
      isCancelling.current = false;
      setDraft(value);
      return;
    }
    onCommit(trimmed);
  };

  return (
    <input
      aria-label={ariaLabel}
      value={draft}
      maxLength={maxLength}
      spellCheck={false}
      className={cn(
        "h-7 min-w-0 rounded-md border border-transparent bg-transparent px-1.5 text-sm font-medium outline-none hover:border-input focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50",
        className,
      )}
      onChange={(event) => setDraft(event.target.value)}
      onBlur={commit}
      onKeyDown={(event) => {
        if (event.key === "Enter") {
          event.currentTarget.blur();
        } else if (event.key === "Escape") {
          isCancelling.current = true;
          event.currentTarget.blur();
        }
      }}
    />
  );
}
