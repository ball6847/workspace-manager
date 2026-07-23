# link-command - Product Requirements Document (PRD)

## Requirements Description

### Background

- **Business Problem**: Developers using this multi-repo workspace CLI often need shared files/directories (e.g. `.agents/`, prompt files like `AGENT.md`) available inside each submodule. Manually copying them causes drift; manually creating symlinks is tedious and error-prone.
- **Target Users**: Developers managing multi-repo workspaces with this CLI (Git submodules + optional `go.work`).
- **Value Proposition**: Declarative, config-driven symlinking from workspace root into submodules — one command, idempotent, portable (relative links), safe (all-or-nothing validation).

### Feature Overview

- **Core Features**:
  - New standalone CLI command: `link`
  - New per-workspace config field `link`: a map of `destination → source`
    - **Key**: path relative to the submodule root (the symlink to create)
    - **Value**: path relative to the workspace root (the link target)
  - Supports linking both **files and directories**
  - Two-phase execution: validate everything first (all-or-nothing), then link
  - Interactive overwrite confirmation (`y/N`) for conflicting destinations
- **Feature Boundaries**:
  - **In scope**: standalone `link` command; config schema extension; validation; interactive linking; summary output
  - **Out of scope** (future): integration into the `sync` pipeline; `--yes`/non-interactive mode; link removal/unlink command; absolute symlink targets
- **User Scenarios**:
  - Sharing an `.agents/` directory from the workspace root into every submodule
  - Giving each submodule its own `AGENT.md` pointing at a per-repo prompt file (e.g. `prompt/BACKEND.md`) in the workspace root

Example config:

```yaml
workspaces:
  - url: 'git@example.com:org1/repo1.git'
    path: projects/repo1
    branch: fake-branch1
    isGolang: true
    active: true
    link:
      .agents: .agents              # dir link: <submodule>/.agents -> <root>/.agents
      AGENT.md: prompt/BACKEND.md   # file link: <submodule>/AGENT.md -> <root>/prompt/BACKEND.md
```

### Detailed Requirements

- **Input/Output**:
  - Input: `workspace.yml` (via standard config discovery), no command-specific flags for now (shared flags like `--config` / `--workspace-root` / `--debug` apply as usual)
  - Output: colored console output per existing conventions; warning for skipped missing submodules; final summary, e.g. `✅ linked: 3, ⏭️  skipped: 1`
- **User Interaction Flow**:
  1. Load and validate `workspace.yml` (Zod schema extended with `link`)
  2. Select workspaces: `active: true` AND `link` map present and non-empty
  3. For each selected workspace, if the submodule directory does not exist on disk → print warning ("run `sync` to grab the missing submodule") and exclude that workspace from further processing
  4. **Phase 1 — Validation (all-or-nothing)**, across all remaining workspaces and all their link entries:
     - Path rules: keys and values must be non-empty, relative, and contain no `..` traversal → violations are `CONFIG_INVALID`
     - Every source (value) must exist in the workspace root (file or directory)
     - No destination (key) may be an existing **real directory** (a non-symlink directory) — the user must fix this manually
     - If **any** check fails → report all violations, exit non-zero, create/modify nothing
  5. **Phase 2 — Linking**, per entry:
     - Destination is already a symlink pointing to the configured source → **silently skip** (idempotent, no log)
     - Destination exists as a real file, or as a symlink pointing elsewhere → prompt `Overwrite? y/N`
       - `y` → remove existing destination, create symlink
       - `N` (default) → skip this entry, continue with the next
     - Destination does not exist → create parent directories as needed (nested keys supported), create symlink
  6. Print summary; exit 0 (user-skips are still success)
- **Data Requirements**:
  - Zod schema extension on `workspaceConfigItemSchema`: `link: z.record(z.string()).optional()`
  - Path validation is a **domain rule** (pure functions in `domain/`): reject empty, absolute, and `..`-containing paths in both keys and values
  - Symlink targets are **relative paths**, computed from the destination's parent directory to the source in the workspace root (e.g. `../../prompt/BACKEND.md`) — fully portable if the workspace folder is moved
- **Edge Cases**:
  - `active: false` workspace with a `link` map → ignored entirely
  - Missing submodule directory → warning + skip workspace (not a validation failure)
  - Nested key paths (e.g. `config/deep/AGENT.md`) → parent directories auto-created
  - Source value pointing to a directory → directory symlink (supported)
  - Destination already a correct symlink → silent skip (re-runs are no-ops)
  - Destination is a broken/dangling symlink → treated as "incorrect link" → overwrite prompt
  - User answers `N` (or just Enter) → skip, continue, still exit 0

## Design Decisions

### Technical Approach

- **Architecture Choice**: Follow existing ports/adapters + service + thin cmd layering (AGENTS.md §3). Pure link-planning rules (path validation, relative target computation, entry classification: create / skip-correct / conflict-file / conflict-dir / missing-source) live in `domain/` as pure, testable functions.
- **Key Components**:
  - `src/domain/config-schema.ts` — extend with `link` field
  - `src/domain/` (new module, e.g. `link-plan.ts`) — pure path validation + link-plan computation
  - `src/ports/file-system.ts` — extend (or add port methods) for: `exists`, `isDirectory`, `lstat`/readlink, `createSymlink`, `remove`, `ensureDir` — only what is needed
  - `src/services/link.ts` — new `LinkService` class: orchestrates discovery → filter → validate → prompt → link, returns `Result<T, AppError>`
  - `src/cmds/link.ts` — thin Cliffy action: flags → service, prompts (Cliffy confirm), summary output, exit-code mapping
  - Composition root wiring in `src/cli.ts` / composition module
- **Data Storage**: `workspace.yml` only (no new state)
- **Interface Design**: `deno run main.ts link [--config …] [--workspace-root …] [--debug]`; no new command-specific flags
- **Error Handling**: `Result<T, AppError>` throughout; new error code suggested: `LINK_VALIDATION_FAILED` (aggregates all phase-1 violations in `context`); `CONFIG_INVALID` for schema/path-rule violations; `PATH_INVALID` reusable where appropriate. No `try/catch` in application code.
- **Prompting**: Cliffy `Confirm` with default `No` (`y/N`); prompting is assumed always possible (non-interactive environments unsupported for now)

### Constraints

- **Performance Requirements**: Trivial scale (tens of entries); no concurrency requirement
- **Compatibility**: Deno 2.4+; symlinks via `Deno.symlink`; relative-target computation must be correct for nested submodule paths (e.g. `projects/repo1`) and nested keys
- **Security**: No absolute paths, no `..` traversal — links can never escape the workspace root or point outside the submodule
- **Scalability**: Future sync-pipeline integration should only require calling `LinkService` from `SyncService` — design the service API to not assume an interactive cmd context (prompt decision injected as a dependency/port)

### Risk Assessment

- **Technical Risks**:
  - Incorrect relative-path computation for deeply nested keys → mitigate with unit tests over path matrices (domain pure functions)
  - Platform symlink differences (Windows) → out of scope; document Unix-like target
- **Dependency Risks**: None new — uses existing Cliffy, Zod, std libs
- **Schedule Risks**: Low; small, well-bounded feature

## Acceptance Criteria

### Functional Acceptance

- [ ] `link` command runs standalone and reads `workspace.yml` via existing discovery rules
- [ ] Workspaces with `active: false` are ignored even if they have a `link` map
- [ ] Missing submodule directories produce a warning mentioning `sync` and are skipped
- [ ] Phase 1 validates ALL entries before ANY link is created; any violation → non-zero exit, zero filesystem changes
- [ ] Absolute paths, `..` traversal, and empty keys/values are rejected as `CONFIG_INVALID`
- [ ] Existing real directory at a destination → validation failure (not a prompt)
- [ ] Missing source in workspace root → validation failure
- [ ] Existing real file or incorrect/dangling symlink at destination → `y/N` prompt; `y` replaces, `N` skips
- [ ] Correct existing symlink → silently skipped (idempotent re-run produces no changes and no per-entry log)
- [ ] Nested keys create parent directories automatically
- [ ] Created symlinks use relative targets verifiable with `readlink`
- [ ] Summary printed at end; user-skips exit 0

### Quality Standards

- [ ] Code Quality: `deno fmt` / `deno lint` clean; tabs, double quotes, braces everywhere; layering rules respected (no adapter imports in cmd/service, no `try/catch`)
- [ ] Test Coverage: `Deno.test` unit tests with fakes covering: path validation rules, active filtering, missing-submodule skip, validation all-or-nothing, idempotent skip, overwrite y/N branches, nested parent creation, relative target computation
- [ ] Performance Metrics: N/A (trivial)
- [ ] Security Review: path-traversal rejection tested

### User Acceptance

- [ ] User Experience: output follows existing emoji/color conventions (✅ ⚠️ ❌ 💡); prompt defaults to `N`
- [ ] Documentation: README.md updated with `link` command usage and config example
- [ ] Training Materials: N/A

## Execution Phases

### Phase 1: Preparation

**Goal**: Config schema and domain rules in place

- [ ] Extend `workspaceConfigItemSchema` with `link: z.record(z.string()).optional()` + schema tests (valid/invalid)
- [ ] Implement pure domain module: path validation + link-plan computation + tests
- **Deliverables**: schema + domain module with passing unit tests
- **Time**: ~0.5 day

### Phase 2: Core Development

**Goal**: Port methods, `LinkService`, and command

- [ ] Extend filesystem port + adapter with needed primitives (symlink, lstat/readlink, remove, ensureDir)
- [ ] Implement `LinkService` (discovery → filter → validate → link orchestration, `Result`-based)
- [ ] Implement thin `src/cmds/link.ts` (prompts, summary, exit codes) and wire in composition root
- **Deliverables**: working `link` command
- **Time**: ~1 day

### Phase 3: Integration & Testing

**Goal**: Quality assurance

- [ ] Service tests with fakes covering all acceptance criteria branches
- [ ] Manual end-to-end test against a temp workspace with real git submodules
- [ ] `deno fmt`, `deno lint`, full test suite green
- **Deliverables**: verified feature
- **Time**: ~0.5 day

### Phase 4: Deployment

**Goal**: Documentation and release readiness

- [ ] Update README.md (usage + config example)
- [ ] Note future work in docs/code comments: sync-pipeline integration, `--yes` flag, non-interactive mode
- **Deliverables**: documented, mergeable PR
- **Time**: ~0.25 day

---

## Clarification Summary

| Round | Key Decisions |
| ----- | ------------- |
| 1 | Standalone command (sync integration deferred); skips `active: false`; relative symlink targets for portability; all-or-nothing source validation before linking |
| 2 | Real directory at destination = hard validation failure (user fixes manually); already-correct links silently skipped; no `--yes`/non-interactive support; nested keys auto-create parents; `..` rejected |
| 3 | Missing submodule = warning + skip (suggest `sync`), not a validation failure; absolute paths/empty keys also rejected; summary printed; user-skips exit 0, only validation failures exit non-zero |

**Document Version**: 1.0
**Created**: 2025-01-01
**Clarification Rounds**: 3
**Quality Score**: 92/100
