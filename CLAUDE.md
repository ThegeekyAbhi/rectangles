# Rectangles

Interactive system-design simulator. Product spec: [PRD.md](PRD.md). Build plan: [MilestoneBased.md](MilestoneBased.md). How the engine simulates, and its kernel backlog: [simulation-algorithm.md](simulation-algorithm.md).

Next.js 16 has breaking changes versus older versions — read `apps/web/AGENTS.md` before writing web code.

## Commands

Run from the repo root.

```
pnpm dev         # all apps
pnpm build
pnpm lint
pnpm typecheck
pnpm test        # Vitest, per package
pnpm sim <design.json> --seed 1   # run a design through the engine, print metrics
pnpm bench       # engine benchmark; fails below 500k events/s
```

## Repo layout

```
apps/
  web/          Next.js 16 app
  api/          Fastify server (auth, projects)            — planned
packages/
  schema/       Zod schemas for the architecture document  — planned
  engine/       Simulation engine, zero runtime deps
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
    worker/             Web Worker entry, its typed API, and the client that talks to it
    lib/                Pure helpers
    types.ts
    index.ts            Public API — the only file other code may import
components/
  ui/                   shadcn primitives (generated — do not hand-edit structure)
  <shared>.tsx          Components used by 2+ modules
hooks/                  Hooks used by 2+ modules
lib/                    Utilities used by 2+ modules
```

Modules: `projects`, `whiteboard`, `inspector`, `simulation`, `metrics`. Planned: `auth`, `validation`, `experiments`.

`whiteboard` imports no other feature module. What they add to the board (inspector, run controls, results panel, canvas overlays) is passed in as slots by `app/projects/[projectId]/project-workspace.tsx`.

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

### 4. Engine — `packages/engine`

```
src/
  contract/               What a component author sees: Context, ComponentDefinition, config
                          field specs, ports, metrics, time units. Imports nothing else
  kernel/                 Event loop, event queue, PRNG, design graph — knows no component by name
  metrics/                Recording in 1 s windows, run result, run summary, live run snapshot
  components/
    <component>/
      definition.ts       Type, config field specs, ports, declared metrics, "not modeled" list
      behaviour.ts        Event handlers; exports the component via defineComponent
  registry.ts             One line per component
  index.ts
tests/                    Mirrors src/: tests/kernel/event-queue.test.ts tests src/kernel/event-queue.ts
  support/                Stub components, queueing formulas, shared assertions
  registry.test.ts        Conformance suite, run against every registered component
cli/                      `pnpm sim` (Node APIs live here, never in src/)
bench/                    `pnpm bench`
```

- No React, DOM, or Node-only APIs in `src/`. No runtime dependencies. `tsconfig.src.json` and ESLint enforce both.
- Components import only `contract/` and their own folder; they receive a `Context`. Enforced by `eslint-plugin-boundaries`.
- No `if (type === "...")` in the kernel. Adding a component means adding a folder and one registry line.
- Deterministic: no `Math.random`, `Date` or `performance` in `src/`; use `context.prng` and `context.nowMicros`.
- Config is declared as plain field specs (`as const satisfies ConfigFields`), not Zod. The engine validates them itself.
- Imports use explicit `.ts` extensions and `import type`; no enums or parameter properties. Node runs the source directly.
- Naming: time values are integer microseconds and end in `Micros`; user-facing config carries its unit (`serviceTimeMs`). String ids are kebab-case; metric ids are `<subject>.<measure>`. No abbreviations (`request`, `context`, not `req`, `ctx`). British spelling (`behaviour`, `utilisation`).

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
- **Exception: a server-safe entry.** Next bundles every client component a page's imports can reach, so a page that must stay light (lesson diagrams) cannot import a barrel that re-exports the board. A module may add one extra top-level entry (`whiteboard/diagrams.ts`, `projects/open-in-whiteboard.ts`) that exports no heavy client components and says why at the top. Import it like `index.ts`; nothing deeper.
- Export the minimum from `index.ts`. Unexported means private.
- No circular dependencies between modules. If two modules need each other, the shared part moves down into `lib/` or a package.
- **Promote on second use.** Code stays inside its module until a second module needs it, then moves to shared. Do not pre-emptively share.
- Types and schemas used by both web and api live in `packages/schema`, not copied.

### 7. Naming and files

- Files and folders: `kebab-case`. Components: `PascalCase` export, one main component per file.
- Hooks: `use-<thing>.ts`. Stores: `<thing>-store.ts`. Tests: `<file>.test.ts` in a `tests/` folder beside `src/`, at the same relative path as the file they test (`src/kernel/prng.ts` → `tests/kernel/prng.test.ts`). Shared test helpers go in `tests/support/`.
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
- Colours come from the tokens in `apps/web/src/app/globals.css`, used through Tailwind classes (`bg-card`, `text-muted-foreground`, `border`). No hex, `rgb()` or raw colour in components, and no per-component `dark:` colour overrides: the dark theme redefines the same tokens. To change a shade, edit its OKLCH lightness there, then run `tests/app/theme-contrast.test.ts`.
- Surfaces, back to front: `sidebar` (header, side panels), `background` (canvas, results), `card` (nodes, tiles), `popover`. Hue is reserved for load state (`state-healthy`, `state-busy`, `state-saturated`) and component category icons (`category-<id>`).
