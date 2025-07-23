import { Result } from "typescript-result";
import { ErrorWithCause } from "./errors.ts";

export async function gitSubmoduleRemove(path: string, _projectRoot: string) {
	// De-initialize the submodule
	// TODO: check if we need to join with projectRoot
	const deInit = await gitDeInit(path);
	if (!deInit.ok) {
		return Result.error(deInit.error);
	}

	// Remove the submodule from git
	const rm = await gitRm(path);
	if (!rm.ok) {
		return Result.error(rm.error);
	}

	// Remove the submodule's git directory if it exists
	const gitModulePath = `.git/modules/${path}`;
	const stat = await Result.fromAsyncCatching(() => Deno.stat(gitModulePath));
	if (!stat.ok) {
		// Directory doesn't exist, no need to remove
		return Result.ok(undefined);
	}

	// Not a directory
	if (stat.value.isDirectory) {
		const remove = await Result.fromAsyncCatching(() => Deno.remove(gitModulePath, { recursive: true }));
		if (!remove.ok) {
			return Result.error(remove.error);
		}
	}

	return Result.ok();
}

export function gitDeInit(path: string) {
	return Result.fromAsyncCatching(() =>
		new Deno.Command("git", {
			args: ["submodule", "deinit", "-f", path],
			stderr: "null",
		}).output()
	);
}

export function gitRm(path: string) {
	return Result.fromAsyncCatching(() =>
		new Deno.Command("git", {
			args: ["rm", "-f", path],
			stderr: "null",
		}).output()
	);
}

/**
 * Add git submodule with specified branch
 * @param url - URL of the repository to add as submodule
 * @param path - Path where the submodule should be added
 * @param branch - Branch to checkout
 * @param projectRoot - Root directory of the project
 */
export async function gitSubmoduleAddWithBranch(url: string, path: string, branch: string, projectRoot: string) {
	return await Result.fromAsyncCatching(() =>
		new Deno.Command("git", {
			args: ["submodule", "add", "--force", "-b", branch, url, path],
			cwd: projectRoot,
			stderr: "null",
		}).output()
	).mapError((error) => new ErrorWithCause(`Failed to add submodule at ${path} with branch ${branch}`, error));
}

/**
 * Checkout git repository to specified branch
 * @param branch - Branch to checkout
 * @param cwd - Working directory for the git command
 */
export async function gitCheckoutBranch(branch: string, cwd: string) {
	return await Result.fromAsyncCatching(() =>
		new Deno.Command("git", {
			args: ["checkout", branch],
			cwd,
			stderr: "null",
		}).output()
	).mapError((error) => new ErrorWithCause(`Failed to checkout to branch ${branch}`, error));
}

/**
 * Pull latest changes from origin for specified branch
 * @param branch - Branch to pull from
 * @param cwd - Working directory for the git command
 */
export async function gitPullOriginBranch(branch: string, cwd: string) {
	return await Result.fromAsyncCatching(() =>
		new Deno.Command("git", {
			args: ["pull", "origin", branch],
			cwd,
			stderr: "null",
		}).output()
	).mapError((error) => new ErrorWithCause(`Failed to pull latest changes from origin/${branch}`, error));
}
