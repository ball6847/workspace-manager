---
createdAt: "2026-05-25T10:30:00Z"
implementedAt: "2026-05-26T10:30:00Z"
reviewedAt: null
---

# Plan: Fix Sync Command to Match PRD Business Rules

## Overview

This plan addresses the critical gaps between the PRD business rules and the current `workspace-manager sync` implementation. The sync command must be modified to: (1) always checkout the configured branch regardless of current state, (2) implement **tiered error handling** (blocking errors fail fast, workspace errors collected), (3) handle detached HEAD correctly without feature flags, and (4) achieve 100% test coverage with table-driven tests against real Git filesystems.

**Note**: PRD updated to v1.1 with **Option B (Pragmatic Tiered Error Handling)**. This plan now reflects that model.

## Target Structure

```
src/
├── cmds/
│   └── sync.ts              # Modified: fix branch logic, error collection
├── libs/
│   ├── git.ts               # Modified: fix getCurrentBranch, remove WM_USE_NAME_REV
│   └── concurrent.ts        # Modified: add error collection variant
├── tests/
│   ├── sync/
│   │   ├── sync_command_test.ts     # NEW: table-driven tests
│   │   ├── fixtures/                # NEW: test workspace configs
│   │   │   └── workspace.yml
│   │   └── git_fixtures.ts          # NEW: real git repo helpers
│   └── git/
│       └── git_manager_test.ts      # NEW: branch detection tests
```

## Files to Create

### 1. `tests/sync/git_fixtures.ts`

**Purpose**: Helper to create and manage real Git repositories for testing

**Interface**:
```typescript
export class GitTestFixture {
    static async createRepo(path: string, initialBranch?: string): Promise<Result<void, Error>>
    static async createCommit(repoPath: string, message: string, files?: string[]): Promise<Result<string, Error>>
    static async createBranch(repoPath: string, branchName: string, fromBranch?: string): Promise<Result<void, Error>>
    static async setupSubmodule(parentPath: string, submoduleUrl: string, submodulePath: string, branch?: string): Promise<Result<void, Error>>
    static async cleanup(path: string): Promise<Result<void, Error>>
}
```

**Behavior**:
- Creates temporary directories for test repos
- Initializes git repos with commits
- Creates branches and submodules
- Cleans up after tests
- Uses Deno's native `Deno Command` for git operations (no mocks)

### 2. `tests/sync/sync_command_test.ts`

**Purpose**: Table-driven tests for sync command covering 100% of scenarios

**Structure**:
```typescript
// Test table type
type SyncTestCase = {
    name: string;
    setup: () => Promise<Result<TestWorkspaceSetup, Error>>;
    expected: {
        workspaces: Array<{
            path: string;
            expectedBranch: string;
            expectedCommit: string;
            shouldExist: boolean;
        }>;
        goWorkUpdated: boolean;
        hooksExecuted: string[];
        errorsCollected: number;
        exitCode: number;
    };
};
```

**Test Coverage Matrix**:

| **Category** | **Scenarios** | **Test Count** |
|--------------|---------------|----------------|
| New Workspace | Directory doesn't exist, checkout from remote | 2 |
| Branch States | Correct branch up-to-date, correct branch behind, wrong branch, detached HEAD | 4 |
| Dirty States | Clean working dir, uncommitted changes, staged changes, untracked files | 4 |
| Inactive Workspaces | Remove existing, remove non-existing | 2 |
| Go Workspace | Active golang, inactive golang, no golang | 3 |
| Error Handling | Git error, network error, permission error, partial failure | 4 |
| Concurrency | Sequential (concurrency=1), parallel (concurrency=4) | 2 |
| Hooks | Global hooks, workspace hooks, hook failures | 3 |
| **Total** | | **24** |

### 3. `tests/git/git_manager_test.ts`

**Purpose**: Unit tests for GitManager branch detection

**Test Cases**:
- TC-GIT-001: `getCurrentBranch` returns branch name when on branch
- TC-GIT-002: `getCurrentBranch` returns "HEAD" when in detached state
- TC-GIT-003: `getCurrentBranch` works in worktree repositories
- TC-GIT-004: `getCurrentBranch` works in submodule directories
- TC-GIT-005: `checkoutBranch` switches from branch to branch
- TC-GIT-006: `checkoutBranch` switches from detached HEAD to branch

## Files to Modify

### 1. `src/libs/git.ts`

**Changes**:

**a. Remove `WM_USE_NAME_REV` feature flag**
- Delete environment variable check
- Remove `getCurrentBranchWithNameRev` method
- Simplify `getCurrentBranch` to only use `symbolic-ref` fallback

**b. Fix detached HEAD detection**
```typescript
// NEW implementation
async getCurrentBranch(): Promise<Result<string, Error>> {
    // First try: get branch name via symbolic-ref
    const symbolicRefResult = await this.runCommand([
        "symbolic-ref",
        "--short",
        "HEAD",
    ]);
    
    if (symbolicRefResult.ok && symbolicRefResult.value.success) {
        // We're on an actual branch
        return Result.ok(new TextDecoder().decode(symbolicRefResult.value.stdout).trim());
    }
    
    // Fallback: we're in detached HEAD - return "HEAD"
    return Result.ok("HEAD");
}
```

**Rationale**: Always returns "HEAD" for detached state, forcing branch switch in sync logic

### 2. `src/cmds/sync.ts`

**Changes**:

**a. Always checkout configured branch**
```typescript
// REMOVE: Conditional branch check
// if (currentBranch.value !== workspace.branch) { ... }

// REPLACE WITH: Always checkout
console.log(yellow(`🔄 Switching to configured branch: ${workspace.branch}`));
const checkout = await subGit.checkoutBranch(workspace.branch);
if (!checkout.ok) {
    console.log(red(`❌ Failed to checkout branch for ${workspace.path}`), `(${checkout.error.message})`);
    return Result.error(checkout.error);
}
```

**b. Always pull after branch operations**
- Ensure pull happens in all code paths (after checkout, after stash/unstash)

**c. Implement Tiered Error Handling**
- **Blocking errors**: Discovery/config failures - fail immediately
- **Phase errors**: Workspace removal/sync failures - collect within phase, report at phase end
- **Workspace errors**: Individual workspace failures - continue with other workspaces

**For inactive workspace removal (Phase 1):**
```typescript
const removeResults = await processConcurrentlyWithResults(
    inactiveWorkspaces,
    (workspace) => removeInactiveWorkspace(workspace, workspaceRoot)
);
const removeErrors = removeResults.filter(r => !r.ok).map(r => r.error);
// Continue to next phase even if some removals failed
```

**For active workspace sync (Phase 2):**
```typescript
const syncResults = await processConcurrentlyWithResults(
    activeWorkspaces,
    (workspace) => syncSingleWorkspace(workspace, workspaceRoot, workspaceManager)
);
const syncErrors = syncResults.filter(r => !r.ok).map(r => r.error);
// Continue to next phase even if some syncs failed
```

**d. Modify `syncSingleWorkspace` to always checkout**
- Remove conditional branch check
- Always attempt checkout to configured branch
- Simplifies logic and matches PRD

### 3. `src/libs/hooks.ts`

**Changes**: Implement error collection for hooks (instead of fail-fast)

**Fix executeHooks to collect all hook errors:**
```typescript
// BEFORE: Returns on first error
if (!result.ok) {
    return Result.error(result.error);
}

// AFTER: Collect all errors
const hookErrors: Error[] = [];
for (const result of results) {
    if (!result.ok) {
        hookErrors.push(result.error);
    }
}
if (hookErrors.length > 0) {
    return Result.error(new AggregateError(hookErrors, "Some hooks failed"));
}
```

### 4. `src/libs/concurrent.ts`

**Changes**: No new functions needed - use existing `processConcurrentlyWithResults`

### 5. `src/libs/errors.ts`

**Changes**: Add AggregateError class for collecting multiple errors
```typescript
export class AggregateError extends Error {
    constructor(public readonly errors: Error[], message?: string) {
        super(message ?? `Aggregate error: ${errors.length} errors occurred`);
        this.name = "AggregateError";
    }
}
```

## Diagrams

### State Transition Diagram (Current vs Fixed with Tiered Errors)

**Fixed Behavior (Tiered Error Handling):**
```
[Start]
  |
  v
[Discovery & Validation] -- blocking error? --> STOP (immediate)
  |
  v
[Inactive Workspace Removal] -- collect phase errors, continue to next phase
  |
  v
[Active Workspace Sync] -- collect phase errors, continue to next phase
  |
  v
[Go Workspace Setup] -- collect phase errors, continue to next phase
  |
  v
[Post-Sync Hooks] -- collect all hook errors
  |
  v
[Report Results] -- Report blocking errors (if any), then phase errors, then workspace errors
```

**Key Differences from Original:**
- Always checkout branch, regardless of current state
- Blocking errors (discovery) fail immediately
- Phase errors (removal, sync, go setup) collect within phase, continue to next
- Workspace errors continue with other workspaces
- All non-blocking errors aggregated and reported at end

## Test Cases

### TC-SYNC-001: New Workspace Checkout

**Priority:** P0
**Type:** Functional

#### Objective
Verify sync creates and checks out a new workspace that doesn't exist

#### Preconditions
- Workspace root directory exists and is a git repo
- Workspace config includes a workspace with `active: true` that doesn't exist on disk
- Remote repository exists at configured URL

#### Test Steps
1. Run `workspace-manager sync --workspace-root <path> --config <config>`
   **Expected:** Workspace directory is created via git submodule add
2. Check directory exists at configured path
   **Expected:** Directory exists
3. Check git branch in workspace directory
   **Expected:** Branch equals configured branch
4. Check latest commit
   **Expected:** Commit equals remote HEAD

#### Post-conditions
- New workspace directory exists
- Git submodule is initialized
- On configured branch at latest commit

---

### TC-SYNC-002: Detached HEAD Recovery

**Priority:** P0
**Type:** Functional

#### Objective
Verify sync recovers from detached HEAD state by checking out configured branch

#### Preconditions
- Workspace exists and is a git submodule
- Current state: detached HEAD (simulated via `git checkout <commit-hash>`)
- Configured branch: main

#### Test Steps
1. Run `workspace-manager sync`
   **Expected:** Command detects need to checkout branch
2. Check git branch after sync
   **Expected:** Branch is "main" (not detached)
3. Check commit
   **Expected:** At latest commit of main branch

#### Post-conditions
- Workspace is on configured branch
- Not in detached HEAD state

---

### TC-SYNC-003: Always Pull on Correct Branch

**Priority:** P0
**Type:** Functional

#### Objective
Verify sync always pulls latest changes even when already on correct branch

#### Preconditions
- Workspace exists on configured branch
- Local is 1 commit behind remote

#### Test Steps
1. Note current commit hash
   **Expected:** Commit A
2. Run `workspace-manager sync`
   **Expected:** Pull operation executed
3. Check commit hash
   **Expected:** Commit B (latest from remote)

#### Post-conditions
- Workspace is at latest commit

---

### TC-SYNC-004: Dirty Workspace with Stash

**Priority:** P0
**Type:** Functional

#### Objective
Verify sync handles uncommitted changes via stash/pop pattern

#### Preconditions
- Workspace exists on configured branch
- Local has uncommitted file changes
- Remote has new commits

#### Test Steps
1. Note uncommitted changes exist
   **Expected:** `git status` shows modifications
2. Run `workspace-manager sync`
   **Expected:** Changes are stashed, pull executed, changes unstashed
3. Check uncommitted changes
   **Expected:** Original changes are restored
4. Check commit
   **Expected:** Latest from remote

#### Post-conditions
- Uncommitted changes preserved
- Remote changes merged

---

### TC-SYNC-005: Multiple Workspace Partial Failure (Phase Errors)

**Priority:** P0
**Type:** Functional

#### Objective
Verify sync **collects phase errors** and continues to next phase, reporting all errors

#### Preconditions
- 3 workspaces configured
- Workspace A: valid and syncable
- Workspace B: invalid git URL (will fail during sync phase)
- Workspace C: valid and syncable

#### Test Steps
1. Run `workspace-manager sync`
   **Expected:** Command processes all 3 workspaces in sync phase
2. Check console output
   **Expected:** Success for A and C, error for B collected
3. Check exit code
   **Expected:** Non-zero (failure)
4. Verify A and C state
   **Expected:** Both synced successfully
5. Verify Go workspace setup
   **Expected:** Still attempted (phase errors don't block next phase)

#### Post-conditions
- A and C are synced
- B sync failed, error collected
- Go workspace phase still executed
- All phase errors reported at end

---

### TC-SYNC-014: Blocking Error Stops Immediately

**Priority:** P0
**Type:** Functional

#### Objective
Verify **blocking errors** (discovery failure) stop sync immediately

#### Preconditions
- No workspace.yml config file exists
- Or workspace root is not a valid directory

#### Test Steps
1. Run `workspace-manager sync --workspace-root /invalid/path`
   **Expected:** Command stops immediately at discovery phase
2. Check console output
   **Expected:** Error message about discovery failure
3. Check exit code
   **Expected:** Non-zero (failure)
4. Verify no workspace operations attempted
   **Expected:** No git operations performed

#### Post-conditions
- Sync stopped at discovery
- No partial operations performed
- Clear error message about blocking issue

---

### TC-SYNC-006: Inactive Workspace Removal

**Priority:** P0
**Type:** Functional

#### Objective
Verify sync removes workspaces marked as inactive

#### Preconditions
- Workspace exists as git submodule
- Config marks workspace as `active: false`

#### Test Steps
1. Run `workspace-manager sync`
   **Expected:** Command identifies inactive workspace
2. Check directory after sync
   **Expected:** Directory removed
3. Check git submodule status
   **Expected:** Submodule deinitialized and removed

#### Post-conditions
- Inactive workspace removed from filesystem
- Git repository cleaned up

---

### TC-SYNC-007: Go Workspace Update

**Priority:** P1
**Type:** Functional

#### Objective
Verify sync updates go.work file with active golang workspaces

#### Preconditions
- 2 golang workspaces configured
- Workspace A: `isGolang: true, active: true`
- Workspace B: `isGolang: true, active: false`
- go.work file exists or needs creation

#### Test Steps
1. Run `workspace-manager sync`
   **Expected:** go.work file updated
2. Check go.work contents
   **Expected:** Contains Workspace A, does not contain Workspace B

#### Post-conditions
- go.work file reflects active golang workspaces

---

### TC-SYNC-008: Worktree Branch Detection

**Priority:** P1
**Type:** Integration

#### Objective
Verify branch detection works correctly in multi-worktree repositories

#### Preconditions
- Workspace root is a multi-worktree git repository
- Workspace submodule is checked out in a worktree
- Current branch in worktree is "feature/x"

#### Test Steps
1. Run `workspace-manager sync` with configured branch "main"
   **Expected:** Command detects current branch correctly
2. Check branch after sync
   **Expected:** Switched to "main"

#### Post-conditions
- Branch detection works in worktree
- Branch switching works in worktree

---

### TC-GIT-001: Detached HEAD Detection

**Priority:** P0
**Type:** Unit

#### Objective
Verify `GitManager.getCurrentBranch()` returns "HEAD" when in detached state

#### Preconditions
- Git repository with commits
- HEAD is in detached state (`git checkout <commit-hash>`)

#### Test Steps
1. Call `getCurrentBranch()`
   **Expected:** Returns Result.ok("HEAD")

#### Post-conditions
- Detached state correctly identified

---

### TC-GIT-002: Branch Detection on Actual Branch

**Priority:** P0
**Type:** Unit

#### Objective
Verify `GitManager.getCurrentBranch()` returns branch name when on branch

#### Preconditions
- Git repository
- On branch "main"

#### Test Steps
1. Call `getCurrentBranch()`
   **Expected:** Returns Result.ok("main")

#### Post-conditions
- Branch name correctly identified

## Verification Commands

```bash
# Run all sync tests
deno test --allow-run --allow-write --allow-read --allow-env tests/sync/

# Run specific test
deno test --allow-run --allow-write --allow-read --allow-env tests/sync/sync_command_test.ts

# Run git manager tests
deno test --allow-run --allow-write --allow-read --allow-env tests/git/git_manager_test.ts

# Check coverage
deno coverage --include=src/cmds/sync.ts,src/libs/git.ts tests/
```

## Expected Outcome

1. All 26+ test cases pass (including new blocking/phase error tests)
2. Code coverage for `sync.ts`, `git.ts`, `hooks.ts`, and `errors.ts` reaches 100%
3. Sync command behavior matches PRD v1.1 business rules exactly
4. Detached HEAD handling works without feature flags
5. **Tiered error handling implemented**:
   - Blocking errors fail immediately
   - Phase errors collected within phase, continue to next phase
   - Workspace errors continue with other workspaces
6. Worktree and single-repo behavior is identical

## Rollback Plan

If issues arise after implementation:

1. **Revert git.ts changes**: Restore previous `getCurrentBranch` implementation with WM_USE_NAME_REV
2. **Revert sync.ts changes**: Restore conditional branch checkout logic
3. **Revert hooks.ts changes**: Restore fail-fast behavior in executeHooks
4. **Revert errors.ts changes**: Remove AggregateError class
5. **Run existing tests**: Ensure no regressions in other commands

All changes are isolated to these files: `src/libs/git.ts`, `src/cmds/sync.ts`, `src/libs/hooks.ts`, `src/libs/errors.ts`, `src/libs/concurrent.ts`
