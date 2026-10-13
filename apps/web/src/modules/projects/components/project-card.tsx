"use client";

import { CopyIcon, DotsThreeIcon, PencilSimpleIcon, TrashIcon } from "@phosphor-icons/react";
import Link from "next/link";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { useDeleteProject, useDuplicateProject } from "../api/use-project-mutations";
import type { ProjectSummary } from "../types";
import { RenameProjectDialog } from "./rename-project-dialog";

const updatedAtFormat = new Intl.DateTimeFormat(undefined, {
  dateStyle: "medium",
  timeStyle: "short",
});

export function ProjectCard({ project }: { project: ProjectSummary }) {
  const [isRenaming, setIsRenaming] = useState(false);
  const duplicateProject = useDuplicateProject();
  const deleteProject = useDeleteProject();

  return (
    <li className="group relative rounded-lg border bg-card transition-colors hover:border-foreground/25 focus-within:border-foreground/25">
      <Link
        href={`/projects/${project.id}`}
        className="block rounded-lg p-4 pr-12 outline-none focus-visible:ring-2 focus-visible:ring-ring"
      >
        <span className="block truncate text-sm font-medium">{project.name}</span>
        <span className="mt-1 block text-xs text-muted-foreground">
          Edited {updatedAtFormat.format(project.updatedAt)}
        </span>
      </Link>

      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button
            variant="ghost"
            size="icon-sm"
            className="absolute top-3 right-3"
            aria-label={`Actions for ${project.name}`}
          >
            <DotsThreeIcon weight="bold" aria-hidden />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          <DropdownMenuItem onSelect={() => setIsRenaming(true)}>
            <PencilSimpleIcon aria-hidden />
            Rename
          </DropdownMenuItem>
          <DropdownMenuItem onSelect={() => duplicateProject.mutate(project.id)}>
            <CopyIcon aria-hidden />
            Duplicate
          </DropdownMenuItem>
          <DropdownMenuSeparator />
          <DropdownMenuItem variant="destructive" onSelect={() => deleteProject.mutate(project)}>
            <TrashIcon aria-hidden />
            Delete
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>

      {isRenaming && <RenameProjectDialog project={project} onClose={() => setIsRenaming(false)} />}
    </li>
  );
}
