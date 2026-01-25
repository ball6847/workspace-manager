import { Command } from "@cliffy/command";
import { blue, green, red, yellow } from "@std/fmt/colors";
import * as path from "@std/path";
import { Result } from "typescript-result";
import { CommandErrorHandler } from "../libs/command-error-handler.ts";
import { processConcurrently } from "../libs/concurrent.ts";
import { isDir } from "../libs/file.ts";
import { GitManager } from "../libs/git.ts";
import { GoWorkspaceManager } from "../libs/go-workspace-manager.ts";
import { WorkspaceCheckoutManager } from "../libs/workspace-checkout-manager.ts";
import { WorkspaceConfigManager } from "../libs/workspace-config-manager.ts";
import { type ConcurrentCommandOptions } from "../types/command-options.ts";

export async function syncCommand(options: ConcurrentCommandOptions): Promise<Result<void, Error>> {
	const configFile = options.config ?? "workspace.yml";
	const workspaceRoot = options.workspaceRoot ?? Deno.cwd();
	const concurrency = options.concurrency ?? 4;
	const debug = options.debug ?? false;

	console.log(blue("🔄 Starting workspace sync..."));
	console.log(blue(`📄 Config file: ${configFile}`));
	console.log(blue(`📁 Workspace root: ${workspaceRoot}`));
	console.log(blue(`⚡ Concurrency: ${concurrency}`));
	if (debug) {
		console.log(blue("🐛 Debug mode enabled"));
	}

	const configManager = new WorkspaceConfigManager(configFile);
	const configResult = await configManager.getWorkspaceConfig(workspaceRoot);
	if (!configResult.ok) {
		console.log(red("❌ Failed to read workspace config"), `(${configResult.error.message})`);
		return Result.error(configResult.error);
	}
	const config = configResult.value;

	console.log(blue(`📊 Found ${config.workspaces.length} workspaces in config`));
	if (debug) {
		console.log(blue("Workspaces:"), config.workspaces);
	}

	const activeWorkspaces = configManager.getActiveWorkspaces(config);
	const inactiveWorkspaces = configManager.getInactiveWorkspaces(config);

	console.log(blue(`✅ Active workspaces: ${activeWorkspaces.length}`));
	console.log(blue(`❌ Inactive workspaces: ${inactiveWorkspaces.length}`));

	if (inactiveWorkspaces.length > 0) {
		console.log(yellow("Removing inactive workspaces..."));
		const removeResult = await processConcurrently(
			inactiveWorkspaces,
			async (workspace) => {
				const workspacePath = path.join(workspaceRoot, workspace.path);
				const git = new GitManager(workspaceRoot);
				const dir = await isDir(workspacePath);
				if (!dir.ok) {
					return Result.ok(); // Skip if directory doesn't exist
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
		);

		if (!removeResult.ok) {
			return Result.error(removeResult.error);
		}
	}

	if (activeWorkspaces.length > 0) {
		console.log(yellow("Syncing active workspaces..."));
		const checkoutManager = new WorkspaceCheckoutManager(workspaceRoot);

		const syncResult = await processConcurrently(
			activeWorkspaces,
			async (workspace) => {
				const workspacePath = path.join(workspaceRoot, workspace.path);

				// Check if submodule exists
				const dir = await isDir(workspacePath);
				if (!dir.ok) {
					console.log(yellow(`📥 Checking out workspace: ${workspace.path}`));
					const checkout = await checkoutManager.checkoutWorkspace(
						workspace.url,
						workspace.path,
						workspace.branch,
					);
					if (!checkout.ok) {
						console.log(
							red(`❌ Failed to check out workspace: ${workspace.path}`),
							`(${checkout.error.message})`,
						);
						return Result.error(checkout.error);
					}
					console.log(green(`✅ Successfully checked out workspace: ${workspace.path}`));
					return Result.ok();
				}

				// Check if it's a git repository
				const subGit = new GitManager(workspacePath);
				const isGitRepo = await subGit.isRepository();
				if (!isGitRepo.ok) {
					console.log(
						red(`❌ Failed to check git repository: ${workspace.path}`),
						`(${isGitRepo.error.message})`,
					);
					return Result.error(isGitRepo.error);
				}
				if (!isGitRepo.value) {
					console.log(red(`❌ Not a git repository: ${workspace.path}`));
					return Result.error(new Error(`Not a git repository: ${workspace.path}`));
				}

				// Check if on correct branch
				const currentBranch = await subGit.getCurrentBranch();
				if (!currentBranch.ok) {
					console.log(
						red(`❌ Failed to get current branch: ${workspace.path}`),
						`(${currentBranch.error.message})`,
					);
					return Result.error(currentBranch.error);
				}
				if (currentBranch.value !== workspace.branch) {
					console.log(
						yellow(
							`🔄 Switching branch for ${workspace.path} from ${currentBranch.value} to ${workspace.branch}`,
						),
					);
					const checkout = await subGit.checkoutBranch(workspace.branch);
					if (!checkout.ok) {
						console.log(
							red(`❌ Failed to switch branch for ${workspace.path}`),
							`(${checkout.error.message})`,
						);
						return Result.error(checkout.error);
					}
				}

				// Check if local has uncommitted changes
				const isClean = await subGit.isWorkingDirectoryClean();
				if (!isClean.ok) {
					console.log(
						red(`❌ Failed to check working directory: ${workspace.path}`),
						`(${isClean.error.message})`,
					);
					return Result.error(isClean.error);
				}
				if (!isClean.value) {
					console.log(yellow(`⚠️  Workspace has uncommitted changes: ${workspace.path}`));
					// Stash changes with a message that includes the workspace path
					const stash = await subGit.stash(`workspace-manager: sync ${workspace.path}`);
					if (!stash.ok) {
						console.log(
							red(`❌ Failed to stash changes: ${workspace.path}`),
							`(${stash.error.message})`,
						);
						return Result.error(stash.error);
					}
					console.log(yellow(`✅ Stashed changes for: ${workspace.path}`));

					// Pull latest from remote
					const pull = await subGit.pullOriginBranch(workspace.branch);
					if (!pull.ok) {
						console.log(
							red(`❌ Failed to pull latest changes: ${workspace.path}`),
							`(${pull.error.message})`,
						);
						return Result.error(pull.error);
					}
					console.log(green(`✅ Successfully pulled latest changes: ${workspace.path}`));

					// Apply stash back
					const unstash = await subGit.stashPop();
					if (!unstash.ok) {
						console.log(
							red(`❌ Failed to unstash changes: ${workspace.path}`),
							`(${unstash.error.message})`,
						);
						return Result.error(unstash.error);
					}
					console.log(yellow(`✅ Unstashed changes for: ${workspace.path}`));
					return Result.ok();
				}

				// Clean working directory, just pull latest
				const pull = await subGit.pullOriginBranch(workspace.branch);
				if (!pull.ok) {
					console.log(
						red(`❌ Failed to pull latest changes: ${workspace.path}`),
						`(${pull.error.message})`,
					);
					return Result.error(pull.error);
				}
				console.log(green(`✅ Successfully pulled latest changes: ${workspace.path}`));

				return Result.ok();
			},
		);

		if (!syncResult.ok) {
			return Result.error(syncResult.error);
		}
	}

	// Setup go workspace
	console.log(blue("🚀 Setting up Go workspace..."));
	const goManager = new GoWorkspaceManager(workspaceRoot);
	const goWorkResult = await goManager.setupWorkspace(
		activeWorkspaces.filter((w) => w.isGolang).map((w) => w.path),
		inactiveWorkspaces.filter((w) => w.isGolang).map((w) => w.path),
	);
	if (!goWorkResult.ok) {
		console.log(yellow("⚠️  Go workspace setup failed"), `(${goWorkResult.error.message})`);
		// Don't fail the entire sync for Go workspace issues
	} else {
		console.log(green("✅ Go workspace setup successful"));
	}

	console.log(green("🎉 Sync complete!"));

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
		const result = await syncCommand({
			config: options.config,
			workspaceRoot: options.workspaceRoot,
			concurrency: typeof options.concurrency === "string" ? parseInt(options.concurrency, 10) : options.concurrency,
			debug: options.debug,
		});
		CommandErrorHandler.withExit(result, "Sync");
	});
