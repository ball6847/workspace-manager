# Codebase Analysis: Repeated Patterns

## Executive Summary

After analyzing the `src/` directory, I've identified several repeated patterns across the command implementations that can be extracted into reusable classes and modules to improve code maintainability and reduce duplication.

## 1. Repeated Patterns Identified

### 1.1 Common Command Options Pattern

**Location**: All command files (`sync.ts`, `update.ts`, `save.ts`, `enable.ts`, `status.ts`, `add.ts`, `open.ts`)

**Pattern**: All commands share a common set of options:
- `config?: string` - Path to workspace config file
- `workspaceRoot?: string` - Path to workspace root directory
- `debug?: boolean` - Enable debug mode
- `concurrency?: number` - Number of concurrent operations (used in sync, update, enable, add, status)

**Example from `sync.ts` (lines 11-30)**:
```typescript
export type SyncCommandOption = {
    config?: string;
    workspaceRoot?: string;
    debug?: boolean;
    concurrency?: number;
};
```

**Example from `update.ts` (lines 10-29)**:
```typescript
export type UpdateCommandOption = {
    config?: string;
    workspaceRoot?: string;
    debug?: boolean;
    concurrency?: number;
};
```

**Impact**: 7 commands with similar option types, leading to ~140 lines of duplicated type definitions.

### 1.2 Workspace Configuration Management Pattern

**Location**: Multiple command files

**Pattern**: Commands repeatedly parse config files, validate workspace directories, and filter workspaces by active status.

**Example from `sync.ts` (lines 47-64)**:
```typescript
const validated = await validateWorkspaceDir(workspaceRoot);
if (!validated.ok) {
    console.log(red("❌ Invalid workspace directory: "), workspaceRoot, `(${validated.error.message})`);
    return Result.error(validated.error);
}

const parseConfig = await parseConfigFile(configFile);
if (!parseConfig.ok) {
    console.log(red("❌ Failed to parse config file: "), configFile, `(${parseConfig.error.message})`);
    return Result.error(parseConfig.error);
}
const config = parseConfig.value;

const activeWorkspaces = config.workspaces.filter((item) => item.active);
```

**Example from `update.ts` (lines 44-60)**:
```typescript
const validated = await validateWorkspaceDir(workspaceRoot);
if (!validated.ok) {
    console.log(red("❌ Invalid workspace directory: "), workspaceRoot, `(${validated.error.message})`);
    return Result.error(validated.error);
}

const parseConfig = await parseConfigFile(configFile);
if (!parseConfig.ok) {
    console.log(red("❌ Failed to parse config file: "), configFile, `(${parseConfig.error.message})`);
    return Result.error(parseConfig.error);
}
const config = parseConfig.value;

const activeWorkspaces = config.workspaces.filter((item) => item.active);
```

**Impact**: This pattern appears in 6 commands (sync, update, save, enable, status, add), resulting in ~180 lines of duplicated code.

### 1.3 Workspace Directory Validation Pattern

**Location**: `sync.ts` (lines 183-192) and `update.ts` (lines 190-199)

**Pattern**: Identical function for validating workspace directories.

**Example from `sync.ts`**:
```typescript
async function validateWorkspaceDir(path: string) {
    const stat = await Result.fromAsyncCatching(() => Deno.stat(path));
    if (!stat.ok) {
        return Result.error(new ErrorWithCause(`Workspace directory is not a directory`, stat.error));
    }
    if (!stat.value.isDirectory) {
        return Result.error(new Error(`Workspace directory is not a directory`));
    }
    return Result.ok();
}
```

**Example from `update.ts`**:
```typescript
async function validateWorkspaceDir(path: string) {
    const stat = await Result.fromAsyncCatching(() => Deno.stat(path));
    if (!stat.ok) {
        return Result.error(new ErrorWithCause(`Workspace directory is not a directory`, stat.error));
    }
    if (!stat.value.isDirectory) {
        return Result.error(new Error(`Workspace directory is not a directory`));
    }
    return Result.ok();
}
```

**Impact**: 20 lines of duplicated code across 2 files.

### 1.4 Git Submodule Checkout Pattern

**Location**: `sync.ts` (lines 201-235) and `open.ts` (lines 288-336)

**Pattern**: Identical logic for checking out a Git submodule with branch, checkout, and pull operations.

**Example from `sync.ts`**:
```typescript
async function gitSubmoduleAdd(url: string, submodulePath: string, branch: string, workspaceRoot: string) {
    const git = new GitManager(workspaceRoot);

    // Add submodule with specified branch
    const addResult = await git.submoduleAdd(url, submodulePath, branch);
    if (!addResult.ok) {
        return Result.error(addResult.error);
    }

    // Check out the submodule to the specified branch
    const fullSubmodulePath = path.join(workspaceRoot, submodulePath);
    const submoduleGit = new GitManager(fullSubmodulePath);
    const checkoutResult = await submoduleGit.checkoutBranch(branch);
    if (!checkoutResult.ok) {
        return Result.error(
            new ErrorWithCause(
                `Failed to checkout submodule at ${submodulePath} to branch ${branch}`,
                checkoutResult.error,
            ),
        );
    }

    // Pull the latest changes from the specified branch
    const pullResult = await submoduleGit.pullOriginBranch(branch);
    if (!pullResult.ok) {
        return Result.error(
            new ErrorWithCause(
                `Failed to pull latest changes for submodule at ${submodulePath} from branch ${branch}`,
                pullResult.error,
            ),
        );
    }

    return Result.ok();
}
```

**Example from `open.ts`**:
```typescript
async function syncSingleWorkspace(
    selected: WorkspaceSelection,
    workspaceRoot: string,
    _debug: boolean,
): Promise<Result<void, Error>> {
    const workspacePath = selected.path;

    console.log(
        yellow(`📥 Checking out workspace: ${workspacePath} from ${selected.url} on branch ${selected.branch}`),
    );

    // Add submodule with specified branch
    const git = new GitManager(workspaceRoot);
    const addResult = await git.submoduleAdd(selected.url, workspacePath, selected.branch);
    if (!addResult.ok) {
        console.log(
            red(`❌ Failed to checkout workspace: ${workspacePath}`),
            `(${addResult.error.message})`,
        );
        return Result.error(addResult.error);
    }

    // Check out the submodule to the specified branch
    const fullSubmodulePath = path.join(workspaceRoot, workspacePath);
    const submoduleGit = new GitManager(fullSubmodulePath);
    const checkoutResult = await submoduleGit.checkoutBranch(selected.branch);
    if (!checkoutResult.ok) {
        return Result.error(
            new ErrorWithCause(
                `Failed to checkout submodule at ${workspacePath} to branch ${selected.branch}`,
                checkoutResult.error,
            ),
        );
    }

    // Pull the latest changes from the specified branch
    const pullResult = await submoduleGit.pullOriginBranch(selected.branch);
    if (!pullResult.ok) {
        return Result.error(
            new ErrorWithCause(
                `Failed to pull latest changes for submodule at ${workspacePath} from branch ${selected.branch}`,
                pullResult.error,
            ),
        );
    }

    console.log(green(`✅ Successfully checked out workspace: ${workspacePath}`));
    return Result.ok();
}
```

**Impact**: 35 lines of duplicated code across 2 files.

### 1.5 Error Handling Pattern

**Location**: All command files

**Pattern**: All commands follow the same error handling pattern with console output and exit.

**Example from `sync.ts` (lines 37-48)**:
```typescript
.action(async (options) => {
    const result = await syncCommand({
        config: options.config,
        workspaceRoot: options.workspaceRoot,
        debug: options.debug,
        concurrency: options.concurrency,
    });
    if (!result.ok) {
        console.log(red("❌ Sync failed:"), result.error.message);
        Deno.exit(1);
    }
});
```

**Example from `update.ts` (lines 70-81)**:
```typescript
.action(async (options) => {
    const result = await updateCommand({
        config: options.config,
        workspaceRoot: options.workspaceRoot,
        debug: options.debug,
        concurrency: options.concurrency,
    });
    if (!result.ok) {
        console.log(red("❌ Update failed:"), result.error.message);
        Deno.exit(1);
    }
});
```

**Impact**: This pattern appears in all 7 commands, resulting in ~70 lines of duplicated code.

### 1.6 Concurrent Processing Pattern

**Location**: `sync.ts`, `update.ts`, `status.ts`

**Pattern**: Commands use `processConcurrently` or `processConcurrentlyWithResults` to process workspaces in parallel.

**Example from `sync.ts` (lines 70-95)**:
```typescript
const removeResult = await processConcurrently(
    inactiveWorkspaces,
    async (workspace) => {
        const workspacePath = path.join(workspaceRoot, workspace.path);
        const git = new GitManager(workspaceRoot);
        const dir = await isDir(workspacePath);
        if (!dir.ok) {
            return Result.ok(); // skip if directory does not exist
        }

        console.log(yellow(`🗑️  Removing inactive workspace: ${workspace.path}`));

        const remove = await git.submoduleRemove(workspace.path);
        if (!remove.ok) {
            console.log(
                red(`❌ Failed to remove inactive workspace: ${workspace.path}`),
                `(${remove.error.message})`,
            );
            return Result.error(remove.error);
        }

        console.log(green(`✅ Successfully removed inactive workspace: ${workspace.path}`));
        return Result.ok();
    },
    concurrency,
);
```

**Example from `update.ts` (lines 67-180)**:
```typescript
const updateResult = await processConcurrently(
    activeWorkspaces,
    async (workspace) => {
        const workspacePath = path.join(workspaceRoot, workspace.path);
        const git = new GitManager(workspacePath);

        // check if directory exists
        const dir = await isDir(workspacePath);
        if (!dir.ok) {
            console.log(yellow(`⚠️  Workspace directory does not exist, skipping: ${workspace.path}`));
            return Result.ok();
        }

        console.log(blue(`🔄 Updating workspace: ${workspace.path} (branch: ${workspace.branch})`));

        // checkout to tracking branch
        const checkoutResult = await git.checkoutBranch(workspace.branch);
        if (!checkoutResult.ok) {
            console.log(
                red(`❌ Failed to checkout to branch ${workspace.branch} in ${workspace.path}`),
                `(${checkoutResult.error.message})`,
            );
            return Result.error(checkoutResult.error);
        }

        // ... more logic

        console.log(green(`✅ Successfully updated workspace: ${workspace.path}`));
        return Result.ok();
    },
    concurrency,
);
```

**Example from `status.ts` (lines 100-168)**:
```typescript
const statusResults = await processConcurrentlyWithResults(
    activeWorkspaces,
    async (workspace) => {
        const workspacePath = path.join(workspaceRoot, workspace.path);
        const git = new GitManager(workspacePath);
        const status: RepositoryStatus = {
            path: workspace.path,
            url: workspace.url,
            trackingBranch: workspace.branch,
            isGoModule: workspace.isGolang,
            active: workspace.active,
            exists: false,
        };

        try {
            // check if directory exists
            const dir = await isDir(workspacePath);
            if (!dir.ok) {
                status.error = "Directory does not exist";
                return Result.ok(status);
            }

            // check if it's a git repository
            const isRepo = await git.isRepository();
            if (!isRepo.ok) {
                status.error = "Failed to check git repository";
                return Result.ok(status);
            }

            if (!isRepo.value) {
                status.error = "Not a git repository";
                return Result.ok(status);
            }

            status.exists = true;

            // get current branch
            const currentBranch = await git.getCurrentBranch();
            if (!currentBranch.ok) {
                status.error = "Failed to get current branch";
                return Result.ok(status);
            }
            status.currentBranch = currentBranch.value;

            // check if working directory is clean
            const isClean = await git.isWorkingDirectoryClean();
            if (!isClean.ok) {
                status.error = "Failed to check working directory";
                return Result.ok(status);
            }
            status.isClean = isClean.value;

            if (!isClean.value || verbose) {
                // count modified and untracked files
                const fileStatus = await getFileStatus(workspacePath);
                if (fileStatus.ok) {
                    status.modifiedFiles = fileStatus.value.modified;
                    status.untrackedFiles = fileStatus.value.untracked;
                }
            }

            return Result.ok(status);
        } catch (error) {
            status.error = error instanceof Error ? error.message : "Unknown error";
            return Result.ok(status);
        }
    },
    concurrency,
);
```

**Impact**: This pattern appears in 3 commands, resulting in ~200 lines of duplicated concurrent processing logic.

### 1.7 Go Workspace Management Pattern

**Location**: `sync.ts` (lines 334-386)

**Pattern**: Logic for managing Go workspace by adding/removing modules from `go.work` file.

**Example from `sync.ts`**:
```typescript
async function setupGoWorkspace(add: string[], remove: string[], goWorkRoot: string): Promise<Result<void, Error>> {
    // Create single GoWork instance for this function
    const goWork = new GoWork(goWorkRoot);

    // Check if Go is available
    const goAvailable = await GoWork.isAvailable();
    if (!goAvailable.ok) {
        return Result.error(new Error("Failed to check Go availability"));
    }

    // Go is not available
    if (!goAvailable.value) {
        return Result.error(new Error("Go is not available."));
    }

    // Initialize go workspace if it doesn't exist
    const initResult = await goWork.init();
    if (!initResult.ok) {
        return Result.error(initResult.error);
    }

    // Remove inactive Go modules
    if (remove.length > 0) {
        const removeResult = await goWork.remove(remove);
        if (!removeResult.ok) {
            return Result.error(removeResult.error);
        }
    }

    // Add active Go modules
    if (add.length > 0) {
        const addResult = await goWork.use(add);
        if (!addResult.ok) {
            return Result.error(addResult.error);
        }
    }

    return Result.ok();
}
```

**Impact**: This pattern is currently only in `sync.ts`, but could be reused in other commands that manage Go workspaces.

### 1.8 Interactive Prompt Pattern

**Location**: `enable.ts` and `add.ts`

**Pattern**: Commands use Cliffy prompts for interactive user input with error handling.

**Example from `enable.ts` (lines 112-125)**:
```typescript
const selectedPathsResult = await Result.wrap(
    () =>
        Checkbox.prompt({
            message: "Select workspaces to enable (use space to toggle, enter to confirm):",
            search: true,
            options,
        }),
    (error) => {
        if (error instanceof Error && error.message.includes("cancelled")) {
            return new ErrorWithCause("Operation cancelled", error);
        }
        return new ErrorWithCause("Failed to prompt for workspace selection", error as Error);
    },
)();
```

**Example from `add.ts` (lines 379-399)**:
```typescript
function promptForRepo(defaultRepo?: string): Promise<Result<string, Error>> {
    return Result.wrap(
        () =>
            Input.prompt({
                message: "Repository URL:",
                default: defaultRepo,
                validate: (value) => {
                    if (!value || value.trim() === "") {
                        return "Repository URL is required";
                    }
                    return true;
                },
            }),
        (error) => {
            if (error instanceof Error && error.message.includes("cancelled")) {
                return new ErrorWithCause("Operation cancelled", error);
            }
            return new ErrorWithCause("Failed to prompt for repository URL", error as Error);
        },
    )();
}
```

**Impact**: This pattern appears in 2 commands, resulting in ~100 lines of duplicated prompt logic.

## 2. Proposed Extracted Classes/Modules

### 2.0 Tight Coupling Analysis

Before implementing the extracted classes, we identified critical tight coupling issues in the original proposals. Addressing these ensures the refactoring improves, not worsens, code quality.

#### 2.0.1 CommandErrorHandler - Hardcoded Deno Exit Dependency

**Issue**: The original `CommandErrorHandler` called `Deno.exit(1)` directly, creating runtime coupling to Deno runtime:

```typescript
if (exitOnError) {
    Deno.exit(1);  // Tight coupling - makes class untestable
}
```

**Impact**:
- Untestable without mocking `Deno.exit`
- Non-reusable outside Deno runtime
- Hard to customize behavior (always exits, can't return error)

**Solution**: Remove `Deno.exit()` call, return `Result`, and let caller handle termination. Accept optional error handler callback.

#### 2.0.2 WorkspaceCheckoutManager - Concrete GitManager Instantiation

**Issue**: The class instantiated `GitManager` directly, violating Dependency Inversion Principle:

```typescript
const git = new GitManager(this.workspaceRoot);  // Tight coupling
const submoduleGit = new GitManager(fullSubmodulePath);  // Tight coupling
```

**Impact**:
- No way to inject mock `GitManager` for testing
- Can't change Git implementation without modifying the class
- Violates DIP (high-level module depends on low-level detail)

**Solution**: Accept `GitManager` factory or instances via constructor injection.

#### 2.0.3 GoWorkspaceManager - Same GitManager Coupling Issue

**Issue**: Identical problem as `WorkspaceCheckoutManager`:

```typescript
const goWork = new GoWork(this.workspaceRoot);  // Tight coupling
```

**Solution**: Accept `GoWork` instances via constructor injection.

#### 2.0.4 InteractivePromptManager - Static Methods with Hardcoded Messages

**Issue**: Static methods with embedded messages make the class:
- Impossible to customize without subclassing
- Hard to internationalize
- Difficult to mock for testing

**Solution**: Use instance methods, accept message templates via constructor, support localization.

### 2.1 `CommandOptions` Type (Shared Type Definition)

**Purpose**: Define common command options that all commands share.

**Location**: `src/types/command-options.ts`

**Content**:
```typescript
export type BaseCommandOptions = {
    config?: string;
    workspaceRoot?: string;
    debug?: boolean;
};

export type ConcurrentCommandOptions = BaseCommandOptions & {
    concurrency?: number;
};
```

**Benefits**:
- Reduces ~140 lines of duplicated type definitions
- Ensures consistency across commands
- Makes it easier to add new common options

### 2.2 `WorkspaceConfigManager` Class

**Purpose**: Centralize workspace configuration management operations.

**Location**: `src/libs/workspace-config-manager.ts`

**Content**:
```typescript
import { parseConfigFile, writeConfigFile, type WorkspaceConfig, type WorkspaceConfigItem } from "./config.ts";
import { isDir } from "./file.ts";
import { Result } from "typescript-result";
import { ErrorWithCause } from "./errors.ts";

export class WorkspaceConfigManager {
    constructor(private readonly configFile: string) {}

    async parseConfig(): Promise<Result<WorkspaceConfig, Error>> {
        return await parseConfigFile(this.configFile);
    }

    async writeConfig(config: WorkspaceConfig): Promise<Result<void, Error>> {
        return await writeConfigFile(config, this.configFile);
    }

    async validateWorkspaceDir(workspaceRoot: string): Promise<Result<void, Error>> {
        const stat = await Result.fromAsyncCatching(() => Deno.stat(workspaceRoot));
        if (!stat.ok) {
            return Result.error(new ErrorWithCause(`Workspace directory is not a directory`, stat.error));
        }
        if (!stat.value.isDirectory) {
            return Result.error(new Error(`Workspace directory is not a directory`));
        }
        return Result.ok();
    }

    getActiveWorkspaces(config: WorkspaceConfig): WorkspaceConfigItem[] {
        return config.workspaces.filter((item) => item.active);
    }

    getInactiveWorkspaces(config: WorkspaceConfig): WorkspaceConfigItem[] {
        return config.workspaces.filter((item) => !item.active);
    }

    async getWorkspaceConfig(workspaceRoot: string): Promise<Result<WorkspaceConfig, Error>> {
        const validated = await this.validateWorkspaceDir(workspaceRoot);
        if (!validated.ok) {
            return Result.error(validated.error);
        }

        const parseConfig = await this.parseConfig();
        if (!parseConfig.ok) {
            return Result.error(parseConfig.error);
        }

        return parseConfig;
    }
}
```

**Benefits**:
- Reduces ~180 lines of duplicated configuration management code
- Centralizes workspace directory validation
- Provides a consistent interface for config operations

### 2.3 `WorkspaceCheckoutManager` Class

**Purpose**: Handle Git submodule checkout operations with dependency injection for testability.

**Location**: `src/libs/workspace-checkout-manager.ts`

**Content**:
```typescript
import { GitManager, GitManagerFactory } from "./git.ts";
import { Result } from "typescript-result";
import { ErrorWithCause } from "./errors.ts";
import * as path from "@std/path";

export interface GitManagerFactory {
    create(path: string): GitManager;
}

export class WorkspaceCheckoutManager {
    constructor(
        private readonly workspaceRoot: string,
        private readonly gitManagerFactory: GitManagerFactory,
    ) {
        // Default factory if none provided
        if (!gitManagerFactory) {
            this.gitManagerFactory = (path: string) => new GitManager(path);
        }
    }

    async checkoutWorkspace(
        url: string,
        workspacePath: string,
        branch: string,
    ): Promise<Result<void, Error>> {
        const git = this.gitManagerFactory(this.workspaceRoot);

        // Add submodule with specified branch
        const addResult = await git.submoduleAdd(url, workspacePath, branch);
        if (!addResult.ok) {
            return Result.error(addResult.error);
        }

        // Check out the submodule to the specified branch
        const fullSubmodulePath = path.join(this.workspaceRoot, workspacePath);
        const submoduleGit = this.gitManagerFactory(fullSubmodulePath);
        const checkoutResult = await submoduleGit.checkoutBranch(branch);
        if (!checkoutResult.ok) {
            return Result.error(
                new ErrorWithCause(
                    `Failed to checkout submodule at ${workspacePath} to branch ${branch}`,
                    checkoutResult.error,
                ),
            );
        }

        // Pull the latest changes from the specified branch
        const pullResult = await submoduleGit.pullOriginBranch(branch);
        if (!pullResult.ok) {
            return Result.error(
                new ErrorWithCause(
                    `Failed to pull latest changes for submodule at ${workspacePath} from branch ${branch}`,
                    pullResult.error,
                ),
            );
        }

        return Result.ok();
    }
}
```

**Benefits**:
- Reduces ~35 lines of duplicated checkout logic
- Provides a reusable interface for workspace checkout operations
- **DI-enabled**: Factory injection allows mocking for tests
- **Flexible**: Can swap Git implementation without modifying class

**Benefits**:
- Reduces ~35 lines of duplicated checkout logic
- Provides a reusable interface for workspace checkout operations
- Makes it easier to add new checkout features (e.g., retry logic, progress reporting)

### 2.4 `WorkspaceProcessor` Class

**Purpose**: Handle concurrent processing of workspaces with configurable concurrency.

**Location**: `src/libs/workspace-processor.ts`

**Content**:
```typescript
import { processConcurrently, processConcurrentlyWithResults } from "./concurrent.ts";
import { Result } from "typescript-result";

export class WorkspaceProcessor {
    constructor(private readonly concurrency: number = 4) {}

    async processConcurrently<T, E extends Error>(
        items: T[],
        processor: (item: T) => Promise<Result<void, E>>,
    ): Promise<Result<void, E>> {
        return await processConcurrently(items, processor, this.concurrency);
    }

    async processConcurrentlyWithResults<T, R, E extends Error>(
        items: T[],
        processor: (item: T) => Promise<Result<R, E>>,
    ): Promise<Result<R, E>[]> {
        return await processConcurrentlyWithResults(items, processor, this.concurrency);
    }
}
```

**Benefits**:
- Reduces ~200 lines of duplicated concurrent processing logic
- Provides a consistent interface for concurrent operations
- Makes it easier to add new concurrent processing features (e.g., progress tracking, cancellation)

### 2.5 `GoWorkspaceManager` Class

**Purpose**: Manage Go workspace operations with dependency injection for testability.

**Location**: `src/libs/go-workspace-manager.ts`

**Content**:
```typescript
import { GoWork, GoWorkFactory, GoAvailabilityChecker } from "./go.ts";
import { Result } from "typescript-result";

export interface GoAvailabilityChecker {
    check(): Promise<Result<boolean, Error>>;
}

export class GoWorkspaceManager {
    constructor(
        private readonly workspaceRoot: string,
        private readonly goWorkFactory: GoWorkFactory,
        private readonly availabilityChecker: GoAvailabilityChecker,
    ) {
        // Default factory if none provided
        if (!goWorkFactory) {
            this.goWorkFactory = (path: string) => new GoWork(path);
        }
        if (!availabilityChecker) {
            this.availabilityChecker = {
                check: () => GoWork.isAvailable(),
            };
        }
    }

    async setupWorkspace(add: string[], remove: string[]): Promise<Result<void, Error>> {
        const goWork = this.goWorkFactory(this.workspaceRoot);

        // Check if Go is available
        const goAvailable = await this.availabilityChecker.check();
        if (!goAvailable.ok) {
            return Result.error(new Error("Failed to check Go availability"));
        }

        // Go is not available
        if (!goAvailable.value) {
            return Result.error(new Error("Go is not available."));
        }

        // Initialize go workspace if it doesn't exist
        const initResult = await goWork.init();
        if (!initResult.ok) {
            return Result.error(initResult.error);
        }

        // Remove inactive Go modules
        if (remove.length > 0) {
            const removeResult = await goWork.remove(remove);
            if (!removeResult.ok) {
                return Result.error(removeResult.error);
            }
        }

        // Add active Go modules
        if (add.length > 0) {
            const addResult = await goWork.use(add);
            if (!addResult.ok) {
                return Result.error(addResult.error);
            }
        }

        return Result.ok();
    }
}
```

**Benefits**:
- Encapsulates Go workspace management logic
- Makes it easier to reuse in other commands
- Provides a clear interface for Go workspace operations

### 2.6 `CommandErrorHandler` Class

**Purpose**: Handle command errors consistently without tight coupling to Deno runtime.

**Location**: `src/libs/command-error-handler.ts`

**Content**:
```typescript
import { red } from "@std/fmt/colors";
import { Result } from "typescript-result";

export interface ErrorHandler {
    onError(error: Error, commandName: string): void;
}

export class ConsoleErrorHandler implements ErrorHandler {
    onError(error: Error, commandName: string): void {
        console.log(red(`❌ ${commandName} failed:`), error.message);
    }
}

export class CommandErrorHandler {
    constructor(private readonly errorHandler: ErrorHandler) {}

    handle<T>(result: Result<T, Error>, commandName: string): T | null {
        if (!result.ok) {
            this.errorHandler.onError(result.error, commandName);
            return null;
        }
        return result.value;
    }

    handleAsync<T>(promise: Promise<Result<T, Error>>, commandName: string): Promise<T | null> {
        return promise.then((result) => this.handle(result, commandName));
    }

    // Static factory methods for convenience
    static withExit<T>(result: Result<T, Error>, commandName: string): T | null {
        if (!result.ok) {
            console.log(red(`❌ ${commandName} failed:`), result.error.message);
            Deno.exit(1);
        }
        return result.value;
    }

    static withExitAsync<T>(promise: Promise<Result<T, Error>>, commandName: string): Promise<T | null> {
        return promise.then((result) => this.withExit(result, commandName));
    }
}
```

**Benefits**:
- Reduces ~70 lines of duplicated error handling code
- Provides consistent error messages across commands
- Makes it easier to add new error handling features (e.g., logging, error reporting)

### 2.7 `InteractivePromptManager` Class

**Purpose**: Centralize interactive prompt logic with consistent error handling and customization support.

**Location**: `src/libs/interactive-prompt-manager.ts`

**Content**:
```typescript
import { Input, Checkbox, Confirm, Select } from "@cliffy/prompt";
import { Result } from "typescript-result";
import { ErrorWithCause } from "./errors.ts";

export interface PromptMessageProvider {
    getRepoMessage(): string;
    getPathMessage(): string;
    getBranchMessage(): string;
    getBranchSuggestions(): string[];
    getGoMessage(): string;
    getContinueMessage(): string;
    getSyncMessage(): string;
    getWorkspaceSelectionMessage(): string;
    getWorkspaceOpenMessage(): string;
    getCancelLabel(): string;
}

export class DefaultPromptMessageProvider implements PromptMessageProvider {
    getRepoMessage(): string {
        return "Repository URL:";
    }

    getPathMessage(): string {
        return "Local path:";
    }

    getBranchMessage(): string {
        return "Branch:";
    }

    getBranchSuggestions(): string[] {
        return ["main", "master", "develop", "staging"];
    }

    getGoMessage(): string {
        return "Is this a Go module?";
    }

    getContinueMessage(): string {
        return "Do you want to add another workspace?";
    }

    getSyncMessage(): string {
        return "Do you want to sync now?";
    }

    getWorkspaceSelectionMessage(): string {
        return "Select workspaces to enable (use space to toggle, enter to confirm):";
    }

    getWorkspaceOpenMessage(): string {
        return "Select workspace to open:";
    }

    getCancelLabel(): string {
        return "Cancel";
    }
}

export class InteractivePromptManager {
    constructor(
        private readonly messageProvider: PromptMessageProvider = new DefaultPromptMessageProvider(),
    ) {}

    private wrapPrompt<T>(
        promptFn: () => Promise<T>,
        errorContext: string,
    ): Promise<Result<T, Error>> {
        return Result.wrap(
            () => promptFn(),
            (error) => {
                if (error instanceof Error && error.message.includes("cancelled")) {
                    return new ErrorWithCause("Operation cancelled", error);
                }
                return new ErrorWithCause(errorContext, error as Error);
            },
        )();
    }

    async promptForRepo(defaultRepo?: string): Promise<Result<string, Error>> {
        return this.wrapPrompt(
            () =>
                Input.prompt({
                    message: this.messageProvider.getRepoMessage(),
                    default: defaultRepo,
                    validate: (value) => {
                        if (!value || value.trim() === "") {
                            return "Repository URL is required";
                        }
                        return true;
                    },
                }),
            "Failed to prompt for repository URL",
        );
    }

    async promptForPath(defaultPath: string): Promise<Result<string, Error>> {
        return this.wrapPrompt(
            () =>
                Input.prompt({
                    message: this.messageProvider.getPathMessage(),
                    default: defaultPath,
                }),
            "Failed to prompt for path",
        );
    }

    async promptForBranch(): Promise<Result<string, Error>> {
        return this.wrapPrompt(
            () =>
                Input.prompt({
                    message: this.messageProvider.getBranchMessage(),
                    default: "main",
                    suggestions: this.messageProvider.getBranchSuggestions(),
                }),
            "Failed to prompt for branch",
        );
    }

    async promptForGo(): Promise<Result<boolean, Error>> {
        return this.wrapPrompt(
            () =>
                Confirm.prompt({
                    message: this.messageProvider.getGoMessage(),
                    default: false,
                }),
            "Failed to prompt for Go workspace setting",
        );
    }

    async promptForContinue(): Promise<Result<boolean, Error>> {
        return this.wrapPrompt(
            () =>
                Confirm.prompt({
                    message: this.messageProvider.getContinueMessage(),
                    default: false,
                }),
            "Failed to prompt for continue",
        );
    }

    async promptForSync(): Promise<Result<boolean, Error>> {
        return this.wrapPrompt(
            () =>
                Confirm.prompt({
                    message: this.messageProvider.getSyncMessage(),
                    default: true,
                }),
            "Failed to prompt for sync confirmation",
        );
    }

    async promptForWorkspaceSelection(
        workspaces: Array<{ path: string; url: string; active: boolean }>,
    ): Promise<Result<string[], Error>> {
        const options = workspaces.map((workspace) => ({
            name: `${workspace.path} (${workspace.url})`,
            value: workspace.path,
            checked: workspace.active,
        }));

        return this.wrapPrompt(
            () =>
                Checkbox.prompt({
                    message: this.messageProvider.getWorkspaceSelectionMessage(),
                    search: true,
                    options,
                }),
            "Failed to prompt for workspace selection",
        );
    }

    async promptForWorkspaceSelectionSingle(
        workspaces: Array<{ path: string; url: string; branch: string; active: boolean }>,
    ): Promise<Result<string | null, Error>> {
        const options = workspaces.map((workspace) => ({
            name: `${workspace.active ? "◉" : "○"} ${workspace.path} (${workspace.branch})`,
            value: workspace.path,
        }));

        options.push({
            name: this.messageProvider.getCancelLabel(),
            value: "cancel",
        });

        return this.wrapPrompt(
            () =>
                Select.prompt({
                    message: this.messageProvider.getWorkspaceOpenMessage(),
                    options: options,
                    search: true,
                }),
            "Failed to prompt for workspace selection",
        ).then((result) => {
            if (result.ok && result.value === "cancel") {
                return Result.ok(null);
            }
            return result;
        });
    }
}
```

**Benefits**:
- Reduces ~100 lines of duplicated prompt logic
- Provides consistent error handling for all prompts
- Makes it easier to add new prompts or modify existing ones

## 3. Benefits of Extraction

### 3.1 Code Maintainability
- **Reduced Duplication**: ~825 lines of duplicated code can be extracted
- **Single Source of Truth**: Changes to common logic only need to be made in one place
- **Easier Testing**: Extracted classes can be tested independently

### 3.2 Consistency
- **Consistent Error Messages**: All commands will use the same error handling pattern
- **Consistent User Experience**: All interactive prompts will have the same behavior
- **Consistent Configuration Management**: All commands will handle config files the same way

### 3.3 Extensibility
- **Easy to Add New Commands**: New commands can reuse existing classes
- **Easy to Add Features**: New features (e.g., progress tracking, retry logic) can be added to extracted classes
- **Easy to Modify Behavior**: Changes to common behavior only need to be made in one place

### 3.4 Code Quality
- **Better Separation of Concerns**: Each class has a single responsibility
- **Improved Readability**: Command files become shorter and more focused on their specific logic
- **Better Type Safety**: Shared types ensure consistency across commands
- **Improved Testability**: Dependency injection enables unit testing with mocks
- **Reduced Coupling**: Classes depend on abstractions (interfaces), not concrete implementations

## 4. Implementation Plan

### Phase 0: Dependency Updates (Critical for DI Support)
Before creating new classes, update existing libraries to support factory interfaces:

1. **Update `src/libs/git.ts`**:
   - Export `GitManagerFactory` interface: `create(path: string): GitManager`
   - Keep `GitManager` class as default implementation

2. **Update `src/libs/go.ts`**:
   - Export `GoWorkFactory` interface: `create(path: string): GoWork`
   - Export `GoAvailabilityChecker` interface for mockable availability checking
   - Keep `GoWork` class as default implementation

### Phase 1: Create Shared Types and Base Classes
1. Create `src/types/command-options.ts` with common option types
2. Create `src/libs/command-error-handler.ts` for error handling (no Deno.exit)
3. Create `src/libs/workspace-config-manager.ts` for config management
4. Create `src/types/prompt-messages.ts` for customizable message interfaces

### Phase 2: Create Domain-Specific Classes (With DI Support)
1. Create `src/libs/workspace-checkout-manager.ts` for checkout operations
   - Accept `GitManagerFactory` via constructor
   - Support default factory for backward compatibility
2. Create `src/libs/workspace-processor.ts` for concurrent processing
3. Create `src/libs/go-workspace-manager.ts` for Go workspace operations
   - Accept `GoWorkFactory` and `GoAvailabilityChecker` via constructor
   - Support default factories for backward compatibility
4. Create `src/libs/interactive-prompt-manager.ts` for prompts
   - Accept `PromptMessageProvider` via constructor
   - Support default provider for backward compatibility

### Phase 3: Refactor Commands (Using New Classes)
1. Update all command files to use the new classes with DI
2. Remove duplicated code from command files
3. Update imports and type definitions
4. Use `CommandErrorHandler.withExit()` at CLI entry points only

### Phase 4: Testing and Validation
1. Write unit tests for `WorkspaceCheckoutManager` with mocked `GitManager`
2. Write unit tests for `GoWorkspaceManager` with mocked `GoWork`
3. Write unit tests for `InteractivePromptManager` with custom message provider
4. Test each command to ensure functionality is preserved
5. Verify no regressions in existing functionality
6. Update documentation

### Key Principles for Phase 3 & 4
- **Backward Compatibility**: All new classes accept optional factories with default implementations
- **Testability**: All dependencies injectable for mocking
- **No Deno Exit in Libraries**: Error handlers return results, callers decide exit behavior
- **Customization**: Message providers support localization and customization

## 5. Estimated Impact

- **Lines of Code Reduction**: ~825 lines of duplicated code
- **File Count**: 9 new files (6 classes + 2 types files + 1 provider interface)
- **Command File Size Reduction**: Each command file will be reduced by 20-40%
- **Test Coverage**: Can add unit tests for all extracted classes with mocked dependencies
- **Coupling Reduction**: Classes follow Dependency Inversion Principle
- **Reusability**: All extracted classes are reusable outside Deno runtime (except config manager)

## 6. Conclusion

The codebase has several repeated patterns that can be extracted into reusable classes and modules. This refactoring will significantly improve:

1. **Maintainability**: Reduce code duplication by ~825 lines
2. **Testability**: Dependency injection enables unit testing with mocked dependencies
3. **Extensibility**: Interfaces allow easy substitution of implementations
4. **Quality**: Dependency Inversion Principle reduces tight coupling

**Critical Improvement**: Unlike the initial proposal, this updated plan explicitly addresses tight coupling issues by:
- Using factory interfaces instead of concrete instantiations
- Removing hardcoded `Deno.exit()` calls from library code
- Supporting message customization for internationalization
- Making all dependencies injectable for testing

The proposed extraction plan is incremental and can be implemented in phases to minimize risk. Each phase builds on the previous, ensuring backward compatibility throughout the refactoring.
