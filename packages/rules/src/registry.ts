import { createsCycle } from "./connection-rules/creates-cycle.ts";
import { directDatabaseAccess } from "./connection-rules/direct-database-access.ts";
import { discouragedProtocols } from "./connection-rules/discouraged-protocols.ts";
import { duplicateConnection } from "./connection-rules/duplicate-connection.ts";
import { incompatibleProtocols } from "./connection-rules/incompatible-protocols.ts";
import { queryPortToService } from "./connection-rules/query-port-to-service.ts";
import { routerToDatabase } from "./connection-rules/router-to-database.ts";
import { selfConnection } from "./connection-rules/self-connection.ts";
import type { ConnectionRule } from "./types.ts";

/**
 * Every connection rule, one line each. Within a severity, the first rule that applies
 * explains the verdict, so specific rules come before the fallbacks.
 */
export const connectionRules: readonly ConnectionRule[] = [
  selfConnection,
  duplicateConnection,
  queryPortToService,
  incompatibleProtocols,
  createsCycle,
  directDatabaseAccess,
  routerToDatabase,
  discouragedProtocols,
];
