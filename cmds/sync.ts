import { blue, green, red, yellow } from "@std/fmt/colors";
import * as path from "@std/path";
import { Result } from "typescript-result";
import { parseConfigFile } from "../libs/config.ts";
import { ErrorWithCause } from "../libs/errors.ts";
import { isDir } from "../libs/file.ts";
import { gitSubmoduleRemove } from "../libs/git.ts";
import { goWorkInit, goWorkRemove, goWorkUse, isGoAvailable } from "../libs/go.ts";

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
};

/**
 * Sync workspace with remote
 * - remove inactive items (if directory is dirty, confirm first)
 * - make sure all active items are checked out
 *
 * @param option
 * @returns
 */
export async function syncCommand(option: SyncCommandOption) {
	// handle default values
	const configFile = option.config ??= "workspace.yml";
	const workspaceRoot = option.workspaceRoot ??= ".";
	const debug = option.debug ?? false;

	// validate workspace directory and parse config file
	const validated = await validateWorkspaceDir(workspaceRoot);
	if (!validated.ok) {
		console.log(red("Invalid workspace directory: "), workspaceRoot, `(${validated.error.message})`);
		return;
	}

	// parse config file
	const parseConfig = await parseConfigFile(configFile);
	if (!parseConfig.ok) {
		console.log(red("Failed to parse config file: "), configFile, `(${parseConfig.error.message})`);
		return;
	}
	const config = parseConfig.value;

	// split workspaces by active status
	const activeWorkspaces = config.workspaces.filter((item) => item.active);
	const inactiveWorkspaces = config.workspaces.filter((item) => !item.active);

	// -------------------------------------------------------------------
	// Remove all inactive git submodules

	// remove inactive items
	for (const workspace of inactiveWorkspaces) {
		const workspacePath = path.join(workspaceRoot, workspace.path);
		const dir = await isDir(workspacePath);
		if (!dir.ok) {
			continue; // skip if directory does not exist
		}

		console.log(yellow(`Removing inactive workspace: ${workspace.path}`));

		const remove = await gitSubmoduleRemove(workspace.path, workspaceRoot);
		if (!remove.ok) {
			console.log(red(`Failed to remove inactive workspace: ${workspace.path}`), `(${remove.error.message})`);
			return;
		}

		console.log(green(`Successfully removed inactive workspace: ${workspace.path}`));
	}

	// -------------------------------------------------------------------
	// clone git repository if not exist

	// make sure all active items are checked out
	for (const workspace of activeWorkspaces) {
		const workspacePath = path.join(workspaceRoot, workspace.path);
		const dir = await isDir(workspacePath);
		if (dir.ok) {
			console.log(blue(`Workspace directory already exists, skipping checkout: ${workspace.path}`));
			continue;
		}

		console.log(
			yellow(`Checking out workspace: ${workspace.path} from ${workspace.url} on branch ${workspace.branch}`),
		);

		// Update the submodule to the specified branch
		const updateResult = await gitSubmoduleAdd(workspace.url, workspace.path, workspace.branch, workspaceRoot);
		if (!updateResult.ok) {
			console.log(red(`Failed to checkout workspace: ${workspace.path}`), `(${updateResult.error.message})`);
			return Result.error(updateResult.error);
		}

		console.log(green(`Successfully checked out workspace: ${workspace.path}`));
	}

	// -------------------------------------------------------------------
	// manage go workspace

	if (debug) {
		console.log(blue("Setting up go workspace"));
	}

	const goWorkToRemove = inactiveWorkspaces.filter((w) => w.isGolang).map((w) => w.path);
	const goWorkToUse = activeWorkspaces.filter((w) => w.isGolang).map((w) => w.path);

	const goWorkspace = await setupGoWorkspace(goWorkToUse, goWorkToRemove);
	if (!goWorkspace.ok) {
		console.log(red("Failed to setup Go workspace: "), goWorkspace.error.message);
	}
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
 * @param projectRoot - Root directory of the project
 */
async function gitSubmoduleAdd(url: string, path: string, branch: string, projectRoot: string) {
	// Add submodule with specified branch
	const addResult = await Result.fromAsyncCatching(() =>
		new Deno.Command("git", {
			args: ["submodule", "add", "--force", "-b", branch, url, path],
			cwd: projectRoot,
			stderr: "null",
		}).output()
	);

	if (!addResult.ok) {
		return Result.error(
			new ErrorWithCause(`Failed to add submodule at ${path} with branch ${branch}`, addResult.error),
		);
	}

	// check out the submodule to the specified branch
	const checkoutResult = await Result.fromAsyncCatching(() =>
		new Deno.Command("git", {
			args: ["checkout", branch],
			cwd: `${projectRoot}/${path}`,
			stderr: "null",
		}).output()
	);

	if (!checkoutResult.ok) {
		return Result.error(
			new ErrorWithCause(`Failed to checkout submodule at ${path} to branch ${branch}`, checkoutResult.error),
		);
	}

	// pull the latest changes from the specified branch
	const pullResult = await Result.fromAsyncCatching(() =>
		new Deno.Command("git", {
			args: ["pull", "origin", branch],
			cwd: `${projectRoot}/${path}`,
			stderr: "null",
		}).output()
	);

	if (!pullResult.ok) {
		return Result.error(
			new ErrorWithCause(
				`Failed to pull latest changes for submodule at ${path} from branch ${branch}`,
				pullResult.error,
			),
		);
	}

	return Result.ok();
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
 * @returns Result indicating success or failure with appropriate error
 */
async function setupGoWorkspace(add: string[], remove: string[]): Promise<Result<void, Error>> {
	// Check if Go is available
	const goAvailable = await isGoAvailable();
	if (!goAvailable.ok) {
		return Result.error(new Error("Failed to check Go availability"));
	}

	// Go is not available
	if (!goAvailable.value) {
		return Result.error(new Error("Go is not available."));
	}

	// Initialize go workspace if it doesn't exist
	const initResult = await goWorkInit(".");
	if (!initResult.ok) {
		return Result.error(initResult.error);
	}

	// Remove inactive Go modules
	if (remove.length > 0) {
		const removeResult = await goWorkRemove(remove);
		if (!removeResult.ok) {
			return Result.error(removeResult.error);
		}
	}

	// Add active Go modules
	if (add.length > 0) {
		const addResult = await goWorkUse(add);
		if (!addResult.ok) {
			return Result.error(addResult.error);
		}
	}

	return Result.ok();
}
