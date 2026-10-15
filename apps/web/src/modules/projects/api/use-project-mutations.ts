import { useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { describeError } from "../lib/describe-error";
import type { ProjectSummary } from "../types";
import {
  createProject,
  deleteProject,
  duplicateProject,
  purgeProject,
  renameProject,
  restoreProject,
} from "./project-repository";
import { projectKeys } from "./use-projects";

function useRefreshProjects() {
  const queryClient = useQueryClient();
  return () => queryClient.invalidateQueries({ queryKey: projectKeys.list() });
}

export function useCreateProject() {
  const refreshProjects = useRefreshProjects();
  return useMutation({
    mutationFn: createProject,
    onSuccess: refreshProjects,
    onError: (error) => toast.error("Couldn't create the project", { description: describeError(error) }),
  });
}

export function useRenameProject() {
  const refreshProjects = useRefreshProjects();
  return useMutation({
    mutationFn: ({ projectId, name }: { projectId: string; name: string }) =>
      renameProject(projectId, name),
    onSuccess: refreshProjects,
    onError: (error) => toast.error("Couldn't rename the project", { description: describeError(error) }),
  });
}

export function useDuplicateProject() {
  const refreshProjects = useRefreshProjects();
  return useMutation({
    mutationFn: duplicateProject,
    onSuccess: async (copy) => {
      await refreshProjects();
      toast.success(`Created “${copy.name}”`);
    },
    onError: (error) => toast.error("Couldn't duplicate the project", { description: describeError(error) }),
  });
}

/**
 * Deletes a project and offers Undo. The project is only removed for good once the
 * toast has gone without Undo being used.
 */
export function useDeleteProject() {
  const refreshProjects = useRefreshProjects();
  return useMutation({
    mutationFn: (project: ProjectSummary) => deleteProject(project.id),
    onSuccess: async (project) => {
      await refreshProjects();
      let isRestored = false;
      const purgeUnlessRestored = () => {
        if (!isRestored) {
          void purgeProject(project.id);
        }
      };
      toast(`Deleted “${project.name}”`, {
        action: {
          label: "Undo",
          onClick: () => {
            isRestored = true;
            void restoreProject(project.id).then(refreshProjects);
          },
        },
        onAutoClose: purgeUnlessRestored,
        onDismiss: purgeUnlessRestored,
      });
    },
    onError: (error) => toast.error("Couldn't delete the project", { description: describeError(error) }),
  });
}
