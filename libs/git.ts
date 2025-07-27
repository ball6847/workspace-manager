import { Result } from "typescript-result";
import { ErrorWithCause } from "./errors.ts";

export async function gitSubmoduleRemove(path: string, cwd: string) {
	// De-initialize the submodule
	const deInit = await gitDeInit(path, cwd);
	if (!deInit.ok) {
		return Result.error(deInit.error);
	}

	// Remove the submodule from git
	const rm = await gitRm(path, cwd);
	if (!rm.ok) {
		return Result.error(rm.error);
	}

	// Remove the submodule's git directory if it exists
	const gitModulePath = `${cwd}/.git/modules/${path}`;
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

export function gitDeInit(path: string, cwd: string) {
	return Result.fromAsyncCatching(() =>
		new Deno.Command("git", {
			args: ["submodule", "deinit", "-f", path],
			cwd,
			stderr: "null",
		}).output()
	);
}

export function gitRm(path: string, cwd: string) {
	return Result.fromAsyncCatching(() =>
		new Deno.Command("git", {
			args: ["rm", "-f", path],
			cwd,
			stderr: "null",
		}).output()
	);
}

/**
 * Add git submodule with specified branch
 * @param url - URL of the repository to add as submodule
 * @param path - Path where the submodule should be added
 * @param branch - Branch to checkout
 * @param workspaceRoot - Root directory of the workspace
 */
export async function gitSubmoduleAddWithBranch(url: string, path: string, branch: string, workspaceRoot: string) {
	return await Result.fromAsyncCatching(() =>
		new Deno.Command("git", {
			args: ["submodule", "add", "--force", "-b", branch, url, path],
			cwd: workspaceRoot,
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
 * Fetch latest changes from origin
 * @param cwd - Working directory for the git command
 */
export async function gitFetch(cwd: string) {
	return await Result.fromAsyncCatching(() =>
		new Deno.Command("git", {
			args: ["fetch", "origin"],
			cwd,
			stderr: "null",
		}).output()
	).mapError((error) => new ErrorWithCause(`Failed to fetch latest changes from origin`, error));
}

/**
 * Check if working directory is clean (no uncommitted changes)
 * @param cwd - Working directory for the git command
 * @returns Result with boolean indicating if working directory is clean
 */
export async function gitIsWorkingDirectoryClean(cwd: string): Promise<Result<boolean, Error>> {
	return await Result.fromAsyncCatching(async () => {
		const result = await new Deno.Command("git", {
			args: ["status", "--porcelain"],
			cwd,
			stderr: "null",
		}).output();
		const output = new TextDecoder().decode(result.stdout).trim();
		return output.length === 0;
	}).mapError((error) => new ErrorWithCause(`Failed to check git status`, error));
}

/**
 * Stash current changes
 * @param cwd - Working directory for the git command
 * @param message - Optional stash message
 */
export async function gitStash(cwd: string, message?: string) {
	const args = ["stash", "push"];
	if (message) {
		args.push("-m", message);
	}
	return await Result.fromAsyncCatching(() =>
		new Deno.Command("git", {
			args,
			cwd,
			stderr: "null",
		}).output()
	).mapError((error) => new ErrorWithCause(`Failed to stash changes`, error));
}

/**
 * Pop the most recent stash
 * @param cwd - Working directory for the git command
 */
export async function gitStashPop(cwd: string) {
	return await Result.fromAsyncCatching(() =>
		new Deno.Command("git", {
			args: ["stash", "pop"],
			cwd,
			stderr: "null",
		}).output()
	).mapError((error) => new ErrorWithCause(`Failed to pop stash`, error));
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

/**
 * Get the current branch name
 * @param cwd - Working directory for the git command
 * @returns Result with current branch name
 */
export async function gitGetCurrentBranch(cwd: string): Promise<Result<string, Error>> {
	return await Result.fromAsyncCatching(async () => {
		const result = await new Deno.Command("git", {
			args: ["rev-parse", "--abbrev-ref", "HEAD"],
			cwd,
			stderr: "null",
		}).output();
		return new TextDecoder().decode(result.stdout).trim();
	}).mapError((error) => new ErrorWithCause(`Failed to get current branch`, error));
}

/**
 * Check if directory is a valid git repository
 * @param cwd - Directory to check
 * @returns Result with boolean indicating if directory is a git repository
 */
export async function gitIsRepository(cwd: string): Promise<Result<boolean, Error>> {
	return await Result.fromAsyncCatching(async () => {
		const result = await new Deno.Command("git", {
			args: ["rev-parse", "--git-dir"],
			cwd,
			stderr: "null",
		}).output();
		return result.success;
	}).mapError((error) => new ErrorWithCause(`Failed to check if directory is a git repository`, error));
}
