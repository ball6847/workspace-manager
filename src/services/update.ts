import { Result } from "typescript-result";
import type { AppError } from "../libs/app-error.ts";
import { processConcurrently } from "../libs/concurrent.ts";
import { getActiveWorkspaces, workspaceDirectory } from "../domain/workspaces.ts";
import type { ConfigStore } from "../ports/config-store.ts";
import type { FileSystemPort } from "../ports/file-system.ts";
import type { GitPortFactory } from "../ports/git.ts";
import type { WorkspaceDiscoveryOptions, WorkspaceDiscoveryPort } from "../ports/workspace-discovery.ts";
import { blue, gray, green, red, yellow } from "@std/fmt/colors";

export type UpdateServiceDeps = {
	createDiscovery(options: WorkspaceDiscoveryOptions): WorkspaceDiscoveryPort;
	createConfigStore(configPath: string): ConfigStore;
	gitFactory: GitPortFactory;
	fileSystem: FileSystemPort;
};

export type UpdateInput = {
	config?: string;
	workspaceRoot?: string;
	debug?: boolean;
	concurrency?: number;
};

export class UpdateService {
	constructor(private readonly deps: UpdateServiceDeps) {}

	async run(input: UpdateInput): Promise<Result<void, AppError>> {
		const discovery = this.deps.createDiscovery({
			config: input.config,
			workspaceRoot: input.workspaceRoot,
		});

		const discoverResult = await discovery.discover();
		if (!discoverResult.ok) {
			return Result.error(discoverResult.error);
		}

		const { workspaceRoot, configPath } = discoverResult.value;
		const debug = input.debug ?? false;
		const concurrency = input.concurrency ?? 8;

		const configStore = this.deps.createConfigStore(configPath);
		const parseResult = await configStore.getConfig();
		if (!parseResult.ok) {
			return Result.error(parseResult.error);
		}
		const config = parseResult.value;

		const activeWorkspaces = getActiveWorkspaces(config);

		if (debug) {
			console.log(blue(`Found ${activeWorkspaces.length} active workspaces to update`));
		}

		const updateResult = await processConcurrently(
			activeWorkspaces,
			async (workspace) => {
				const workspacePath = workspaceDirectory(workspaceRoot, workspace.path);
				const git = this.deps.gitFactory(workspacePath);

				const dir = await this.deps.fileSystem.isDir(workspacePath);
				if (!dir.ok) {
					console.log(yellow(`⚠️  Workspace directory does not exist, skipping: ${workspace.path}`));
					return Result.ok();
				}

				console.log(blue(`🔄 Updating workspace: ${workspace.path} (branch: ${workspace.branch})`));

				const checkoutResult = await git.checkoutBranch(workspace.branch);
				if (!checkoutResult.ok) {
					console.log(red(`❌ Failed to checkout to branch ${workspace.branch} in ${workspace.path}: ${checkoutResult.error.message}`));
					return Result.error(checkoutResult.error);
				}

				if (debug) {
					console.log(gray(`Checked out to branch ${workspace.branch} in ${workspace.path}`));
				}

				const isCleanResult = await git.isWorkingDirectoryClean();
				if (!isCleanResult.ok) {
					console.log(red(`❌ Failed to check working directory status in ${workspace.path}: ${isCleanResult.error.message}`));
					return Result.error(isCleanResult.error);
				}

				const isClean = isCleanResult.value;
				let hasStashedChanges = false;

				if (!isClean) {
					console.log(yellow(`⚠️  Working directory is dirty in ${workspace.path}, stashing changes...`));
					const stashResult = await git.stash(`workspace-manager auto-stash before update`);
					if (!stashResult.ok) {
						console.log(red(`❌ Failed to stash changes in ${workspace.path}: ${stashResult.error.message}`));
						return Result.error(stashResult.error);
					}
					hasStashedChanges = true;
					if (debug) {
						console.log(gray(`Stashed changes in ${workspace.path}`));
					}
				}

				const fetchResult = await git.fetch();
				if (!fetchResult.ok) {
					console.log(red(`❌ Failed to fetch latest changes from origin in ${workspace.path}: ${fetchResult.error.message}`));
					return Result.error(fetchResult.error);
				}

				if (debug) {
					console.log(gray(`Fetched latest changes from origin in ${workspace.path}`));
				}

				const pullResult = await git.pullOriginBranch(workspace.branch);
				if (!pullResult.ok) {
					console.log(red(`❌ Failed to pull latest changes from origin/${workspace.branch} in ${workspace.path}: ${pullResult.error.message}`));
					return Result.error(pullResult.error);
				}

				if (debug) {
					console.log(gray(`Pulled latest changes from origin/${workspace.branch} in ${workspace.path}`));
				}

				if (hasStashedChanges) {
					console.log(yellow(`Restoring stashed changes in ${workspace.path}...`));
					const popResult = await git.stashPop();
					if (!popResult.ok) {
						console.log(yellow(`⚠️  Failed to pop stash in ${workspace.path}. You may need to manually resolve conflicts. (${popResult.error.message})`));
						console.log(yellow(`You can manually run 'git stash pop' in ${workspace.path} to restore your changes.`));
					} else if (debug) {
						console.log(gray(`Restored stashed changes in ${workspace.path}`));
					}
				}

				console.log(green(`✅ Successfully updated workspace: ${workspace.path}`));
				return Result.ok();
			},
			concurrency,
		);

		return updateResult;
	}
}
