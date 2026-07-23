# Unlink Command - Product Requirements Document (PRD)

## Requirements Description

### Background
- **Business Problem**: Users need a safe, deterministic way to remove symlinks created by the `link` command. Currently, there is no built-in way to undo a `link` operation — users must manually find and delete symlinks, which is error-prone and risks removing the wrong files.
- **Target Users**: Developers using `workspace-manager` to manage multi-repo workspaces who have run `link` and need to revert those symlinks (e.g., when changing the `link` config, removing a workspace, or cleaning up).
- **Value Proposition**: Provides a config-driven, safe, and idempotent way to remove symlinks — the exact inverse of `link`, maintaining architectural symmetry and user trust.

### Feature Overview
- **Core Features**:
  - Remove symlinks created by the `link` command, driven by the `link` map in `workspace.yml`
  - Validate link paths (same rules as `link`: no empty, absolute, or `..` segments)
  - Interactive confirmation before removing each symlink (consistent with `link`)
  - Idempotent: re-running on already-removed symlinks is a no-op
  - Skip missing submodules with a warning (same as `link`)
- **Feature Boundaries**:
  - ✅ Removes symlinks at destinations specified in the current `link` config
  - ✅ Skips destinations that don't exist (idempotent)
  - ✅ Skips destinations that are not symlinks (warns, does not touch real files)
  - ❌ Does NOT scan for stale symlinks from previous config versions (Approach A — config-driven only)
  - ❌ Does NOT remove the target/source files (only the symlink itself)
- **User Scenarios**:
  1. User runs `link`, then decides to revert: runs `unlink` to clean up all symlinks
  2. User removes a `link` entry from `workspace.yml`: runs `unlink` to remove that specific symlink
  3. User removes a workspace from config: runs `unlink` to clean up its symlinks

### Detailed Requirements
- **Input/Output**:
  - Input: `workspace.yml` config (same discovery as `link`: `--config`, `--workspace-root`, `--debug`)
  - Output: `UnlinkReport` with `unlinkedCount`, `skippedCount`, `warnedCount`, `configPath`, `workspaceRoot`
- **User Interaction**:
  - For each symlink to remove: prompt `Remove <path>?` (y/N) unless `--yes` flag is set
  - On `y`: remove the symlink
  - On `N` or `--yes` not set: skip and count
  - Present summary report on completion (green for success, yellow for warnings)
- **Data Requirements**:
  - Reuse `LinkEntry` from `domain/link-plan.ts` (or a subset)
  - Reuse `validateLinkMap` and `getLinkableWorkspaces` from `domain/link-plan.ts`
  - Reuse `buildLinkEntries` from `domain/link-plan.ts`
- **Edge Cases**:
  - Destination doesn't exist → silent skip (idempotent, count as skipped)
  - Destination exists but is NOT a symlink (real file/dir) → warn and skip (do NOT remove real files)
  - Destination is a symlink → remove it (after confirmation)
  - Destination is a dangling symlink → remove it (after confirmation)
  - Submodule directory missing → warn and skip (same as `link`)
  - Link map validation fails → fail fast with `CONFIG_INVALID` (same as `link`)

## Design Decisions

### Technical Approach
- **Architecture Choice**: Mirror `link` command exactly — thin cmd, service orchestration, domain pure functions, port interfaces, concrete adapters. This ensures consistency and reusability.
- **Key Components**:
  - `src/cmds/unlink.ts` — Cliffy command action, presents `UnlinkReport`
  - `src/services/unlink.ts` — `UnlinkService` class, orchestrates discovery, config loading, validation, and removal
  - `src/domain/unlink-plan.ts` — Pure functions (can reuse `link-plan.ts` exports; may add `shouldRemove` logic)
  - `src/ports/file-system.ts` — Reuse existing `FileSystemPort` (no new port methods needed)
  - `src/adapters/confirmer.ts` — Reuse `CliffyConfirmer` for interactive prompts
- **Data Storage**: No new storage — reads `workspace.yml` via existing `ConfigStore` port
- **Interface Design**:
  - CLI: `unlink [options]` with `-c/--config`, `-w/--workspace-root`, `-d/--debug`, `-y/--yes`
  - Service: `UnlinkService.run(input: UnlinkInput): Promise<Result<UnlinkReport, AppError>>`
  - Report: `{ workspaceRoot, configPath, unlinkedCount, skippedCount, warnedCount }`

### Constraints
- **Performance Requirements**: None beyond `link`'s — sequential removal is fine (symlinks are fast to remove)
- **Compatibility**: Same as `link` — Deno 2.4+, TypeScript strict mode
- **Security**: No new risks — only removes symlinks, never target files. Confirmation prompts prevent accidental removal.
- **Scalability**: Not a concern — workspace configs are small (typically < 20 workspaces, < 100 link entries)

### Risk Assessment
- **Technical Risks**:
  - Low: Reuses existing infrastructure. Main risk is accidentally removing a non-symlink, mitigated by `lstat` check.
- **Dependency Risks**:
  - None — all dependencies already exist (`FileSystemPort`, `ConfigStore`, `WorkspaceDiscovery`, `Confirmer`)
- **Schedule Risks**:
  - Low — estimated 0.5-1 day implementation (mirrors `link` closely)

## Acceptance Criteria

### Functional Acceptance
- [ ] `unlink` reads `link` map from `workspace.yml` and removes symlinks at the configured destinations
- [ ] `unlink` validates link paths (rejects empty, absolute, `..` segments) with `CONFIG_INVALID` error
- [ ] `unlink` skips missing submodules with a warning (does not fail)
- [ ] `unlink` skips destinations that don't exist (idempotent, no error)
- [ ] `unlink` warns and skips destinations that are NOT symlinks (does not remove real files)
- [ ] `unlink` prompts `Remove <path>?` before removing each symlink (unless `--yes`)
- [ ] `unlink` supports `--yes` flag to skip all confirm prompts
- [ ] `unlink` presents a summary report with `unlinkedCount`, `skippedCount`, `warnedCount`
- [ ] `unlink` is idempotent — re-running produces the same result with no errors
- [ ] `unlink` does NOT remove target/source files (only symlinks)

### Quality Standards
- [ ] Code follows AGENTS.md conventions (Deno, TypeScript strict, tabs, Result/AppError)
- [ ] Service layer has unit tests with fake ports (coverage of all edge cases)
- [ ] Domain functions are pure and tested independently
- [ ] No bare `try/catch` in application code (use `Result.fromAsyncCatching` / `Result.wrap`)
- [ ] CLI command wired in `src/cli.ts` and composition root in `src/composition.ts`
- [ ] `deno fmt` and `deno lint` pass cleanly

### User Acceptance
- [ ] UX is consistent with `link` command (colors, emoji, prompt style)
- [ ] Report output is clear and actionable
- [ ] `--help` output describes the command and options
- [ ] README.md updated with `unlink` command documentation

## Execution Phases

### Phase 1: Preparation
**Goal**: Confirm architecture and reuse strategy
- [ ] Review `link` command implementation for reuse patterns
- [ ] Confirm `UnlinkReport` shape and error codes
- [ ] Create `docs/prds/unlink-command-v1.0-prd.md` (this document)
- **Deliverables**: Approved PRD, architecture confirmation
- **Time**: 0.5 hours

### Phase 2: Core Development
**Goal**: Implement `unlink` command, service, and domain logic
- [ ] Create `src/cmds/unlink.ts` — Cliffy command action
- [ ] Create `src/services/unlink.ts` — `UnlinkService` class
- [ ] Create `src/domain/unlink-plan.ts` — pure functions (or reuse `link-plan.ts`)
- [ ] Wire command in `src/cli.ts`
- [ ] Wire service in `src/composition.ts`
- [ ] Add `AppErrorCode.UNLINK_FAILED` if needed (or reuse existing codes)
- **Deliverables**: Working `unlink` command
- **Time**: 3-4 hours

### Phase 3: Integration & Testing
**Goal**: Test coverage and edge cases
- [ ] Write `src/services/unlink_test.ts` — service layer tests with fake ports
- [ ] Write `src/domain/unlink-plan_test.ts` — domain function tests
- [ ] Test edge cases: missing submodule, non-symlink destination, dangling symlink, idempotency
- [ ] Run `deno test` and ensure all tests pass
- [ ] Run `deno fmt` and `deno lint`
- **Deliverables**: Test coverage, passing CI checks
- **Time**: 2-3 hours

### Phase 4: Documentation
**Goal**: User-facing documentation
- [ ] Update `README.md` with `unlink` command section (mirrors `link` section)
- [ ] Add example `workspace.yml` with `link` map (if not already present)
- [ ] Update `AGENTS.md` if new conventions introduced (unlikely)
- **Deliverables**: Updated README, example config
- **Time**: 1 hour

---

## Assumptions (made due to incomplete clarification)

The following assumptions were made where requirements were not fully clarified:

1. **Non-symlink destinations**: `unlink` will warn and skip (not error/abort). This is consistent with `link`'s safety-first approach — never touch real files.
2. **Stale symlinks**: `unlink` will NOT scan for or remove symlinks from previous config versions. Only the current `link` map is used (Approach A).
3. **`--yes` flag**: Supported, skips all confirm prompts (consistent with `sync`/`add`).
4. **Prompt granularity**: One prompt per symlink (consistent with `link`'s per-entry prompts).
5. **Error codes**: Will reuse existing codes where possible (`CONFIG_INVALID` for validation failures). A new `UNLINK_FAILED` code may be added for unexpected removal failures.

These assumptions should be validated with the user before implementation begins.

---

**Document Version**: 1.0
**Created**: 2025-06-18
**Clarification Rounds**: 1 (partial — assumptions noted above)
**Quality Score**: 85/100 (pending user validation of assumptions)
