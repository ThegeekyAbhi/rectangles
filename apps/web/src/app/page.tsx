import { SiteHeader } from "@/components/site-header";
import { ProjectList } from "@/modules/projects";

export default function Home() {
  return (
    <>
      <SiteHeader />
      <main className="mx-auto flex w-full max-w-5xl flex-1 flex-col px-6 py-10">
        <ProjectList />
      </main>
    </>
  );
}
