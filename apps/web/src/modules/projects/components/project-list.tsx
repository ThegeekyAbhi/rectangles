"use client";

import { PlusIcon, WarningCircleIcon } from "@phosphor-icons/react";
import { useRouter } from "next/navigation";
import { useEffect } from "react";
import { Button } from "@/components/ui/button";
import { purgeDeletedProjects } from "../api/project-repository";
import { useCreateProject } from "../api/use-project-mutations";
import { useProjects } from "../api/use-projects";
import { ProjectCard } from "./project-card";
import { ProjectsEmptyState } from "./projects-empty-state";

function ProjectListSkeleton() {
  return (
    <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3" aria-hidden>
      {[0, 1, 2].map((index) => (
        <li key={index} className="h-[74px] animate-pulse rounded-lg border bg-muted/50" />
      ))}
    </ul>
  );
}

export function ProjectList() {
  const router = useRouter();
  const projects = useProjects();
  const createProject = useCreateProject();

  // Projects deleted in an earlier visit can no longer be restored; clear them out once.
  useEffect(() => {
    void purgeDeletedProjects();
  }, []);

  const createAndOpen = () => {
    createProject.mutate(undefined, {
      onSuccess: (project) => router.push(`/projects/${project.id}`),
    });
  };

  return (
    <>
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-semibold tracking-tight">Projects</h1>
        <Button size="sm" onClick={createAndOpen} disabled={createProject.isPending}>
          <PlusIcon aria-hidden />
          New project
        </Button>
      </div>

      <div className="mt-8 flex flex-1 flex-col">
        {projects.isPending ? (
          <ProjectListSkeleton />
        ) : projects.isError ? (
          <div
            role="alert"
            className="flex flex-1 flex-col items-center justify-center rounded-lg border border-dashed py-24 text-center"
          >
            <WarningCircleIcon weight="duotone" className="size-8 text-destructive" aria-hidden />
            <p className="mt-4 text-sm font-medium">Couldn&apos;t load your projects</p>
            <p className="mt-1 max-w-sm text-sm text-muted-foreground">
              Projects are stored in this browser. Check that site data is allowed, then try
              again.
            </p>
            <Button size="sm" variant="outline" className="mt-6" onClick={() => projects.refetch()}>
              Try again
            </Button>
          </div>
        ) : projects.data.length === 0 ? (
          <ProjectsEmptyState onCreate={createAndOpen} isCreating={createProject.isPending} />
        ) : (
          <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {projects.data.map((project) => (
              <ProjectCard key={project.id} project={project} />
            ))}
          </ul>
        )}
      </div>
    </>
  );
}
