import { blue, green, red, yellow } from "@std/fmt/colors";
import * as path from "@std/path";
import { Result } from "typescript-result";
import { parseConfigFile } from "../libs/config.ts";
import { ErrorWithCause } from "../libs/errors.ts";
import { isDir } from "../libs/file.ts";
import { gitCheckoutBranch, gitFetch, gitIsWorkingDirectoryClean, gitPullOriginBranch, gitStash, gitStashPop } from "../libs/git.ts";

export type UpdateCommandOption = {
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
};

/**
 * Update all submodules by checking out to their tracking branches and pulling latest changes
 *
 * @param option
 * @returns Result indicating success or failure
 */
export async function updateCommand(option: UpdateCommandOption): Promise<Result<void, Error>> {
	// handle default values
	const configFile = option.config ??= "workspace.yml";
	const workspaceRoot = option.workspaceRoot ??= ".";
	const debug = option.debug ?? false;

	// validate workspace directory and parse config file
	const validated = await validateWorkspaceDir(workspaceRoot);
	if (!validated.ok) {
		console.log(red("Invalid workspace directory: "), workspaceRoot, `(${validated.error.message})`);
		return Result.error(validated.error);
	}

	// parse config file
	const parseConfig = await parseConfigFile(configFile);
	if (!parseConfig.ok) {
		console.log(red("Failed to parse config file: "), configFile, `(${parseConfig.error.message})`);
		return Result.error(parseConfig.error);
	}
	const config = parseConfig.value;

	// get only active workspaces
	const activeWorkspaces = config.workspaces.filter((item) => item.active);

	if (debug) {
		console.log(blue(`Found ${activeWorkspaces.length} active workspaces to update`));
	}

	// update all active workspaces
	for (const workspace of activeWorkspaces) {
		const workspacePath = path.join(workspaceRoot, workspace.path);
		const dir = await isDir(workspacePath);
		if (!dir.ok) {
			console.log(yellow(`Workspace directory does not exist, skipping: ${workspace.path}`));
			continue;
		}

		console.log(blue(`Updating workspace: ${workspace.path} (branch: ${workspace.branch})`));

		// checkout to tracking branch
		const checkoutResult = await gitCheckoutBranch(workspace.branch, workspacePath);
		if (!checkoutResult.ok) {
			console.log(
				red(`Failed to checkout to branch ${workspace.branch} in ${workspace.path}`),
				`(${checkoutResult.error.message})`,
			);
			return Result.error(checkoutResult.error);
		}

		if (debug) {
			console.log(green(`✓ Checked out to branch ${workspace.branch} in ${workspace.path}`));
		}

		// check if working directory is clean
		const isCleanResult = await gitIsWorkingDirectoryClean(workspacePath);
		if (!isCleanResult.ok) {
			console.log(
				red(`Failed to check working directory status in ${workspace.path}`),
				`(${isCleanResult.error.message})`,
			);
			return Result.error(isCleanResult.error);
		}

		const isClean = isCleanResult.value;
		let hasStashedChanges = false;

		// stash changes if working directory is dirty
		if (!isClean) {
			console.log(yellow(`Working directory is dirty in ${workspace.path}, stashing changes...`));
			const stashResult = await gitStash(workspacePath, `workspace-manager auto-stash before update`);
			if (!stashResult.ok) {
				console.log(
					red(`Failed to stash changes in ${workspace.path}`),
					`(${stashResult.error.message})`,
				);
				return Result.error(stashResult.error);
			}
			hasStashedChanges = true;
			if (debug) {
				console.log(green(`✓ Stashed changes in ${workspace.path}`));
			}
		}

		// fetch latest changes from origin
		const fetchResult = await gitFetch(workspacePath);
		if (!fetchResult.ok) {
			console.log(
				red(`Failed to fetch latest changes from origin in ${workspace.path}`),
				`(${fetchResult.error.message})`,
			);
			return Result.error(fetchResult.error);
		}

		if (debug) {
			console.log(green(`✓ Fetched latest changes from origin in ${workspace.path}`));
		}

		// pull latest changes from tracking branch
		const pullResult = await gitPullOriginBranch(workspace.branch, workspacePath);
		if (!pullResult.ok) {
			console.log(
				red(`Failed to pull latest changes from origin/${workspace.branch} in ${workspace.path}`),
				`(${pullResult.error.message})`,
			);
			return Result.error(pullResult.error);
		}

		if (debug) {
			console.log(green(`✓ Pulled latest changes from origin/${workspace.branch} in ${workspace.path}`));
		}

		// pop stashed changes if we stashed them
		if (hasStashedChanges) {
			console.log(blue(`Restoring stashed changes in ${workspace.path}...`));
			const popResult = await gitStashPop(workspacePath);
			if (!popResult.ok) {
				console.log(
					yellow(`Warning: Failed to pop stash in ${workspace.path}. You may need to manually resolve conflicts.`),
					`(${popResult.error.message})`,
				);
				// Don't return error here, as the update was successful, just the stash pop failed
				console.log(yellow(`You can manually run 'git stash pop' in ${workspace.path} to restore your changes.`));
			} else {
				if (debug) {
					console.log(green(`✓ Restored stashed changes in ${workspace.path}`));
				}
			}
		}

		console.log(green(`✓ Successfully updated workspace: ${workspace.path}`));
	}

	console.log(green(`🎉 All workspaces updated successfully!`));
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
