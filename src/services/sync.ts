import { Result } from "typescript-result";
import { AppError, AppErrorCode } from "../libs/app-error.ts";
import { processConcurrently } from "../libs/concurrent.ts";
import { getActiveWorkspaces, getInactiveWorkspaces, goModulePaths, workspaceDirectory } from "../domain/workspaces.ts";
import type { ConfigStore } from "../ports/config-store.ts";
import type { FileSystemPort } from "../ports/file-system.ts";
import type { GitPort, GitPortFactory } from "../ports/git.ts";
import type { GoWorkPortFactory } from "../ports/go-work.ts";
import type { HookContext, HookExecutionResult, HookRunner } from "../ports/hook-runner.ts";
import type { WorkspaceDiscoveryOptions, WorkspaceDiscoveryPort } from "../ports/workspace-discovery.ts";
import type { WorkspaceConfigItem } from "../types/config.ts";
import { blue, green, red, yellow } from "@std/fmt/colors";
import { WorkspaceManager } from "./workspace-manager.ts";

export type SyncReport = {
	workspaceRoot: string;
	configPath: string;
	activeCount: number;
	inactiveCount: number;
	removedCount: number;
	syncedCount: number;
	goWorkspaceSetup: boolean;
	globalHookResults: HookExecutionResult[];
	workspaceHookResults: Array<{ path: string; results: HookExecutionResult[] }>;
};

export type SyncServiceDeps = {
	createDiscovery(options: WorkspaceDiscoveryOptions): WorkspaceDiscoveryPort;
	createConfigStore(configPath: string): ConfigStore;
	gitFactory: GitPortFactory;
	goWorkFactory: GoWorkPortFactory;
	fileSystem: FileSystemPort;
	createHookRunner(debug?: boolean): HookRunner;
};

export type SyncInput = {
	config?: string;
	workspaceRoot?: string;
	debug?: boolean;
	concurrency?: number;
};

export class SyncService {
	constructor(private readonly deps: SyncServiceDeps) {}

	async run(input: SyncInput): Promise<Result<SyncReport, AppError>> {
		const discovery = this.deps.createDiscovery({
			config: input.config,
			workspaceRoot: input.workspaceRoot,
		});

		const discoverResult = await discovery.discover();
		if (!discoverResult.ok) {
			return Result.error(discoverResult.error);
		}

		const { workspaceRoot, configPath } = discoverResult.value;
		const concurrency = input.concurrency ?? 4;
		const debug = input.debug ?? false;

		const configStore = this.deps.createConfigStore(configPath);
		const configResult = await configStore.getWorkspaceConfig(workspaceRoot);
		if (!configResult.ok) {
			return Result.error(configResult.error);
		}
		const config = configResult.value;

		if (debug) {
			console.log(blue(`Starting workspace sync (${config.workspaces.length} workspaces, concurrency: ${concurrency})`));
		}

		const activeWorkspaces = getActiveWorkspaces(config);
		const inactiveWorkspaces = getInactiveWorkspaces(config);

		const report: SyncReport = {
			workspaceRoot,
			configPath,
			activeCount: activeWorkspaces.length,
			inactiveCount: inactiveWorkspaces.length,
			removedCount: 0,
			syncedCount: 0,
			goWorkspaceSetup: false,
			globalHookResults: [],
			workspaceHookResults: [],
		};

		const workspaceManager = new WorkspaceManager(workspaceRoot, this.deps.goWorkFactory, this.deps.gitFactory);

		if (inactiveWorkspaces.length > 0) {
			console.log(yellow(`Removing ${inactiveWorkspaces.length} inactive workspaces...`));
			const removeResult = await processConcurrently(
				inactiveWorkspaces,
				async (workspace) => {
					const remove = await this.removeInactiveWorkspace(workspace, workspaceRoot);
					if (remove.ok) {
						report.removedCount++;
					}
					return remove;
				},
				concurrency,
			);

			if (!removeResult.ok) {
				return Result.error(removeResult.error);
			}
		}

		if (activeWorkspaces.length > 0) {
			console.log(blue(`Syncing ${activeWorkspaces.length} active workspaces...`));
			const syncResult = await processConcurrently(
				activeWorkspaces,
				async (workspace) => {
					const sync = await this.syncSingleWorkspace(workspace, workspaceRoot, workspaceManager);
					if (sync.ok) {
						report.syncedCount++;
					}
					return sync;
				},
				concurrency,
			);

			if (!syncResult.ok) {
				return Result.error(syncResult.error);
			}
		}

		const goAdd = goModulePaths(activeWorkspaces);
		const goRemove = goModulePaths(inactiveWorkspaces);
		const goResult = await workspaceManager.setupGoWorkspace(goAdd, goRemove);
		report.goWorkspaceSetup = goResult.ok;
		if (!goResult.ok) {
			console.log(yellow(`⚠️  Go workspace setup failed: ${goResult.error.message}`));
		}

		const hookExecutor = this.deps.createHookRunner(debug);
		const hookContext: HookContext = { root: workspaceRoot, path: workspaceRoot };

		if (config.hooks?.postSyncHooks?.length) {
			console.log(blue(`Executing ${config.hooks.postSyncHooks.length} global post-sync hooks...`));
			const globalHooksResult = await hookExecutor.executeHooks(config.hooks.postSyncHooks, hookContext);

			if (!globalHooksResult.ok) {
				return Result.error(globalHooksResult.error);
			}
			report.globalHookResults = globalHooksResult.value;
		}

		const workspacesWithHooks = activeWorkspaces.filter((w) => w.postSyncHooks?.length);
		if (workspacesWithHooks.length > 0) {
			console.log(blue(`Executing workspace-specific post-sync hooks for ${workspacesWithHooks.length} workspaces...`));

			const workspaceHooksResult = await processConcurrently(
				workspacesWithHooks,
				async (workspace) => {
					console.log(blue(`Executing ${workspace.postSyncHooks!.length} hooks for ${workspace.path}...`));

					const result = await hookExecutor.executeHooks(workspace.postSyncHooks!, { root: workspaceRoot, path: workspace.path });

					if (!result.ok) {
						return Result.error(result.error);
					}

					report.workspaceHookResults.push({ path: workspace.path, results: result.value });
					return Result.ok();
				},
				concurrency,
			);

			if (!workspaceHooksResult.ok) {
				return Result.error(workspaceHooksResult.error);
			}
		}

		return Result.ok(report);
	}

	private async syncSingleWorkspace(
		workspace: WorkspaceConfigItem,
		workspaceRoot: string,
		workspaceManager: WorkspaceManager,
	): Promise<Result<void, AppError>> {
		const workspacePath = workspaceDirectory(workspaceRoot, workspace.path);

		const dir = await this.deps.fileSystem.isDir(workspacePath);
		if (!dir.ok) {
			console.log(yellow(`📥 Checking out workspace: ${workspace.path}`));
			const checkout = await workspaceManager.checkoutWorkspace(workspace.url, workspace.path, workspace.branch);
			if (!checkout.ok) {
				console.log(red(`❌ Failed to check out workspace: ${workspace.path}: ${checkout.error.message}`));
				return Result.error(checkout.error);
			}
			console.log(green(`✅ Successfully checked out workspace: ${workspace.path}`));
			return Result.ok();
		}

		const subGit = this.deps.gitFactory(workspacePath);
		const isGitRepo = await subGit.isRepository();
		if (!isGitRepo.ok) {
			console.log(red(`❌ Failed to check git repository: ${workspace.path}: ${isGitRepo.error.message}`));
			return Result.error(isGitRepo.error);
		}
		if (!isGitRepo.value) {
			console.log(red(`❌ Not a git repository: ${workspace.path}`));
			return Result.error(new AppError(AppErrorCode.NOT_A_GIT_REPO, `Not a git repository: ${workspace.path}`));
		}

		const currentBranch = await subGit.getCurrentBranch();
		if (!currentBranch.ok) {
			console.log(red(`❌ Failed to get current branch: ${workspace.path}: ${currentBranch.error.message}`));
			return Result.error(currentBranch.error);
		}
		if (currentBranch.value !== workspace.branch) {
			console.log(yellow(`🔄 Switching branch for ${workspace.path} from ${currentBranch.value} to ${workspace.branch}`));
			const checkout = await subGit.checkoutBranch(workspace.branch);
			if (!checkout.ok) {
				console.log(red(`❌ Failed to switch branch for ${workspace.path}: ${checkout.error.message}`));
				return Result.error(checkout.error);
			}
		}

		const isClean = await subGit.isWorkingDirectoryClean();
		if (!isClean.ok) {
			console.log(red(`❌ Failed to check working directory: ${workspace.path}: ${isClean.error.message}`));
			return Result.error(isClean.error);
		}
		if (!isClean.value) {
			return await this.handleDirtyWorkspace(subGit, workspace);
		}

		const pull = await subGit.pullOriginBranch(workspace.branch);
		if (!pull.ok) {
			console.log(red(`❌ Failed to pull latest changes: ${workspace.path}: ${pull.error.message}`));
			return Result.error(pull.error);
		}
		console.log(green(`✅ Successfully pulled latest changes: ${workspace.path}`));

		return Result.ok();
	}

	private async handleDirtyWorkspace(subGit: GitPort, workspace: WorkspaceConfigItem): Promise<Result<void, AppError>> {
		console.log(yellow(`⚠️  Workspace has uncommitted changes: ${workspace.path}`));

		const stash = await subGit.stash(`workspace-manager: sync ${workspace.path}`);
		if (!stash.ok) {
			console.log(red(`❌ Failed to stash changes: ${workspace.path}: ${stash.error.message}`));
			return Result.error(stash.error);
		}
		console.log(green(`✅ Stashed changes for: ${workspace.path}`));

		const pull = await subGit.pullOriginBranch(workspace.branch);
		if (!pull.ok) {
			console.log(red(`❌ Failed to pull latest changes: ${workspace.path}: ${pull.error.message}`));
			return Result.error(pull.error);
		}
		console.log(green(`✅ Successfully pulled latest changes: ${workspace.path}`));

		const unstash = await subGit.stashPop();
		if (!unstash.ok) {
			console.log(red(`❌ Failed to unstash changes: ${workspace.path}: ${unstash.error.message}`));
			return Result.error(unstash.error);
		}
		console.log(green(`✅ Unstashed changes for: ${workspace.path}`));

		return Result.ok();
	}

	private async removeInactiveWorkspace(workspace: WorkspaceConfigItem, workspaceRoot: string): Promise<Result<void, AppError>> {
		const workspacePath = workspaceDirectory(workspaceRoot, workspace.path);
		const git = this.deps.gitFactory(workspaceRoot);
		const dir = await this.deps.fileSystem.isDir(workspacePath);

		if (!dir.ok) {
			return Result.ok();
		}

		console.log(yellow(`🗑️  Removing inactive workspace: ${workspace.path}`));

		const remove = await git.submoduleRemove(workspace.path);
		if (!remove.ok) {
			console.log(red(`❌ Failed to remove inactive workspace: ${workspace.path}: ${remove.error.message}`));
			return Result.error(remove.error);
		}

		console.log(green(`✅ Successfully removed inactive workspace: ${workspace.path}`));
		return Result.ok();
	}
}
