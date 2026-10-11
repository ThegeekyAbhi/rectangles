# Rectangles

Interactive system-design simulator. Product spec: [PRD.md](PRD.md). Build plan: [MilestoneBased.md](MilestoneBased.md).

Next.js 16 has breaking changes versus older versions — read `apps/web/AGENTS.md` before writing web code.

## Commands

Run from the repo root.

```
pnpm dev         # all apps
pnpm build
pnpm lint
pnpm typecheck
```

## Repo layout

```
apps/
  web/          Next.js 16 app
  api/          Fastify server (auth, projects)            — planned
packages/
  schema/       Zod schemas for the architecture document  — planned
  engine/       Simulation engine, zero runtime deps       — planned
  rules/        Connection + graph validation              — planned
```

Package names are `@rectangles/<name>`.

## Folder structure rules

The codebase is organised by **module** (a feature or domain area), not by file type. Code that changes together lives together.

### 1. Dependency direction

```
app (routes)  ──►  modules  ──►  shared (components, lib, hooks)  ──►  packages
```

Imports only go left to right. Shared code never imports a module. A module never imports from `app/`.

### 2. Web app — `apps/web/src`

```
app/                    Routing only. Pages and layouts compose modules; no business logic here
modules/
  <module>/
    components/         React components owned by this module
    hooks/              Hooks owned by this module
    store/              Zustand slices
    api/                Server calls (React Query hooks, fetchers)
    lib/                Pure helpers
    types.ts
    index.ts            Public API — the only file other code may import
components/
  ui/                   shadcn primitives (generated — do not hand-edit structure)
  <shared>.tsx          Components used by 2+ modules
hooks/                  Hooks used by 2+ modules
lib/                    Utilities used by 2+ modules
```

Planned modules: `auth`, `projects`, `whiteboard`, `inspector`, `validation`, `simulation`, `metrics`, `experiments`.

A module only creates the subfolders it needs. A module with three files does not need five folders.

### 3. API — `apps/api/src`

```
modules/
  <module>/
    routes.ts           HTTP layer: parse, call service, respond
    service.ts          Business logic; no Fastify types
    repository.ts       Database access; the only place that touches Drizzle
    schema.ts           Request/response Zod schemas
    index.ts            Fastify plugin that registers the module
plugins/                Cross-cutting Fastify plugins (db, security, session)
db/                     Drizzle schema and migrations
app.ts                  Builds the app (used by tests)
server.ts               Starts it
```

Layering inside a module: `routes → service → repository`. Never skip a layer or go backwards.

### 4. Engine — `packages/engine/src`

```
kernel/                 Event loop, clock, PRNG, Context — knows no component by name
components/
  <component>/
    definition.ts       Type, config schema, ports, declared metrics, "not modeled" list
    behaviour.ts        Event handlers
    *.test.ts
registry.ts             One line per component
metrics/
index.ts
```

- No React, DOM, or Node-only APIs. No runtime dependencies.
- Components never import `kernel/` internals or each other; they receive a `Context`.
- No `if (type === "...")` in the kernel. Adding a component means adding a folder and one registry line.

### 5. Rules — `packages/rules/src`

```
ports/                  Port protocols and connection matching
graph-rules/
  <rule-id>.ts          One rule per file: { id, severity, check, message, fix? }
registry.ts
index.ts
```

Connection validity is derived from port declarations, never hand-written per component pair.

### 6. Module boundaries

- **Import other modules only through their `index.ts`.** `@/modules/projects` is fine; `@/modules/projects/components/project-card` is not.
- Export the minimum from `index.ts`. Unexported means private.
- No circular dependencies between modules. If two modules need each other, the shared part moves down into `lib/` or a package.
- **Promote on second use.** Code stays inside its module until a second module needs it, then moves to shared. Do not pre-emptively share.
- Types and schemas used by both web and api live in `packages/schema`, not copied.

### 7. Naming and files

- Files and folders: `kebab-case`. Components: `PascalCase` export, one main component per file.
- Hooks: `use-<thing>.ts`. Stores: `<thing>-store.ts`. Tests: `<file>.test.ts` next to the file they test.
- No barrel files except a module's or package's `index.ts`.
- No `utils.ts` dumping grounds inside modules; name the file after what it does.
- Web imports use the `@/` alias; no `../../..` across module boundaries.

### 8. Where does new code go?

1. Does it belong to one feature? → that module.
2. Used by two or more modules, and UI? → `components/`. Not UI? → `lib/` or `hooks/`.
3. Needed by both web and api, or by the engine? → a package.
4. Is it a route file (`page.tsx`, `layout.tsx`, `route.ts`)? → `app/`, kept thin.

## Conventions

- TypeScript strict. No `any` without a comment explaining why.
- Icons: `@phosphor-icons/react` (`/ssr` entry in server components). Not lucide.
- UI primitives come from shadcn (`pnpm dlx shadcn@latest add <name>` in `apps/web`).
