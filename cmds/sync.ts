import { blue, green, red, yellow } from "@std/fmt/colors";
import * as path from "@std/path";
import { Result } from "typescript-result";
import { processConcurrently } from "../libs/concurrent.ts";
import { parseConfigFile } from "../libs/config.ts";
import { ErrorWithCause } from "../libs/errors.ts";
import { isDir, isDirectoryEmpty } from "../libs/file.ts";
import { GitManager } from "../libs/git.ts";
import { GoWork } from "../libs/go.ts";

export type SyncCommandOption = {
	/**
	 * Path to workspace config file, default is workspace.yml
	 */
	config?: string;
	/**
	 * Path to workspace root directory, default is current directory
	 */
	workspaceRoot?: string;

	/**
	 * If true, print debug information
	 */
	debug?: boolean;

	/**
	 * Number of concurrent operations, default is 4
	 */
	concurrency?: number;
};

/**
 * Sync workspace with remote
 * - remove inactive items (if directory is dirty, confirm first)
 * - make sure all active items are checked out
 *
 * @param option
 * @returns Result indicating success or failure
 */
export async function syncCommand(option: SyncCommandOption): Promise<Result<void, Error>> {
	// handle default values
	const configFile = option.config ??= "workspace.yml";
	const workspaceRoot = option.workspaceRoot ??= ".";
	const debug = option.debug ?? false;
	const concurrency = option.concurrency ?? 4;

	// validate workspace directory and parse config file
	const validated = await validateWorkspaceDir(workspaceRoot);
	if (!validated.ok) {
		console.log(red("❌ Invalid workspace directory: "), workspaceRoot, `(${validated.error.message})`);
		return Result.error(validated.error);
	}

	// parse config file
	const parseConfig = await parseConfigFile(configFile);
	if (!parseConfig.ok) {
		console.log(red("❌ Failed to parse config file: "), configFile, `(${parseConfig.error.message})`);
		return Result.error(parseConfig.error);
	}
	const config = parseConfig.value;

	// split workspaces by active status
	const activeWorkspaces = config.workspaces.filter((item) => item.active);
	const inactiveWorkspaces = config.workspaces.filter((item) => !item.active);

	// -------------------------------------------------------------------
	// Remove all inactive git submodules

	// remove inactive items concurrently
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

	if (!removeResult.ok) {
		return removeResult;
	}

	// -------------------------------------------------------------------
	// clone git repository if not exist

	// make sure all active items are checked out concurrently
	const checkoutResult = await processConcurrently(
		activeWorkspaces,
		async (workspace) => {
			const workspacePath = path.join(workspaceRoot, workspace.path);
			const git = new GitManager(workspaceRoot);
			const dir = await isDir(workspacePath);

			// If directory exists, validate and heal it
			if (dir.ok) {
				console.log(blue(`🔍 Validating existing workspace: ${workspace.path}`));
				const healResult = await validateAndHealWorkspace(workspace, workspacePath);
				if (!healResult.ok) {
					return Result.error(healResult.error);
				}

				// If validation/healing was successful, we're done
				if (healResult.value) {
					return Result.ok();
				}

				// If healing returned false, we need to remove and re-checkout
				console.log(yellow(`🗑️  Removing corrupted workspace for fresh checkout: ${workspace.path}`));
				const removeResult = await git.submoduleRemove(workspace.path);
				if (!removeResult.ok) {
					console.log(
						red(`❌ Failed to remove corrupted workspace: ${workspace.path}`),
						`(${removeResult.error.message})`,
					);
					return Result.error(removeResult.error);
				}
			}

			console.log(
				yellow(
					`📥 Checking out workspace: ${workspace.path} from ${workspace.url} on branch ${workspace.branch}`,
				),
			);

			// Update the submodule to the specified branch
			const updateResult = await gitSubmoduleAdd(workspace.url, workspace.path, workspace.branch, workspaceRoot);
			if (!updateResult.ok) {
				console.log(
					red(`❌ Failed to checkout workspace: ${workspace.path}`),
					`(${updateResult.error.message})`,
				);
				return Result.error(updateResult.error);
			}

			console.log(green(`✅ Successfully checked out workspace: ${workspace.path}`));
			return Result.ok();
		},
		concurrency,
	);

	if (!checkoutResult.ok) {
		return checkoutResult;
	}

	// -------------------------------------------------------------------
	// manage go workspace

	if (debug) {
		console.log(blue("🔧 Setting up go workspace"));
	}

	const goWorkToRemove = inactiveWorkspaces.filter((w) => w.isGolang).map((w) => w.path);
	const goWorkToUse = activeWorkspaces.filter((w) => w.isGolang).map((w) => w.path);

	const goWorkspace = await setupGoWorkspace(goWorkToUse, goWorkToRemove, workspaceRoot);
	if (!goWorkspace.ok) {
		console.log(red("❌ Failed to setup Go workspace: "), goWorkspace.error.message);
		return Result.error(goWorkspace.error);
	}

	console.log(green("🎉 Workspace sync completed successfully!"));
	return Result.ok();
}

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

/**
 * Add git submodule from specified URL to specified branch
 * @param url - URL of the repository to add as submodule
 * @param path - Path where the submodule should be added
 * @param branch - Branch to checkout
 * @param workspaceRoot - Root directory of the workspace
 */
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

/**
 * Validates and heals a workspace directory to ensure it's properly set up.
 * This function performs safe auto-healing operations without risking data loss.
 *
 * @param workspace - Workspace configuration object
 * @param workspacePath - Full path to the workspace directory
 * @returns Result indicating if workspace is valid/healed or needs full checkout
 */
async function validateAndHealWorkspace(
	workspace: { path: string; url: string; branch: string },
	workspacePath: string,
): Promise<Result<boolean, Error>> {
	const git = new GitManager(workspacePath);
	
	// Check if directory is empty
	const isEmpty = await isDirectoryEmpty(workspacePath);
	if (!isEmpty.ok) {
		return Result.error(isEmpty.error);
	}

	// If directory is empty, we need full checkout
	if (isEmpty.value) {
		console.log(yellow(`📁 Directory is empty, will perform full checkout: ${workspace.path}`));
		return Result.ok(false);
	}

	// Check if it's a valid git repository
	const isRepo = await git.isRepository();
	if (!isRepo.ok) {
		return Result.error(isRepo.error);
	}

	// If not a git repository, we need full checkout
	if (!isRepo.value) {
		console.log(yellow(`📁 Directory is not a git repository, will perform full checkout: ${workspace.path}`));
		return Result.ok(false);
	}

	// Check current branch
	const currentBranch = await git.getCurrentBranch();
	if (!currentBranch.ok) {
		return Result.error(currentBranch.error);
	}

	// If on wrong branch, try to switch (only if working directory is clean)
	if (currentBranch.value !== workspace.branch) {
		const isClean = await git.isWorkingDirectoryClean();
		if (!isClean.ok) {
			return Result.error(isClean.error);
		}

		if (!isClean.value) {
			console.log(
				red(
					`⚠️  Workspace has uncommitted changes on branch ${currentBranch.value}, cannot auto-heal: ${workspace.path}`,
				),
			);
			console.log(yellow(`   Please manually resolve conflicts or stash changes before running sync again.`));
			return Result.error(new Error(`Workspace has uncommitted changes, manual intervention required`));
		}

		console.log(
			yellow(
				`🔄 Switching from branch ${currentBranch.value} to ${workspace.branch}: ${workspace.path}`,
			),
		);

		// Fetch latest changes first
		const fetchResult = await git.fetch();
		if (!fetchResult.ok) {
			console.log(
				yellow(`⚠️  Failed to fetch latest changes, continuing with checkout: ${fetchResult.error.message}`),
			);
		}

		// Checkout to the correct branch
		const checkoutResult = await git.checkoutBranch(workspace.branch);
		if (!checkoutResult.ok) {
			console.log(
				red(`❌ Failed to checkout to branch ${workspace.branch}: ${checkoutResult.error.message}`),
			);
			return Result.error(checkoutResult.error);
		}
	}

	// Pull latest changes from the correct branch
	console.log(blue(`🔄 Pulling latest changes for workspace: ${workspace.path}`));
	const pullResult = await git.pullOriginBranch(workspace.branch);
	if (!pullResult.ok) {
		console.log(yellow(`⚠️  Failed to pull latest changes: ${pullResult.error.message}`));
		// Don't fail the entire operation if pull fails, workspace might still be usable
	}

	console.log(green(`✅ Workspace validated and healed: ${workspace.path}`));
	return Result.ok(true);
}

/**
 * Sets up the Go workspace by managing module paths in go.work file.
 *
 * This function orchestrates the complete workspace setup process:
 * 1. Validates Go installation availability
 * 2. Initializes go.work file if it doesn't exist (`go work init`)
 * 3. Removes inactive module paths from workspace (`go work edit -dropuse`)
 * 4. Adds new active module paths to workspace (`go work use`)
 *
 * @param add - Array of module paths to add to the workspace
 * @param remove - Array of module paths to remove from the workspace
 * @param goWorkRoot - Root directory where the go.work file should be initialized
 * @returns Result indicating success or failure with appropriate error
 */
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
