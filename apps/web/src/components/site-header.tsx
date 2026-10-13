import Link from "next/link";
import { RectangleIcon } from "@phosphor-icons/react/ssr";
import { ThemeToggle } from "@/components/theme-toggle";

export function SiteHeader() {
  return (
    <header className="border-b">
      <div className="mx-auto flex h-14 w-full max-w-5xl items-center justify-between px-6">
        <Link
          href="/"
          className="flex items-center gap-2 text-sm font-medium tracking-tight"
        >
          <RectangleIcon weight="duotone" className="size-5" aria-hidden />
          Rectangles
        </Link>
        <ThemeToggle />
      </div>
    </header>
  );
}
