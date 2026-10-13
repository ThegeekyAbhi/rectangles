"use client";

import { useId, useState } from "react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { MAX_PROJECT_NAME_LENGTH } from "../api/project-repository";
import { useRenameProject } from "../api/use-project-mutations";
import type { ProjectSummary } from "../types";

export function RenameProjectDialog({
  project,
  onClose,
}: {
  project: ProjectSummary;
  onClose: () => void;
}) {
  const [name, setName] = useState(project.name);
  const renameProject = useRenameProject();
  const inputId = useId();

  return (
    <Dialog open onOpenChange={(isOpen) => !isOpen && onClose()}>
      <DialogContent>
        <form
          className="contents"
          onSubmit={(event) => {
            event.preventDefault();
            renameProject.mutate({ projectId: project.id, name }, { onSuccess: onClose });
          }}
        >
          <DialogHeader>
            <DialogTitle>Rename project</DialogTitle>
            <DialogDescription>The name is only shown to you.</DialogDescription>
          </DialogHeader>
          <div className="grid gap-2">
            <Label htmlFor={inputId}>Name</Label>
            <Input
              id={inputId}
              value={name}
              maxLength={MAX_PROJECT_NAME_LENGTH}
              onChange={(event) => setName(event.target.value)}
              onFocus={(event) => event.target.select()}
              autoFocus
            />
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={onClose}>
              Cancel
            </Button>
            <Button type="submit" disabled={name.trim() === "" || renameProject.isPending}>
              Rename
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
