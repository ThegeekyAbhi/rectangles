import { useQuery } from "@tanstack/react-query";
import { listProjects, loadProject } from "./project-repository";

export const projectKeys = {
  all: ["projects"] as const,
  list: () => [...projectKeys.all, "list"] as const,
  detail: (projectId: string) => [...projectKeys.all, "detail", projectId] as const,
};

export function useProjects() {
  return useQuery({ queryKey: projectKeys.list(), queryFn: listProjects });
}

/**
 * Loads one project and its board. The result is never served from cache, because the
 * board is edited locally after loading and a cached copy would be out of date.
 */
export function useLoadedProject(projectId: string) {
  return useQuery({
    queryKey: projectKeys.detail(projectId),
    queryFn: () => loadProject(projectId),
    gcTime: 0,
    staleTime: Number.POSITIVE_INFINITY,
    refetchOnWindowFocus: false,
    refetchOnReconnect: false,
  });
}
