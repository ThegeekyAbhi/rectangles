"use client";

import { PlayIcon } from "@phosphor-icons/react";
import type { ProjectDocument } from "@rectangles/schema";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { describeError } from "../lib/describe-error";

interface OpenInWhiteboardButtonProps {
  document: ProjectDocument;
  /** Name for the new project, such as "Lesson: Load balancing". */
  name: string;
  /** Why the design cannot be simulated yet; the button is disabled while set. */
  unavailableReason?: string;
}

/**
 * Opens a read-only diagram as a board of its own, where it can be run and changed.
 * Each click saves a fresh copy, so the original diagram is never changed. The project
 * storage is loaded on click, so a page showing diagrams carries none of it.
 */
export function OpenInWhiteboardButton({ document, name, unavailableReason }: OpenInWhiteboardButtonProps) {
  const router = useRouter();
  const [isOpening, setIsOpening] = useState(false);

  const open = async () => {
    setIsOpening(true);
    try {
      const { createProjectFromDocument } = await import("../api/project-repository");
      const project = await createProjectFromDocument(name, document);
      router.push(`/projects/${project.id}`);
    } catch (error) {
      toast.error("Couldn't open this design", { description: describeError(error) });
      setIsOpening(false);
    }
  };

  return (
    <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
      <Button size="sm" disabled={isOpening || unavailableReason !== undefined} onClick={() => void open()}>
        <PlayIcon weight="fill" aria-hidden />
        {isOpening ? "Opening…" : "Open in whiteboard"}
      </Button>
      {unavailableReason !== undefined && <p className="text-xs text-muted-foreground">{unavailableReason}</p>}
    </div>
  );
}
