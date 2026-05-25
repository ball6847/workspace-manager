# workspace-manager sync - Product Requirements Document (PRD)

## Requirements Description

### Background
- **Business Problem**: Developers need a reliable way to synchronize multiple Git submodule-based workspaces to their configured branches, ensuring all repositories are up-to-date and on the correct branch before starting work
- **Target Users**: Software developers working with multi-repository workspaces (monorepos, microservices, polyrepos)
- **Value Proposition**: Eliminates manual repository management overhead; ensures consistent, reproducible workspace state across team members

### Feature Overview
- **Core Feature**: Synchronize all workspace submodules to their configured branches at the latest commit
- **Feature Boundaries**: 
  - Handles active and inactive workspace configurations
  - Manages Git submodule lifecycle (addition, removal, branch switching)
  - Integrates with Go workspace management (go.work file)
  - Executes post-sync hooks for custom workflows
  - Does NOT modify workspace configuration (add/remove/reconfigure workspaces)
- **User Scenarios**:
  - Onboarding new team member: checkout all workspaces
  - Daily development: pull latest changes across all workspaces
  - Feature branching: switch all workspaces to new branch
  - Cleanup: remove inactive/obsolete workspaces

### Detailed Requirements

#### Input/Output
- **Input**: 
  - Workspace configuration file (`workspace.yml`) with workspace definitions
  - Optional: `--config` path, `--workspace-root` path, `--concurrency` level, `--debug` flag
- **Output**:
  - Console output with progress and status for each workspace
  - Exit code 0 on success, non-zero on failure
  - All workspaces on their configured branch at latest commit

#### User Interaction
- **Trigger**: CLI command `workspace-manager sync [options]`
- **Progress Feedback**: Color-coded console output (blue=info, green=success, yellow=warning, red=error)
- **Error Reporting**: **Tiered error handling** - blocking errors stop immediately, workspace errors collected and reported at end

#### Data Requirements
- **Workspace Configuration** (`workspace.yml`):
  ```yaml
  workspaces:
    - url: git@github.com:user/repo.git
      path: services/my-service
      branch: main
      isGolang: true
      active: true
      postSyncHooks: []
  editor: "nvim"
  hooks:
    postSyncHooks: []
  ```
- **Validation Rules**:
  - `url` must be valid Git URL
  - `path` must be relative path within workspace root
  - `branch` must exist in remote repository
  - `active` determines if workspace should be synced or removed

#### Edge Cases
- **New Workspace**: Directory doesn't exist → checkout from remote
- **Missing Remote Branch**: Configured branch doesn't exist → error, continue with others
- **Dirty Working Directory**: Uncommitted changes exist → stash, pull, unstash
- **Detached HEAD State**: Current HEAD is detached → **always checkout configured branch** (business rule)
- **Network Failure**: Cannot reach remote → error, continue with others
- **Git Errors**: Any git command fails → error, continue with others
- **Inactive Workspace**: Marked as inactive → remove from workspace

## Design Decisions

### Technical Approach
- **Architecture**: Modular design with separate concerns (discovery, git operations, workspace management)
- **Concurrency**: Process workspaces concurrently with configurable limit (default: 4)
- **Error Handling**: **Tiered approach** - blocking errors fail fast, workspace errors collected and reported
- **Mutex Strategy**: Per-directory mutex to prevent race conditions in git operations

### Tiered Error Handling

The sync command uses a **pragmatic, tiered error handling model** that balances robustness with practical constraints:

| **Error Type** | **Behavior** | **Rationale** |
|---------------|--------------|---------------|
| **Blocking Errors** | Stop immediately, report error | Without valid foundation, no operations can succeed |
| **Phase Errors** | Collect all errors within phase, continue to next phase | Maximize success within each logical phase |
| **Workspace Errors** | Collect all workspace errors, continue with others | Independent workspaces should not block each other |

**Blocking Errors** (fail immediately):
- Workspace discovery failure (config not found, invalid workspace root)
- Workspace root is not a valid Git repository
- Critical initialization failures

**Phase Errors** (collect within phase):
- Inactive workspace removal failures (collect all removal errors)
- Active workspace sync failures (collect all sync errors)
- Go workspace setup failures

**Workspace Errors** (always continue):
- Individual workspace checkout/pull failures
- Git operation errors for specific workspaces

### Key Components
- **WorkspaceDiscovery**: Locates config file and workspace root
- **GitManager**: Handles all git operations (submodule, branch, stash, pull)
- **WorkspaceManager**: Orchestrates workspace checkout and removal
- **GoWork**: Manages go.work file for Go workspaces
- **HookExecutor**: Runs post-sync hooks
- **Concurrent Processing**: Batch processing with configurable concurrency

### Business Rules (Source of Truth)

#### Branch Management
| Scenario | Current State | Action |
|----------|---------------|--------|
| New workspace | Directory doesn't exist | Checkout submodule at configured branch, pull latest |
| Correct branch, up-to-date | On configured branch, at latest | **Always pull** latest changes |
| Correct branch, behind | On configured branch, not latest | Pull latest changes |
| Wrong branch | On different branch | **Always checkout** configured branch, then pull |
| **Detached HEAD** | HEAD is detached | **Always checkout** configured branch, then pull |
| Dirty working directory | Uncommitted changes | Stash → pull → unstash |

#### Workspace Lifecycle
- **Active Workspaces**: Process for sync (checkout/pull/stash as needed)
- **Inactive Workspaces**: Remove from workspace (git submodule deinit + rm)
- **Go Workspaces**: Update go.work file with active golang workspaces, remove inactive ones

#### Hook Execution
- **Global Hooks**: Execute after all workspaces synced, in workspace root
- **Workspace Hooks**: Execute after each workspace synced, in workspace path
- **Failure Handling**: Hook failures **collected and reported** but do NOT stop sync; continue processing with other hooks

### Constraints
- **Performance**: Concurrent processing with configurable batch size
- **Compatibility**: Git 2.x+, Deno 2.4+, supports standard Git operations
- **Worktree Support**: **Must function identically** in both single-repository and multi-worktree Git configurations
- **Security**: Only operates within configured workspace root; no arbitrary code execution
- **Scalability**: Handles 100+ workspaces efficiently via batching

### Risk Assessment
- **Technical Risks**:
  - Git operation conflicts with user's manual changes → Mitigation: Clear console feedback, stash/unstash pattern
  - Network partitions during sync → Mitigation: Continue with other workspaces, report errors
- **Dependency Risks**:
  - Git CLI availability → Mitigation: Check git availability before operations
  - Go CLI for go.work (optional) → Mitigation: Skip go.work setup if Go unavailable
- **Schedule Risks**: None identified for documentation effort

## Acceptance Criteria

### Functional Acceptance
- [ ] All active workspaces exist as directories
- [ ] All active workspaces are Git repositories
- [ ] All active workspaces are on their configured branch (not detached HEAD)
- [ ] All active workspaces are at the latest commit of their configured branch
- [ ] All inactive workspaces are removed from the workspace
- [ ] go.work file contains all active Golang workspaces
- [ ] go.work file excludes all inactive Golang workspaces
- [ ] All post-sync hooks execute after sync completes
- [ ] Console output clearly indicates progress and status

### Quality Standards
- [ ] Code follows existing project patterns (early-return, Result types)
- [ ] All git operations use mutex locks per directory
- [ ] Error messages are descriptive and actionable
- [ ] No workspace left in inconsistent state (partial checkout, partial branch switch)

### Error Handling Acceptance
- [ ] **Blocking errors** (discovery, invalid git root) stop immediately with error
- [ ] **Workspace errors** do NOT stop entire sync; continue with other workspaces
- [ ] **Phase errors** (removal, sync, go setup) collected within phase, reported at phase end
- [ ] Exit code is non-zero if ANY error occurred
- [ ] Console shows which workspaces succeeded, which failed, and which errors were blocking

### Detached HEAD Acceptance (Critical)
- [ ] When workspace is in detached HEAD state, command **always checks out configured branch**
- [ ] After checkout, workspace is on configured branch (not detached)
- [ ] Then pulls latest changes from origin

## Execution Phases

### Phase 1: Discovery & Validation
**Goal**: Identify all workspaces and validate configuration
- [ ] Discover workspace config file and root directory
- [ ] Parse and validate workspace configuration
- [ ] Identify active and inactive workspaces
- [ ] Validate workspace root is a git repository
- **Deliverables**: Validated workspace configuration, classified workspace list

### Phase 2: Inactive Workspace Removal
**Goal**: Clean up workspaces marked as inactive
- [ ] For each inactive workspace: check if directory exists
- [ ] If exists: deinit submodule, remove from git, clean up .git/modules
- [ ] Report success/failure for each removal
- **Deliverables**: Workspace without inactive submodules

### Phase 3: Active Workspace Sync
**Goal**: Ensure all active workspaces are on correct branch at latest commit
- [ ] For each active workspace (concurrently):
  - [ ] Check if directory exists; if not, checkout from remote
  - [ ] Verify it's a git repository
  - [ ] **Always checkout configured branch** (regardless of current state)
  - [ ] **Always pull latest changes** from origin
  - [ ] If dirty: stash → pull → unstash
- **Deliverables**: All active workspaces on correct branch at latest commit

### Phase 4: Go Workspace Setup
**Goal**: Configure go.work file for Go workspaces
- [ ] Check if Go is available
- [ ] Initialize go.work if not exists
- [ ] Add active Golang workspaces to go.work
- [ ] Remove inactive Golang workspaces from go.work
- **Deliverables**: Updated go.work file with correct workspace entries

### Phase 5: Post-Sync Hooks
**Goal**: Execute custom post-sync workflows
- [ ] Execute global post-sync hooks in workspace root
- [ ] Execute workspace-specific post-sync hooks in each workspace
- [ ] Report hook execution status (success/failure/duration)
- **Deliverables**: All hooks executed, results logged

---

**Document Version**: 1.1
**Created**: 2026-05-25
**Clarification Rounds**: 2
**Quality Score**: 95/100
**Last Updated**: 2026-05-25 - Updated error handling model to tiered approach (Option B)
