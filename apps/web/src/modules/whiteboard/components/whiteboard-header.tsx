"use client";

import { MagnifyingGlassIcon, SidebarSimpleIcon } from "@phosphor-icons/react";
import { useState } from "react";
import { InlineNameInput } from "@/components/inline-name-input";
import { Button } from "@/components/ui/button";
import { ThemeToggle } from "@/components/theme-toggle";
import type { ProjectSummary } from "@/modules/projects";
import { MAX_PROJECT_NAME_LENGTH, useRenameProject } from "@/modules/projects";
import type { SaveStatus as SaveStatusValue } from "../hooks/use-autosave";
import { PanelToggle } from "./panel-toggle";
import { SaveStatus } from "./save-status";

/** The project's name, editable in place. */
function ProjectName({ project }: { project: ProjectSummary }) {
  const renameProject = useRenameProject();
  const [savedName, setSavedName] = useState(project.name);
  return (
    <InlineNameInput
      key={savedName}
      value={savedName}
      ariaLabel="Project name"
      maxLength={MAX_PROJECT_NAME_LENGTH}
      className="w-56 truncate"
      onCommit={(name) =>
        renameProject.mutate({ projectId: project.id, name }, { onSuccess: (renamed) => setSavedName(renamed.name) })
      }
    />
  );
}

export function WhiteboardHeader({
  project,
  saveStatus,
  onRetrySave,
  onOpenPalette,
  toolbar,
}: {
  project: ProjectSummary;
  saveStatus: SaveStatusValue;
  onRetrySave: () => void;
  onOpenPalette: () => void;
  /** Extra controls from other modules, shown before the board's own. */
  toolbar?: React.ReactNode;
}) {
  return (
    // Equal side columns keep the actions button in the middle of the bar.
    <header className="grid h-12 shrink-0 grid-cols-[1fr_auto_1fr] items-center gap-2 px-2">
      <div className="flex min-w-0 items-center gap-2">
        <PanelToggle panel="library" name="components" shortcut="[">
          <SidebarSimpleIcon aria-hidden />
        </PanelToggle>
        <ProjectName project={project} />
        <SaveStatus status={saveStatus} onRetry={onRetrySave} />
      </div>

      <Button variant="outline" size="sm" className="w-64 justify-start" onClick={onOpenPalette}>
        <MagnifyingGlassIcon aria-hidden />
        Actions
        <kbd className="ml-auto font-sans text-xs text-muted-foreground">⌘K</kbd>
      </Button>

      <div className="flex min-w-0 items-center justify-end gap-1">
        {toolbar}
        <ThemeToggle />
      </div>
    </header>
  );
}
