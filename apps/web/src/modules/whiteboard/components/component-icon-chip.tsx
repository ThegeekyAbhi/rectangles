"use client";

import type { IconWeight } from "@phosphor-icons/react";
import { cn } from "@/lib/utils";
import { categoryTextClass } from "../lib/component-categories";
import { ComponentIcon } from "./component-icon";

const SIZES = {
  sm: { box: "size-6 rounded-md", icon: "size-3.5" },
  md: { box: "size-7 rounded-md", icon: "size-4" },
  lg: { box: "size-9 rounded-lg", icon: "size-5" },
} as const;

/**
 * A component's icon, in its section's colour, in a small outlined box. It is how a
 * component is recognised everywhere: in the library, the command palette and the inspector.
 */
export function ComponentIconChip({
  componentType,
  size = "md",
  weight = "duotone",
  className,
}: {
  componentType: string;
  size?: keyof typeof SIZES;
  weight?: IconWeight;
  className?: string;
}) {
  return (
    <span
      className={cn(
        "flex shrink-0 items-center justify-center border bg-card",
        categoryTextClass(componentType),
        SIZES[size].box,
        className,
      )}
    >
      <ComponentIcon componentType={componentType} weight={weight} className={SIZES[size].icon} />
    </span>
  );
}
