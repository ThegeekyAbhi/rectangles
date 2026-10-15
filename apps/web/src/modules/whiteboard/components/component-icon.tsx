import type { Icon, IconProps } from "@phosphor-icons/react";
// The SSR build reads no React context, so this renders on the server (lesson diagrams) and on the board alike.
import {
  ArrowsSplitIcon,
  CubeIcon,
  DatabaseIcon,
  GearSixIcon,
  HardDrivesIcon,
  LightningIcon,
  MagnifyingGlassIcon,
  QueueIcon,
  UsersThreeIcon,
} from "@phosphor-icons/react/ssr";

/**
 * Includes types the engine does not simulate yet (database, cache, queue, worker,
 * search), so diagrams that show them already look right.
 */
const ICON_BY_COMPONENT_TYPE: Readonly<Record<string, Icon>> = {
  client: UsersThreeIcon,
  "api-server": HardDrivesIcon,
  "load-balancer": ArrowsSplitIcon,
  database: DatabaseIcon,
  cache: LightningIcon,
  queue: QueueIcon,
  worker: GearSixIcon,
  search: MagnifyingGlassIcon,
};

/**
 * The icon for a component type. A type without an entry gets a generic one, so a
 * component newly added to the engine shows up on the board without any change here.
 */
export function ComponentIcon({ componentType, ...props }: IconProps & { componentType: string }) {
  const TypeIcon = ICON_BY_COMPONENT_TYPE[componentType] ?? CubeIcon;
  return <TypeIcon aria-hidden {...props} />;
}
