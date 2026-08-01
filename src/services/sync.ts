import { Result } from "typescript-result";
import { AppError } from "../libs/app-error.ts";
import { processConcurrently, processConcurrentlyWithResults } from "../libs/concurrent.ts";
import { getActiveWorkspaces, getInactiveWorkspaces, goModulePaths, workspaceDirectory } from "../domain/workspaces.ts";
import type { ConfigStore } from "../ports/config-store.ts";
import type { FileSystemPort } from "../ports/file-system.ts";
import type { GitPort, GitPortFactory } from "../ports/git.ts";
import type { GoWorkPortFactory } from "../ports/go-work.ts";
import type { HookContext, HookExecutionResult, HookRunner } from "../ports/hook-runner.ts";
import type { WorkspaceDiscoveryOptions, WorkspaceDiscoveryPort } from "../ports/workspace-discovery.ts";
import type { WorkspaceConfigItem } from "../types/config.ts";
import { blue, green, red, yellow } from "@std/fmt/colors";
import { getDefaultConcurrency } from "../libs/env.ts";
import { WorkspaceManager } from "./workspace-manager.ts";

export type SyncTiming = {
	totalMs: number;
	removalMs: number;
	syncMs: number;
	goWorkspaceMs: number;
	hooksMs: number;
	perWorkspaceMs: Record<string, number>;
};

export type SyncReport = {
	workspaceRoot: string;
	configPath: string;
	activeCount: number;
	inactiveCount: number;
	removedCount: number;
	syncedCount: number;
	updatedCount: number;
	upToDateCount: number;
	skippedDetachedCount: number;
	goWorkspaceSetup: boolean;
	globalHookResults: HookExecutionResult[];
	workspaceHookResults: Array<{ path: string; results: HookExecutionResult[] }>;
	timing: SyncTiming;
};

type SyncSingleResult = { path: string; skippedDetached: boolean; updated: boolean; elapsedMs: number };

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
		const concurrency = input.concurrency ?? getDefaultConcurrency();
		const debug = input.debug ?? false;
		const totalStart = performance.now();

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
			updatedCount: 0,
			upToDateCount: 0,
			skippedDetachedCount: 0,
			goWorkspaceSetup: false,
			globalHookResults: [],
			workspaceHookResults: [],
			timing: {
				totalMs: 0,
				removalMs: 0,
				syncMs: 0,
				goWorkspaceMs: 0,
				hooksMs: 0,
				perWorkspaceMs: {},
			},
		};

		const workspaceManager = new WorkspaceManager(workspaceRoot, this.deps.goWorkFactory, this.deps.gitFactory);

		if (inactiveWorkspaces.length > 0) {
			const removalStart = performance.now();
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
			report.timing.removalMs = Math.round(performance.now() - removalStart);

			if (!removeResult.ok) {
				return Result.error(removeResult.error);
			}
		}

		if (activeWorkspaces.length > 0) {
			const syncStart = performance.now();

			// Phase A: classify active workspaces into pending init and ready
			const classifyResults = await processConcurrentlyWithResults(
				activeWorkspaces,
				async (workspace) => await this.classifyWorkspace(workspace, workspaceRoot),
				concurrency,
			);

			const pendingInit: WorkspaceConfigItem[] = [];
			for (const result of classifyResults) {
				if (!result.ok) {
					return Result.error(result.error);
				}
				if (result.value.pendingInit) {
					pendingInit.push(result.value.workspace);
				}
			}

			// Phase B: one batched init for all pending submodules registered in .gitmodules
			if (pendingInit.length > 0) {
				const rootGit = this.deps.gitFactory(workspaceRoot);
				const pendingPaths = pendingInit.map((workspace) => workspace.path);
				console.log(blue(`📥 Initializing ${pendingInit.length} submodules (jobs: ${concurrency})...`));
				const batchResult = await rootGit.submoduleInitMany(pendingPaths, concurrency);
				if (!batchResult.ok) {
					console.log(yellow(`⚠️  Batch submodule initialization failed for some paths; handling individually...`));
				}

				// Phase C: re-verify each pending path and fall back to checkout for those still missing
				const verifyResults = await processConcurrentlyWithResults(
					pendingInit,
					async (workspace) => await this.checkoutIfMissing(workspace, workspaceRoot, workspaceManager),
					concurrency,
				);

				for (const result of verifyResults) {
					if (!result.ok) {
						return Result.error(result.error);
					}
				}
			}

			console.log(blue(`Syncing ${activeWorkspaces.length} active workspaces...`));
			const syncResults = await processConcurrentlyWithResults(
				activeWorkspaces,
				async (workspace) => await this.syncSingleWorkspace(workspace, workspaceRoot, workspaceManager),
				concurrency,
			);

			for (const result of syncResults) {
				if (!result.ok) {
					return Result.error(result.error);
				}
				report.syncedCount++;
				if (result.value.updated) {
					report.updatedCount++;
				} else if (!result.value.skippedDetached) {
					report.upToDateCount++;
				}
				report.timing.perWorkspaceMs[result.value.path] = result.value.elapsedMs;
				if (result.value.skippedDetached) {
					report.skippedDetachedCount++;
				}
			}
			report.timing.syncMs = Math.round(performance.now() - syncStart);
		}

		const goAdd = goModulePaths(activeWorkspaces);
		const goRemove = goModulePaths(inactiveWorkspaces);
		const goWorkspaceStart = performance.now();
		const goResult = await workspaceManager.setupGoWorkspace(goAdd, goRemove);
		report.timing.goWorkspaceMs = Math.round(performance.now() - goWorkspaceStart);
		report.goWorkspaceSetup = goResult.ok;
		if (!goResult.ok) {
			console.log(yellow(`⚠️  Go workspace setup failed: ${goResult.error.message}`));
		}

		const hookExecutor = this.deps.createHookRunner(debug);
		const hookContext: HookContext = { root: workspaceRoot, path: workspaceRoot };
		const hooksStart = performance.now();

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

			// Workspace hooks run one workspace at a time (in config order): hook children
			// inherit the terminal, so concurrent children would interleave output and
			// fight over stdin.
			for (const workspace of workspacesWithHooks) {
				console.log(blue(`Executing ${workspace.postSyncHooks!.length} hooks for ${workspace.path}...`));

				const result = await hookExecutor.executeHooks(workspace.postSyncHooks!, { root: workspaceRoot, path: workspace.path });

				if (!result.ok) {
					return Result.error(result.error);
				}

				report.workspaceHookResults.push({ path: workspace.path, results: result.value });
			}
		}

		report.timing.hooksMs = Math.round(performance.now() - hooksStart);
		report.timing.totalMs = Math.round(performance.now() - totalStart);
		return Result.ok(report);
	}

	private async classifyWorkspace(
		workspace: WorkspaceConfigItem,
		workspaceRoot: string,
	): Promise<Result<{ workspace: WorkspaceConfigItem; pendingInit: boolean }, AppError>> {
		const workspacePath = workspaceDirectory(workspaceRoot, workspace.path);
		const dir = await this.deps.fileSystem.isDir(workspacePath);
		if (!dir.ok) {
			return Result.ok({ workspace, pendingInit: true });
		}

		const subGit = this.deps.gitFactory(workspacePath);
		const isRepo = await subGit.isRepository();
		if (!isRepo.ok) {
			return Result.error(isRepo.error);
		}

		return Result.ok({ workspace, pendingInit: !isRepo.value });
	}

	private async checkoutIfMissing(
		workspace: WorkspaceConfigItem,
		workspaceRoot: string,
		workspaceManager: WorkspaceManager,
	): Promise<Result<void, AppError>> {
		const workspacePath = workspaceDirectory(workspaceRoot, workspace.path);
		const subGit = this.deps.gitFactory(workspacePath);
		const isRepo = await subGit.isRepository();
		if (!isRepo.ok) {
			return Result.error(isRepo.error);
		}

		if (!isRepo.value) {
			console.log(yellow(`📥 Checking out workspace: ${workspace.path}`));
			const checkout = await workspaceManager.checkoutWorkspace(workspace.url, workspace.path, workspace.branch);
			if (!checkout.ok) {
				console.log(red(`❌ Failed to check out workspace: ${workspace.path}: ${checkout.error.message}`));
				return Result.error(checkout.error);
			}
			console.log(green(`✅ Successfully checked out workspace: ${workspace.path}`));
		}

		return Result.ok();
	}

	private async syncSingleWorkspace(
		workspace: WorkspaceConfigItem,
		workspaceRoot: string,
		workspaceManager: WorkspaceManager,
	): Promise<Result<SyncSingleResult, AppError>> {
		const start = performance.now();
		const result = await this.syncSingleWorkspaceImpl(workspace, workspaceRoot, workspaceManager);
		const elapsedMs = Math.round(performance.now() - start);
		if (!result.ok) {
			return result;
		}
		return Result.ok({
			path: workspace.path,
			skippedDetached: result.value.skippedDetached,
			updated: result.value.updated,
			elapsedMs,
		});
	}

	private async syncSingleWorkspaceImpl(
		workspace: WorkspaceConfigItem,
		workspaceRoot: string,
		workspaceManager: WorkspaceManager,
	): Promise<Result<{ skippedDetached: boolean; updated: boolean }, AppError>> {
		const workspacePath = workspaceDirectory(workspaceRoot, workspace.path);

		// Branch 1: Dir missing → checkout path
		const dir = await this.deps.fileSystem.isDir(workspacePath);
		if (!dir.ok) {
			console.log(yellow(`📥 Checking out workspace: ${workspace.path}`));
			const checkout = await workspaceManager.checkoutWorkspace(workspace.url, workspace.path, workspace.branch);
			if (!checkout.ok) {
				console.log(red(`❌ Failed to check out workspace: ${workspace.path}: ${checkout.error.message}`));
				return Result.error(checkout.error);
			}
			console.log(green(`✅ Successfully checked out workspace: ${workspace.path}`));
			return Result.ok({ skippedDetached: false, updated: false });
		}

		const subGit = this.deps.gitFactory(workspacePath);
		const isGitRepo = await subGit.isRepository();
		if (!isGitRepo.ok) {
			console.log(red(`❌ Failed to check git repository: ${workspace.path}: ${isGitRepo.error.message}`));
			return Result.error(isGitRepo.error);
		}

		// Branch 2: Dir exists but isRepository() false → uninitialized submodule
		if (!isGitRepo.value) {
			console.log(yellow(`📥 Initializing submodule: ${workspace.path}`));

			const rootGit = this.deps.gitFactory(workspaceRoot);
			const initResult = await rootGit.submoduleInit(workspace.path);

			if (!initResult.ok) {
				// Fallback: submodule not in .gitmodules → try full checkout
				console.log(yellow(`⚠️  submodule init failed for ${workspace.path}, falling back to checkout...`));
				const checkout = await workspaceManager.checkoutWorkspace(workspace.url, workspace.path, workspace.branch);
				if (!checkout.ok) {
					console.log(red(`❌ Failed to check out workspace: ${workspace.path}: ${checkout.error.message}`));
					return Result.error(checkout.error);
				}
				console.log(green(`✅ Successfully checked out workspace: ${workspace.path}`));
				return Result.ok({ skippedDetached: false, updated: false });
			}

			console.log(green(`✅ Initialized submodule: ${workspace.path}`));
			// Fall through to continue with detached check, branch check, sync
		}

		// Branch 3: Repo exists (or was just initialized), get branch state in one call
		const branchStateResult = await subGit.getBranchState();
		if (!branchStateResult.ok) {
			console.log(red(`❌ Failed to check branch state: ${workspace.path}: ${branchStateResult.error.message}`));
			return Result.error(branchStateResult.error);
		}
		const branchState = branchStateResult.value;
		let currentBranch: string;

		if (branchState.detached) {
			// Heal detached HEAD when HEAD is at or behind the configured branch tip.
			// In worktree/submodule setups, git pins HEAD at the recorded gitlink SHA,
			// which is an ancestor of the branch tip; re-attaching is a pure fast-forward.
			// Only skip when HEAD has commits not on the branch (true divergence).
			const behind = await subGit.isHeadBehindBranch(workspace.branch);
			if (!behind.ok) {
				console.log(red(`❌ Failed to check branch ancestry: ${workspace.path}: ${behind.error.message}`));
				return Result.error(behind.error);
			}

			if (behind.value) {
				console.log(yellow(`🔗 Re-attaching ${workspace.path} to ${workspace.branch}`));
				const checkout = await subGit.checkoutBranch(workspace.branch);
				if (!checkout.ok) {
					console.log(red(`❌ Failed to re-attach ${workspace.path}: ${checkout.error.message}`));
					return Result.error(checkout.error);
				}
				// Re-fetch branch state after re-attachment (same as previous getCurrentBranch re-check).
				const afterHeal = await subGit.getBranchState();
				if (!afterHeal.ok) {
					console.log(red(`❌ Failed to check branch state after re-attachment: ${workspace.path}: ${afterHeal.error.message}`));
					return Result.error(afterHeal.error);
				}
				currentBranch = afterHeal.value.branch ?? workspace.branch;
				// Continue into branch mismatch check + dirty-check + pull
			} else {
				// Detached with commits not on the configured branch
				// WARN-AND-SKIP: never silently abandon commits
				const headSha = await subGit.getHeadSha();
				const shortSha = headSha.ok ? headSha.value.slice(0, 7) : "unknown";

				console.log(yellow(
					`⚠️  ${workspace.path} is detached @${shortSha} with commits not on ${workspace.branch} — skipping. Run 'git -C ${workspacePath} status' to inspect.`,
				));

				// Skip is NOT a failure; increment skippedDetachedCount
				return Result.ok({ skippedDetached: true, updated: false });
			}
		} else {
			currentBranch = branchState.branch ?? workspace.branch;
		}

		// Branch 4: On branch (or just re-attached, or just initialized) → ensure correct branch
		if (currentBranch !== workspace.branch) {
			console.log(yellow(`🔄 Switching branch for ${workspace.path} from ${currentBranch} to ${workspace.branch}`));
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
			const dirtyResult = await this.handleDirtyWorkspace(subGit, workspace);
			if (!dirtyResult.ok) {
				return Result.error(dirtyResult.error);
			}
			return Result.ok({ skippedDetached: false, updated: dirtyResult.value.updated });
		}

		const sync = await subGit.syncBranch(workspace.branch);
		if (!sync.ok) {
			console.log(red(`❌ Failed to sync branch: ${workspace.path}: ${sync.error.message}`));
			return Result.error(sync.error);
		}

		if (sync.value.updated) {
			console.log(green(`✅ Updated ${workspace.path}`));
		} else {
			console.log(green(`✅ Already up-to-date: ${workspace.path}`));
		}

		return Result.ok({ skippedDetached: false, updated: sync.value.updated });
	}

	private async handleDirtyWorkspace(subGit: GitPort, workspace: WorkspaceConfigItem): Promise<Result<{ updated: boolean }, AppError>> {
		console.log(yellow(`⚠️  Workspace has uncommitted changes: ${workspace.path}`));

		const stash = await subGit.stash(`workspace-manager: sync ${workspace.path}`);
		if (!stash.ok) {
			console.log(red(`❌ Failed to stash changes: ${workspace.path}: ${stash.error.message}`));
			return Result.error(stash.error);
		}
		console.log(green(`✅ Stashed changes for: ${workspace.path}`));

		const sync = await subGit.syncBranch(workspace.branch);
		if (!sync.ok) {
			console.log(red(`❌ Failed to sync branch: ${workspace.path}: ${sync.error.message}`));
			return Result.error(sync.error);
		}

		if (sync.value.updated) {
			console.log(green(`✅ Updated ${workspace.path}`));
		} else {
			console.log(green(`✅ Already up-to-date: ${workspace.path}`));
		}

		const unstash = await subGit.stashPop();
		if (!unstash.ok) {
			console.log(red(`❌ Failed to unstash changes: ${workspace.path}: ${unstash.error.message}`));
			return Result.error(unstash.error);
		}
		console.log(green(`✅ Unstashed changes for: ${workspace.path}`));

		return Result.ok({ updated: sync.value.updated });
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
