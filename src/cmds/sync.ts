import { Command } from "@cliffy/command";
import { blue, green, red, yellow } from "@std/fmt/colors";
import * as path from "@std/path";
import { Result } from "typescript-result";
import { AggregateError } from "../libs/errors.ts";
import { CommandErrorHandler } from "../libs/command-error-handler.ts";
import { processConcurrently, processConcurrentlyWithResults } from "../libs/concurrent.ts";
import { isDir } from "../libs/file.ts";
import { GitManager } from "../libs/git.ts";
import { GoWork } from "../libs/go.ts";
import { type HookExecutionResult, HookExecutor } from "../libs/hooks.ts";
import { ConsoleLogger, type Logger } from "../libs/logger.ts";
import { WorkspaceDiscovery } from "../libs/workspace-discovery.ts";
import { ConfigManager } from "../services/config-manager.ts";
import { WorkspaceManager } from "../services/workspace-manager.ts";
import { type ConcurrentCommandOptions } from "../types/command-options.ts";
import { type WorkspaceConfigItem } from "../types/config.ts";

const createGoWork = (path: string) => new GoWork(path);
const createGitManager = (path: string) => new GitManager(path);

// Helper function to process hook results with early-return pattern
function processHookResult(hookResult: HookExecutionResult, workspacePath: string, logger: Logger): void {
	if (hookResult.success) {
		logger.info(`✅ Hook completed for ${workspacePath} in ${hookResult.duration}ms`);
		return;
	}

	// Hook failed
	logger.warn(`⚠️  Hook failed for ${workspacePath} with exit code ${hookResult.exitCode}`);
	if (hookResult.stderr) {
		logger.warn(`stderr: ${hookResult.stderr}`);
	}
}

// Helper function to process global hook results
function processGlobalHookResult(hookResult: HookExecutionResult, logger: Logger): void {
	if (hookResult.success) {
		logger.info(`✅ Global hook completed in ${hookResult.duration}ms`);
		return;
	}

	// Hook failed
	logger.warn(`⚠️  Global hook failed with exit code ${hookResult.exitCode}`);
	if (hookResult.stderr) {
		logger.warn(`stderr: ${hookResult.stderr}`);
	}
}

// Helper function to sync a single workspace with early-return patterns
export async function syncSingleWorkspace(workspace: WorkspaceConfigItem, workspaceRoot: string, workspaceManager: WorkspaceManager, logger: Logger): Promise<Result<void, Error>> {
	const workspacePath = path.join(workspaceRoot, workspace.path);

	// Check if submodule exists
	const dir = await isDir(workspacePath);
	if (!dir.ok) {
		logger.warn(`📥 Checking out workspace: ${workspace.path}`);
		const checkout = await workspaceManager.checkoutWorkspace(workspace.url, workspace.path, workspace.branch);
		if (!checkout.ok) {
			logger.log(`${red(`❌ Failed to check out workspace: ${workspace.path}`)} (${checkout.error.message})`);
			return Result.error(checkout.error);
		}
		logger.info(`✅ Successfully checked out workspace: ${workspace.path}`);
		return Result.ok();
	}

	// Check if it's a git repository
	const subGit = new GitManager(workspacePath);
	const isGitRepo = await subGit.isRepository();
	if (!isGitRepo.ok) {
		logger.log(`${red(`❌ Failed to check git repository: ${workspace.path}`)} (${isGitRepo.error.message})`);
		return Result.error(isGitRepo.error);
	}
	if (!isGitRepo.value) {
		logger.error(`❌ Not a git repository: ${workspace.path}`);
		return Result.error(new Error(`Not a git repository: ${workspace.path}`));
	}

	// Always checkout the configured branch - PRD requirement
	logger.warn(`🔄 Switching to configured branch: ${workspace.branch}`);
	const checkout = await subGit.checkoutBranch(workspace.branch);
	if (!checkout.ok) {
		logger.log(`${red(`❌ Failed to checkout branch for ${workspace.path}`)} (${checkout.error.message})`);
		return Result.error(checkout.error);
	}

	// Check if local has uncommitted changes
	const isClean = await subGit.isWorkingDirectoryClean();
	if (!isClean.ok) {
		logger.warn(`⚠️  Could not check clean state for ${workspace.path}: ${isClean.error.message}`);
		// Continue to pull - PRD requires always pull
	} else if (!isClean.value) {
		const stashResult = await handleDirtyWorkspace(subGit, workspace, logger);
		if (!stashResult.ok) {
			return stashResult;
		}
	}

	// Always pull after checkout - PRD requirement
	const pull = await subGit.pullOriginBranch(workspace.branch);
	if (!pull.ok) {
		logger.log(`${red(`❌ Failed to pull latest changes: ${workspace.path}`)} (${pull.error.message})`);
		return Result.error(pull.error);
	}
	logger.info(`✅ Successfully pulled latest changes: ${workspace.path}`);

	return Result.ok();
}

// Helper function to handle dirty workspace with early-return patterns
async function handleDirtyWorkspace(subGit: GitManager, workspace: WorkspaceConfigItem, logger: Logger): Promise<Result<void, Error>> {
	logger.warn(`⚠️  Workspace has uncommitted changes: ${workspace.path}`);

	// Stash changes with a message that includes the workspace path
	const stash = await subGit.stash(`workspace-manager: sync ${workspace.path}`);
	if (!stash.ok) {
		logger.log(`${red(`❌ Failed to stash changes: ${workspace.path}`)} (${stash.error.message})`);
		return Result.error(stash.error);
	}
	logger.warn(`✅ Stashed changes for: ${workspace.path}`);

	// Pull latest from remote
	const pull = await subGit.pullOriginBranch(workspace.branch);
	if (!pull.ok) {
		logger.log(`${red(`❌ Failed to pull latest changes: ${workspace.path}`)} (${pull.error.message})`);
		return Result.error(pull.error);
	}
	logger.info(`✅ Successfully pulled latest changes: ${workspace.path}`);

	// Apply stash back
	const unstash = await subGit.stashPop();
	if (!unstash.ok) {
		logger.log(`${red(`❌ Failed to unstash changes: ${workspace.path}`)} (${unstash.error.message})`);
		return Result.error(unstash.error);
	}
	logger.warn(`✅ Unstashed changes for: ${workspace.path}`);

	return Result.ok();
}

// Helper function to remove inactive workspace with early-return patterns
export async function removeInactiveWorkspace(workspace: WorkspaceConfigItem, workspaceRoot: string, logger: Logger): Promise<Result<void, Error>> {
	const workspacePath = path.join(workspaceRoot, workspace.path);
	const git = new GitManager(workspaceRoot);
	const dir = await isDir(workspacePath);

	if (!dir.ok) {
		return Result.ok(); // Skip if directory doesn't exist
	}

	logger.warn(`🗑️  Removing inactive workspace: ${workspace.path}`);

	const remove = await git.submoduleRemove(workspace.path);
	if (!remove.ok) {
		logger.log(`${red(`❌ Failed to remove inactive workspace: ${workspace.path}`)} (${remove.error.message})`);
		return Result.error(remove.error);
	}

	logger.info(`✅ Successfully removed inactive workspace: ${workspace.path}`);
	return Result.ok();
}

export async function syncCommand(options: ConcurrentCommandOptions, logger: Logger = new ConsoleLogger()): Promise<Result<void, Error>> {
	const discovery = new WorkspaceDiscovery({ config: options.config, workspaceRoot: options.workspaceRoot });

	const discoverResult = await discovery.discover();

	if (!discoverResult.ok) {
		logger.log(`${red("❌ Failed to discover workspace:")} ${discoverResult.error.message}`);
		return Result.error(discoverResult.error);
	}

	const { workspaceRoot, configPath } = discoverResult.value;
	const concurrency = options.concurrency ?? 4;
	const debug = options.debug ?? false;

	logger.log(blue("🔄 Starting workspace sync..."));
	logger.log(blue(`📄 Config file: ${configPath}`));
	logger.log(blue(`📁 Workspace root: ${workspaceRoot}`));
	logger.log(blue(`⚡ Concurrency: ${concurrency}`));
	if (debug) {
		logger.log(blue("🐛 Debug mode enabled"));
	}

	const configManager = new ConfigManager(configPath);
	const configResult = await configManager.getWorkspaceConfig(workspaceRoot);
	if (!configResult.ok) {
		logger.log(`${red("❌ Failed to read workspace config")} (${configResult.error.message})`);
		return Result.error(configResult.error);
	}
	const config = configResult.value;

	logger.log(blue(`📊 Found ${config.workspaces.length} workspaces in config`));
	if (debug) {
		logger.log(blue(`Workspaces: ${JSON.stringify(config.workspaces)}`));
	}

	const activeWorkspaces = configManager.getActiveWorkspaces(config);
	const inactiveWorkspaces = configManager.getInactiveWorkspaces(config);

	logger.log(blue(`✅ Active workspaces: ${activeWorkspaces.length}`));
	logger.log(blue(`❌ Inactive workspaces: ${inactiveWorkspaces.length}`));

	// TIERED ERROR HANDLING:
	// Phase errors (removal, sync, go setup) are collected and continue to next phase
	// Workspace errors continue with other workspaces
	const allErrors: Error[] = [];

	// Phase 1: Remove inactive workspaces
	if (inactiveWorkspaces.length > 0) {
		logger.warn("Removing inactive workspaces...");
		const removeResults = await processConcurrentlyWithResults(inactiveWorkspaces, (workspace) => removeInactiveWorkspace(workspace, workspaceRoot, logger));
		const removeErrors = removeResults.filter((r) => !r.ok).map((r) => r.error);
		if (removeErrors.length > 0) {
			logger.error(`❌ Inactive workspace removal completed with ${removeErrors.length} errors`);
			allErrors.push(...removeErrors);
		}
	}

	const workspaceManager = new WorkspaceManager(workspaceRoot, createGoWork, createGitManager);

	// Phase 2: Sync active workspaces
	if (activeWorkspaces.length > 0) {
		logger.warn("Syncing active workspaces...");
		const syncResults = await processConcurrentlyWithResults(activeWorkspaces, (workspace) => syncSingleWorkspace(workspace, workspaceRoot, workspaceManager, logger));
		const syncErrors = syncResults.filter((r) => !r.ok).map((r) => r.error);
		if (syncErrors.length > 0) {
			logger.error(`❌ Sync completed with ${syncErrors.length} errors`);
			allErrors.push(...syncErrors);
		}
	}

	// Phase 3: Setup go workspace - continue even if there are errors from previous phases
	const goWorkResult = await workspaceManager.setupGoWorkspace(
		activeWorkspaces.filter((w) => w.isGolang).map((w) => w.path),
		inactiveWorkspaces.filter((w) => w.isGolang).map((w) => w.path),
	);
	if (!goWorkResult.ok) {
		logger.log(`${yellow("⚠️  Go workspace setup failed")} (${goWorkResult.error.message})`);
		allErrors.push(goWorkResult.error);
	} else {
		logger.info("✅ Go workspace setup successful");
	}

	logger.info("🎉 Sync complete!");

	// Phase 4: Execute post-sync hooks - collect all hook errors
	const hookExecutor = new HookExecutor(debug);

	// Execute global hooks
	if (config.hooks?.postSyncHooks?.length) {
		logger.log(blue(`🔧 Executing ${config.hooks.postSyncHooks.length} global post-sync hooks...`));
		const globalHooksResult = await hookExecutor.executeHooks(config.hooks.postSyncHooks, { root: workspaceRoot, path: workspaceRoot });

		if (!globalHooksResult.ok) {
			logger.log(`${red("❌ Global post-sync hooks failed:")} ${globalHooksResult.error.message}`);
			allErrors.push(globalHooksResult.error);
		} else {
			for (const result of globalHooksResult.value) {
				processGlobalHookResult(result, logger);
			}
		}
	}

	// Execute workspace-specific hooks
	const workspacesWithHooks = activeWorkspaces.filter((w) => w.postSyncHooks?.length);
	if (workspacesWithHooks.length) {
		logger.log(blue(`🔧 Executing workspace-specific post-sync hooks for ${workspacesWithHooks.length} workspaces...`));

		const workspaceHooksResult = await processConcurrently(workspacesWithHooks, async (workspace) => {
			logger.log(blue(`🔧 Executing ${workspace.postSyncHooks!.length} hooks for ${workspace.path}...`));

			const result = await hookExecutor.executeHooks(workspace.postSyncHooks!, { root: workspaceRoot, path: workspace.path });

			if (!result.ok) {
				logger.log(`${red(`❌ Post-sync hooks failed for ${workspace.path}:`)} ${result.error.message}`);
				return Result.error(result.error);
			}

			for (const hookResult of result.value) {
				processHookResult(hookResult, workspace.path, logger);
			}

			return Result.ok();
		});

		if (!workspaceHooksResult.ok) {
			allErrors.push(workspaceHooksResult.error);
		}
	}

	// Report all collected errors at the end
	if (allErrors.length > 0) {
		logger.error(`\n❌ Sync completed with ${allErrors.length} total errors`);
		return Result.error(new AggregateError(allErrors, "Sync completed with errors"));
	}

	return Result.ok();
}

export const command = new Command()
	.name("sync")
	.description("Sync workspace with remote repositories")
	.option("-c, --config <file>", "Workspace config file", { default: "workspace.yml" })
	.option("-w, --workspace-root <path>", "Workspace root directory", { default: Deno.cwd() })
	.option("-j, --concurrency <number>", "Number of concurrent operations", { default: 4 })
	.option("-d, --debug", "Enable debug mode", { default: false })
	.action(async (options) => {
		const logger = new ConsoleLogger();
		const result = await syncCommand({
			config: options.config,
			workspaceRoot: options.workspaceRoot,
			concurrency: typeof options.concurrency === "string" ? parseInt(options.concurrency, 10) : options.concurrency,
			debug: options.debug,
		}, logger);
		CommandErrorHandler.withExit(result, "Sync");
	});
