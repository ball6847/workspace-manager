# AGENTS.md

Technical constraints and conventions for AI agents (and humans) working in this repository.
Read this **before** writing any code.

> Scope of this file: **how** we build. Product requirements (README, HOOKS.md) define **what** and **why**.

This project is a **CLI tool** for managing multi-repo workspaces (Git submodules + optional Go `go.work`). Prefer simple solutions that match that size. Do not introduce HTTP servers, databases, ORMs, or a frontend toolchain without an explicit decision and an update here.

Related docs (detail, not architecture contracts):

- `FORMATTING.md` — formatting and extraction style
- `TYPESCRIPT_RESULT_GUIDE.md` — Result usage patterns
- `HOOKS.md` — post-sync hooks product docs
- `README.md` — user-facing usage

---

## 1. Runtime & Package Management

- **Runtime**: Deno 2.4+ with TypeScript. Node.js is not a target.
- **Package manifest**: `deno.json` at repo root (tasks, lint, fmt, imports).
- **Package sources**: prefer **JSR** (`@cliffy/*`, `@std/*`); use **npm:** only when no suitable JSR package exists.
- **Formatting/lint**: `deno fmt` and `deno lint` are canonical. No Prettier/ESLint.
- **TypeScript**: strict mode. No `any` without an inline justification comment.
- **No import path aliases** in Deno source. Use **relative imports** for app code.
- **Indentation**: tabs, 4-space width, 200 character line width, double quotes (from `deno.json`).

---

## 2. Entry Points & Commands (Cliffy)

CLI via Cliffy. Composition root wires dependencies; commands stay thin.

| Command  | Responsibility                                              | Primary service(s)   |
| -------- | ----------------------------------------------------------- | -------------------- |
| `sync`   | Checkout missing repos, align branches, run post-sync hooks | `SyncService`        |
| `update` | Checkout tracking branches and pull latest                  | `UpdateService`      |
| `status` | Show branch/dirty state for configured workspaces           | `StatusService`      |
| `add`    | Add a repo to `workspace.yml` (optionally sync)             | `AddService`         |
| `enable` | Enable disabled workspace entries                           | `EnableService`      |
| `save`   | Persist current git branch state into config                | `SaveService`        |
| `open`   | Interactive open workspace in editor                        | `OpenService`        |

Rules:

- One process per command invocation.
- The **composition root** (`main.ts` + `src/cli.ts` wiring helpers) is the _only_ place that constructs adapters and services and injects dependencies.
- Cliffy command actions receive **already-constructed services** (or a small command context object). They must **not** instantiate adapters (`GitManager`, `GoWork`, `ConfigManager`, `HookExecutor`, …) themselves.
- Commands map CLI flags → service inputs, present UX (colors, prompts, tables), and map `Result` / `AppError` → exit codes. Orchestration logic lives in services.

Shared flags (typical): `--config` / `-c`, `--workspace-root` / `-w`, `--debug` / `-d`, `--concurrency` / `-j`, `--yes` / `-y` where applicable.

---

## 3. Architecture — Port & Adapter + Layered (CLI)

There is **no database, no HTTP API, no repository/ORM layer**. Persistence is YAML config + git/filesystem, always behind adapters.

```
┌──────────────────────────────────────────────────────────────┐
│  Composition root (main / cli wiring)                         │  DI: build adapters + services
├──────────────────────────────────────────────────────────────┤
│  cmds/*          (Cliffy actions — thin)                      │  flags, UX, exit codes
├──────────────────────────────────────────────────────────────┤
│  services/*      (use-case orchestration)                     │  call ports, map errors
├──────────────────────────────────────────────────────────────┤
│  domain/*        (pure rules & types)                         │  no I/O
├──────────────────────────────────────────────────────────────┤
│  ports/*         (interfaces only)                            │  zero runtime deps
│  adapters/*      (git, go, fs, config, hooks)                 │  external I/O
└──────────────────────────────────────────────────────────────┘
```

### Layering rules (enforced by **review only** — see §10)

- **cmd** → may import Service (+ presentation helpers). Must not import concrete adapters or call `Deno.Command` / raw FS for business I/O.
- **Service** → may import ports (interfaces) + domain types. **Must not** import Cliffy prompts, or concrete adapter classes. **Must not** hold pure business rules that belong in `domain/`. Services orchestrate: call ports, delegate decisions to domain, return `Result<T, AppError>`. CLI progress/status may use `console.log` + `@std/fmt/colors` (see §7).
- **Adapter** → implements a port; wraps git/subprocess, filesystem, YAML, hooks. No multi-workspace orchestration logic.
- **Ports** live in `ports/` with **zero runtime dependencies**. Services depend on ports, not concrete adapters.
- **Domain** (entities, pure filters, path defaults) live in `domain/` and depend on nothing external.

### Dependency injection

- **Classes are mandatory** for Services and Adapters. No freestanding functional “services” for use-cases.
- Constructor injection only. Dependencies are `readonly` constructor params.
- No global singletons, no service locator, no decorators. The composition root wires everything.
- Adapters are injected as **port interfaces** (TypeScript `type` or `interface` without `I` prefix) so tests can substitute fakes.
- Factory ports are allowed when many short-lived instances are needed (e.g. `GitPortFactory = (cwd: string) => GitPort`).

### Target package layout

```
main.ts
src/
├── cli.ts                 # Cliffy registration + composition root hooks
├── composition.ts         # Dependency injection: builds adapters + services
├── cmds/                  # Thin command actions (one file per command)
├── services/              # Use-case classes
├── domain/                # Pure types and rules
├── ports/                 # Port interfaces only
├── adapters/              # Concrete I/O (git, go, fs, config, hooks)
├── testing/               # Shared fakes for unit tests
├── types/                 # Shared DTOs / command option types (or fold into domain)
└── libs/                  # Pure utils + shims + error helpers — no I/O policy
```

---

## 4. Error Handling — AppError + typescript-result

### try/catch is BANNED in application code

- Use **`typescript-result`** (`Result`) for all fallible work. See `TYPESCRIPT_RESULT_GUIDE.md`.
- Wrap throwing APIs with `Result.fromAsyncCatching` / `Result.wrap` / library helpers — never bare `try/catch` in cmds, services, adapters, or domain.
- **Allowed exception boundaries only**:
  - Process edge in `main.ts` (last-resort CLI parse failure → log + exit).
  - Framework/runtime hooks if added later (must log and convert to `AppError`, never swallow).

### Result is mandatory

```ts
import { Result } from "typescript-result";

const result = await port.readConfig();
if (!result.ok) {
	return Result.error(result.error);
}
return Result.ok(result.value);
```

- Services and adapters return `Promise<Result<T, AppError>>` (or `Result<T, AppError>` when sync).
- Prefer early-return on `!result.ok`.

### Sentinel AppError

- Every domain/application error is an **`AppError`** (or subclass) with:
  - `code: string` — stable **SCREAMING_SNAKE_CASE** machine code
  - `message: string` — human-readable
  - optional `cause`, optional `context: Record<string, unknown>` (**never secrets**)
- Errors are **values** returned inside `Result.error(...)`, not thrown across layer boundaries.
- Unknown errors at an adapter boundary are wrapped into a sentinel (`INTERNAL`, `GIT_FAILED`, `FS_FAILED`, etc.) with `cause` set.

Suggested codes (extend as needed):

| Code              | Meaning                                      |
| ----------------- | -------------------------------------------- |
| `CONFIG_NOT_FOUND`| workspace.yml / config path missing          |
| `CONFIG_INVALID`  | YAML/schema validation failed                |
| `CONFIG_WRITE_FAILED` | failed to write config                   |
| `NOT_A_GIT_REPO`  | path exists but is not a git repo            |
| `GIT_FAILED`      | git subprocess failed                        |
| `CHECKOUT_FAILED` | clone/checkout/pull of submodule failed      |
| `BRANCH_MISMATCH` | wrong branch (when treated as hard error)    |
| `GO_UNAVAILABLE`  | Go toolchain missing when required           |
| `GO_WORK_FAILED`  | go work operation failed                     |
| `HOOK_FAILED`     | post-sync hook non-zero exit                 |
| `PATH_INVALID`    | bad/unsafe path                              |
| `CANCELLED`       | user cancelled interactive prompt            |
| `INVALID_INPUT`   | invalid CLI argument or required input missing |
| `INTERNAL`        | unexpected / unclassified                    |

- CLI presentation maps `AppError.code` → user-facing message (and optional debug dump of `context` / `cause` when `--debug`).
- Do **not** introduce `await-to-js` or a parallel Result helper. One error stack: **AppError + typescript-result**.

---

## 5. Data / State

- **No ORM, no SQL, no migration tooling.** Do not add Drizzle, Prisma, SQLite, Postgres, or similar.
- Durable state is:
  - `workspace.yml` (and related git metadata) behind **ConfigStore** / git ports
  - git submodule state on disk
  - optional `go.work` behind **GoWork** port
- Services never call `Deno.readTextFile` / `Deno.Command` / `fetch` directly; they call port methods.
- Workspace discovery (cwd/parent walk for `workspace.yml`) is a dedicated port/adapter, used from the composition root or a small bootstrap service — not reimplemented in every command.

---

## 6. Config — Cliffy + YAML + Zod

- **Cliffy** owns CLI flags and command wiring.
- **workspace.yml** is the primary product config (see README / example).
- A **Zod schema** validates parsed YAML at load time. Invalid config → `CONFIG_INVALID` → command refuses to proceed.
- Optional: zod (or shared types) for command option shapes at the composition boundary.
- **Merge / resolution order** for workspace location:
  1. Explicit `--config` + `--workspace-root` when both set
  2. Only `--config` → derive workspace root from config file directory
  3. Only `--workspace-root` → look for config there
  4. Neither → discover `workspace.yml` in cwd and parents
- Never commit real secrets. Document flags in README.

Example shape (authoritative fields live in schema + types):

```yaml
editor: "nvim"
hooks:
  postSyncHooks: []
workspaces:
  - url: "git@github.com:user/repo.git"
    path: services/my-service
    branch: main
    isGolang: true
    active: true
```

---

## 7. Logging & CLI Output

Use plain **`console.log` / `console.error`** with **`@std/fmt/colors`** — not a structured Logger port or leveled structured-log stack.

- **User-facing and operational messages**: `console.log` + colors (`green`, `yellow`, `red`, `blue`, `gray`, …) and the existing emoji patterns (✅ ⚠️ ❌ 🎉 💡, etc.).
- **Where**: primarily **cmd** presentation; services/adapters may print progress or status the same way when helpful. Prefer keeping heavy UX (tables, prompts) in cmds.
- **Debug**: gate verbose output behind `--debug` / `-d` when needed (e.g. only print extra detail if the flag is set). No separate log-level framework required.
- **Errors**: present `AppError` via cmd helpers / `console` + colors (and optional debug dump of `context` / `cause` when `--debug`). See §4.
- **Do not introduce** a `Logger` port, structured key=value log fields API, or third-party logging package unless explicitly decided and this section is updated.
- **Never log secrets** (tokens, keys, private env).

Example style (see also `FORMATTING.md`):

```ts
import { green, red, yellow } from "@std/fmt/colors";

console.log(green(`✅ Completed for ${path}`));
console.log(yellow(`⚠️  Hook failed for ${path} with exit code ${exitCode}`));
console.error(red(`❌ ${commandName} failed:`), error.message);
```

---

## 8. Testing

- **Framework**: `Deno.test`. Coverage via `deno coverage` when enabled.
- **Service layer**: aim for strong coverage of orchestration and domain rules.
- **Must-have tests** (do not skip once infrastructure exists):
  - workspace discovery resolution order
  - config Zod validation (valid + invalid)
  - active/inactive workspace filtering
  - checkout-when-missing vs skip-existing sync paths
  - branch mismatch / dirty handling as implemented
  - go.work add/remove when `isGolang`
  - hook failure vs success reporting
- Adapters: integration tests with temp dirs and stubbed subprocess where practical. No live network in CI unless explicitly allowed.
- **Fakes over mocks**: inject fake ports. Avoid runtime mocking libraries.
- Naming: `*_test.ts` colocated with the module (Deno convention).

---

## 9. Code Style

### Types & control flow

- Prefer `type` over `interface` for object shapes (ports may use either; stay consistent per file).
- Use `type` keyword when importing types: `import { type Foo } from "./foo.ts"`.
- async/await for all asynchronous work.
- **Early-return** for error/edge cases; **early-continue** in loops. Avoid deep nesting.
- Extract complex conditionals into named helpers (see `FORMATTING.md`).

### Curly braces (mandatory)

Always use braces on `if`, `else`, `for`, `while`, `do` — even for single-statement bodies.

```ts
// ❌ Wrong
if (condition) doSomething();

// ✅ Correct
if (condition) {
	doSomething();
}
```

### Formatting

Follow `deno.json` + `FORMATTING.md` (single logical line for non-control-flow; multi-line object args with 3+ properties; no unused parameters).

---

## 10. Layer-Boundary Enforcement — Review Only

There is **no automated lint rule** that forbids cross-layer imports in v1.

Reviewers **MUST** reject:

- a Service importing Cliffy UI, or a concrete adapter class / `Deno.Command` / raw FS
- pure business rules living only in a Service or cmd instead of `domain/`
- a cmd importing adapters directly (must go through services/ports)
- an Adapter importing a Service
- use of a concrete adapter type where a port should be injected
- bare `try/catch` in application code
- introduction of HTTP server, database/ORM, or frontend SPA without an explicit decision and AGENTS.md update
- introduction of `await-to-js` or a second error-handling stack alongside Result

If import hygiene becomes a recurring problem, a custom `deno lint` plugin may be added later — **not required for initial compliance**.

---

## 11. Naming Conventions — Summary

| Concern           | Convention                                      | Example                                      |
| ----------------- | ----------------------------------------------- | -------------------------------------------- |
| CLI flags         | kebab-case long options                         | `--workspace-root`, `--debug`                |
| Error codes       | SCREAMING_SNAKE_CASE                            | `CONFIG_INVALID`, `GIT_FAILED`               |
| Env vars          | UPPER_SNAKE_CASE                                | `EDITOR`                                     |
| TS files          | kebab-case                                      | `workspace-manager.ts`, `config-manager.ts`  |
| Tests             | `*_test.ts` colocated                           | `sync_test.ts`                               |
| Deno imports      | relative, no aliases                            | `../ports/git.ts`                            |
| Classes           | PascalCase                                      | `SyncService`, `GitAdapter`                  |
| Ports             | PascalCase, no `I` prefix                       | `GitPort`, `ConfigStore`                     |
| Sentinel errors   | PascalCase, `Error` suffix / `AppError` base    | `AppError`, `ConfigInvalidError` (optional)  |
| Result returns    | `Result<T, AppError>`                           | `Promise<Result<void, AppError>>`            |

---

## 12. Stack Snapshot (intentional)

| Layer        | Choice                                              |
| ------------ | --------------------------------------------------- |
| Runtime      | Deno 2.4+                                           |
| CLI          | Cliffy (`@cliffy/*` via JSR)                        |
| Config       | YAML (`@std/yaml`) + **Zod** validation             |
| Errors       | **AppError** sentinels + **typescript-result**      |
| Logging      | `console.log` / `console.error` + **`@std/fmt/colors`** |
| Architecture | Ports/adapters + services + thin cmds + domain      |
| DI           | Composition root, constructor injection             |
| Tests        | `Deno.test`, fakes over mocks                       |
| HTTP         | **None**                                            |
| Database     | **None**                                            |
| ORM          | **None**                                            |

### JSR (preferred)

- `@cliffy/*` — command, prompt, table, ansi, …
- `@std/*` — yaml, path, fmt (including **`@std/fmt/colors`**), text, dotenv, …

### npm (when needed)

- `typescript-result` — **mandatory** error handling
- `zod` — config (and option) validation
- `@117/mutex` — git cwd mutex as needed

---

## 13. Deno Permissions

The CLI requires:

| Permission     | Why                                      |
| -------------- | ---------------------------------------- |
| `--allow-run`  | Git and Go subprocesses                  |
| `--allow-write`| Config, submodules, go.work              |
| `--allow-read` | Config, workspace tree                   |
| `--allow-env`  | e.g. `$EDITOR`, debug-related env        |
| `--allow-net`  | Git remote operations                    |

---

## 14. Development Workflow

### Adding a new command

1. Define port methods if new I/O is required (or reuse existing ports).
2. Implement/extend a **Service** class returning `Result<T, AppError>`.
3. Add a thin **cmd** that only presents UX and calls the service.
4. Wire construction in the **composition root** (`cli.ts` / wiring module).
5. Add Zod/types for options if needed.
6. Add `*_test.ts` for the service (fakes).
7. Update README.md.

### Adding a new adapter

1. Define or extend a port in `ports/`.
2. Implement adapter under `adapters/`.
3. Return `AppError` with a stable `code`.
4. Wire in composition root only.
5. Prefer fakes in service tests over hitting the real adapter.

### Domain rules

Put pure decisions in `domain/` (e.g. which workspaces are active, default path from repo URL, go.work membership lists). Services call domain functions; they do not re-encode those rules ad hoc in multiple cmds.
