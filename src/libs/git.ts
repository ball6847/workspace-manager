import { createMutex, type Mutex } from "@117/mutex";
import { Result } from "typescript-result";
import { wrapError, wrapErrorResult } from "./errors.ts";

export type GitManagerFactory = (path: string) => GitManager;

// Registry to share mutexes by cwd
const mutexRegistry = new Map<string, Mutex>();

export class GitManager {
	private readonly mutex: Mutex;

	constructor(private readonly cwd: string) {
		// Share mutex for same cwd across instances
		if (!mutexRegistry.has(cwd)) {
			mutexRegistry.set(cwd, createMutex());
		}
		this.mutex = mutexRegistry.get(cwd)!;
	}

	// Submodule operations
	async submoduleAdd(
		url: string,
		path: string,
		branch?: string,
	): Promise<Result<void, Error>> {
		await this.mutex.acquire();
		const args = ["submodule", "add", "--force"];
		if (branch) {
			args.push("-b", branch);
		}
		args.push(url, path);

		const result = await this.runCommandWithErrorContext(
			args,
			`Failed to add submodule at ${path}${branch ? ` with branch ${branch}` : ""}`,
		);
		this.mutex.release();
		return result;
	}

	async submoduleRemove(path: string): Promise<Result<void, Error>> {
		// De-initialize the submodule
		const deInit = await this.deinit(path);
		if (!deInit.ok) {
			return Result.error(deInit.error);
		}

		// Remove the submodule from git
		const rm = await this.rm(path);
		if (!rm.ok) {
			return Result.error(rm.error);
		}

		// Remove the submodule's git directory if it exists
		const gitModulePath = `${this.cwd}/.git/modules/${path}`;
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

	async deinit(path: string): Promise<Result<void, Error>> {
		await this.mutex.acquire();
		const result = await this.runCommand(["submodule", "deinit", "-f", path]);
		this.mutex.release();
		if (!result.ok) {
			return Result.error(result.error);
		}
		return Result.ok(undefined);
	}

	async rm(path: string): Promise<Result<void, Error>> {
		await this.mutex.acquire();
		const result = await this.runCommand(["rm", "-f", path]);
		this.mutex.release();
		if (!result.ok) {
			return Result.error(result.error);
		}
		return Result.ok(undefined);
	}

	// Branch operations
	async checkoutBranch(branch: string): Promise<Result<void, Error>> {
		return await this.runCommandWithErrorContext(
			["checkout", branch],
			`Failed to checkout to branch ${branch}`,
		);
	}

	async getCurrentBranch(): Promise<Result<string, Error>> {
		// Check if the improved branch detection is enabled via feature flag
		// This handles worktree scenarios where submodules are in detached HEAD state
		// Set WM_USE_NAME_REV=1 to enable
		const useNameRev = Deno.env.get("WM_USE_NAME_REV") === "1";

		if (useNameRev) {
			return await this.getCurrentBranchWithNameRev();
		}

		// Original behavior: use rev-parse --abbrev-ref HEAD
		return await Result.fromAsyncCatching(async () => {
			const result = await this.runCommand([
				"rev-parse",
				"--abbrev-ref",
				"HEAD",
			]);
			if (!result.ok) {
				throw result.error;
			}
			return new TextDecoder().decode(result.value.stdout).trim();
		}).mapError(
			(error) => wrapError(`Failed to get current branch`, error),
		);
	}

	/**
	 * Enhanced branch detection that uses git name-rev for detached HEAD scenarios.
	 * This is useful in worktrees where submodules may be in detached HEAD state.
	 * Enable via WM_USE_NAME_REV=1 environment variable.
	 */
	private async getCurrentBranchWithNameRev(): Promise<Result<string, Error>> {
		return await Result.fromAsyncCatching(async () => {
			// Try git symbolic-ref --short HEAD first (fails if HEAD is detached)
			const symbolicRefResult = await this.runCommand([
				"symbolic-ref",
				"--short",
				"HEAD",
			]);

			if (symbolicRefResult.ok && symbolicRefResult.value.success) {
				return new TextDecoder().decode(symbolicRefResult.value.stdout).trim();
			}

			// If HEAD is detached, try git name-rev to find the closest branch/tag
			const nameRevResult = await this.runCommand([
				"name-rev",
				"--name-only",
				"HEAD",
			]);

			if (nameRevResult.ok && nameRevResult.value.success) {
				const branchName = new TextDecoder().decode(nameRevResult.value.stdout).trim();
				if (branchName) {
					return branchName;
				}
			}

			// Fallback to rev-parse --abbrev-ref HEAD (will return "HEAD" if detached)
			const result = await this.runCommand([
				"rev-parse",
				"--abbrev-ref",
				"HEAD",
			]);
			if (!result.ok) {
				throw result.error;
			}
			return new TextDecoder().decode(result.value.stdout).trim();
		}).mapError(
			(error) => wrapError(`Failed to get current branch`, error),
		);
	}

	async pullOriginBranch(branch: string): Promise<Result<void, Error>> {
		return await this.runCommandWithErrorContext(
			["pull", "origin", branch],
			`Failed to pull latest changes from origin/${branch}`,
		);
	}

	// Repository operations
	async fetch(): Promise<Result<void, Error>> {
		return await this.runCommandWithErrorContext(
			["fetch", "origin"],
			"Failed to fetch latest changes from origin",
		);
	}

	async isRepository(): Promise<Result<boolean, Error>> {
		return await Result.fromAsyncCatching(async () => {
			const result = await this.runCommand(["rev-parse", "--git-dir"]);
			if (!result.ok) {
				throw result.error;
			}
			return result.value.success;
		}).mapError((error) => wrapError(`Failed to check if directory is a git repository`, error));
	}

	async isWorkingDirectoryClean(): Promise<Result<boolean, Error>> {
		return await Result.fromAsyncCatching(async () => {
			const result = await this.runCommand(["status", "--porcelain"]);
			if (!result.ok) {
				throw result.error;
			}
			const output = new TextDecoder().decode(result.value.stdout).trim();
			return output.length === 0;
		}).mapError(
			(error) => wrapError(`Failed to check git status`, error),
		);
	}

	// Stash operations
	async stash(message?: string): Promise<Result<void, Error>> {
		const args = ["stash", "push"];
		if (message) {
			args.push("-m", message);
		}
		return await this.runCommandWithErrorContext(
			args,
			"Failed to stash changes",
		);
	}

	async stashPop(): Promise<Result<void, Error>> {
		return await this.runCommandWithErrorContext(
			["stash", "pop"],
			"Failed to pop stash",
		);
	}

	// Private utility methods
	private async runCommand(
		args: string[],
	): Promise<Result<Deno.CommandOutput, Error>> {
		return await Result.fromAsyncCatching(() =>
			new Deno.Command("git", {
				args,
				cwd: this.cwd,
				// TODO: Capture stderr for better error reporting instead of suppressing it
				stderr: "null",
			}).output()
		);
	}

	private async runCommandWithErrorContext(
		args: string[],
		context: string,
	): Promise<Result<void, Error>> {
		const result = await this.runCommand(args);
		if (!result.ok) {
			return wrapErrorResult(context, result.error);
		}
		return Result.ok(undefined);
	}
}
