"use client";

import type { Icon, IconProps } from "@phosphor-icons/react";
import { CubeIcon, HardDrivesIcon, UsersThreeIcon } from "@phosphor-icons/react";

const ICON_BY_COMPONENT_TYPE: Readonly<Record<string, Icon>> = {
  client: UsersThreeIcon,
  "api-server": HardDrivesIcon,
};

/**
 * The icon for a component type. A type without an entry gets a generic one, so a
 * component newly added to the engine shows up on the board without any change here.
 */
export function ComponentIcon({ componentType, ...props }: IconProps & { componentType: string }) {
  const TypeIcon = ICON_BY_COMPONENT_TYPE[componentType] ?? CubeIcon;
  return <TypeIcon aria-hidden {...props} />;
}
