import { PlusIcon, SquaresFourIcon } from "@phosphor-icons/react/ssr";
import { SiteHeader } from "@/components/site-header";
import { Button } from "@/components/ui/button";

export default function Home() {
  return (
    <>
      <SiteHeader />
      <main className="mx-auto flex w-full max-w-5xl flex-1 flex-col px-6 py-10">
        <div className="flex items-center justify-between">
          <h1 className="text-xl font-semibold tracking-tight">Projects</h1>
          <Button size="sm" disabled>
            <PlusIcon aria-hidden />
            New project
          </Button>
        </div>

        <div className="mt-8 flex flex-1 flex-col items-center justify-center rounded-lg border border-dashed py-24 text-center">
          <SquaresFourIcon
            weight="duotone"
            className="size-8 text-muted-foreground"
            aria-hidden
          />
          <p className="mt-4 text-sm font-medium">No projects yet</p>
          <p className="mt-1 max-w-sm text-sm text-muted-foreground">
            Each project is one whiteboard. Draw an architecture, run traffic
            through it, and see where it breaks.
          </p>
        </div>
      </main>
    </>
  );
}
