import { PlusIcon, SquaresFourIcon } from "@phosphor-icons/react";
import { Button } from "@/components/ui/button";

export function ProjectsEmptyState({
  onCreate,
  isCreating,
}: {
  onCreate: () => void;
  isCreating: boolean;
}) {
  return (
    <div className="flex flex-1 flex-col items-center justify-center rounded-lg border border-dashed py-24 text-center">
      <SquaresFourIcon weight="duotone" className="size-8 text-muted-foreground" aria-hidden />
      <p className="mt-4 text-sm font-medium">No projects yet</p>
      <p className="mt-1 max-w-sm text-sm text-muted-foreground">
        Each project is one whiteboard. Draw an architecture, run traffic through it, and see
        where it breaks.
      </p>
      <Button size="sm" className="mt-6" onClick={onCreate} disabled={isCreating}>
        <PlusIcon aria-hidden />
        New project
      </Button>
    </div>
  );
}
