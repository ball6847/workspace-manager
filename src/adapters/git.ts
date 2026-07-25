import { createMutex, type Mutex } from "@117/mutex";
import { Result } from "typescript-result";
import { AppError, AppErrorCode } from "../libs/app-error.ts";
import { wrapErrorResult } from "../libs/errors.ts";
import type { GitPort } from "../ports/git.ts";

// Registry to share mutexes by cwd
const mutexRegistry = new Map<string, Mutex>();

export class GitManager implements GitPort {
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
	): Promise<Result<void, AppError>> {
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

	async submoduleRemove(path: string): Promise<Result<void, AppError>> {
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
				return wrapErrorResult(`Failed to remove submodule git directory at ${gitModulePath}`, remove.error, AppErrorCode.GIT_FAILED);
			}
		}

		return Result.ok();
	}

	async deinit(path: string): Promise<Result<void, AppError>> {
		await this.mutex.acquire();
		const result = await this.runCommand(["submodule", "deinit", "-f", path]);
		this.mutex.release();
		if (!result.ok) {
			return Result.error(result.error);
		}
		return Result.ok(undefined);
	}

	async rm(path: string): Promise<Result<void, AppError>> {
		await this.mutex.acquire();
		const result = await this.runCommand(["rm", "-f", path]);
		this.mutex.release();
		if (!result.ok) {
			return Result.error(result.error);
		}
		return Result.ok(undefined);
	}

	// Branch operations
	async checkoutBranch(branch: string): Promise<Result<void, AppError>> {
		return await this.runCommandWithErrorContext(
			["checkout", branch],
			`Failed to checkout to branch ${branch}`,
		);
	}

	async getCurrentBranch(): Promise<Result<string, AppError>> {
		// This handles worktree scenarios where submodules are in detached HEAD state
		// by finding the local branch whose tip points at HEAD, falling back to rev-parse.
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

			// Detached HEAD: find the local branch whose tip == HEAD (exact, not "contains")
			// This correctly handles worktree submodules which are always in detached HEAD state
			// but at a known branch tip. Returns the exact branch at tip, or degrades honestly.
			const headsResult = await this.runCommand([
				"for-each-ref",
				"--points-at",
				"HEAD",
				"--format=%(refname:short)",
				"refs/heads/",
			]);

			if (headsResult.ok && headsResult.value.success) {
				const branchName = new TextDecoder().decode(headsResult.value.stdout).trim();
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
			(error) => new AppError(AppErrorCode.GIT_FAILED, `Failed to get current branch`, { cause: error }),
		);
	}

	async pullOriginBranch(branch: string): Promise<Result<void, AppError>> {
		return await this.runCommandWithErrorContext(
			["pull", "origin", branch],
			`Failed to pull latest changes from origin/${branch}`,
		);
	}

	// Repository operations
	async fetch(): Promise<Result<void, AppError>> {
		return await this.runCommandWithErrorContext(
			["fetch", "origin"],
			"Failed to fetch latest changes from origin",
		);
	}

	async isRepository(): Promise<Result<boolean, AppError>> {
		return await Result.fromAsyncCatching(async () => {
			// Cheap first check: is there a git repo accessible from here?
			const gitDirResult = await this.runCommand(["rev-parse", "--git-dir"]);
			if (!gitDirResult.ok || !gitDirResult.value.success) {
				return false;
			}

			// Harden: toplevel must equal this.cwd
			// This prevents false positives for uninitialized submodule dirs
			// inside a superproject (git walks up to parent repo otherwise).
			const toplevelResult = await this.runCommand(["rev-parse", "--show-toplevel"]);
			if (!toplevelResult.ok || !toplevelResult.value.success) {
				return false;
			}

			const toplevel = new TextDecoder().decode(toplevelResult.value.stdout).trim();

			// Use realpath on both sides to handle:
			// - worktree gitdir files (not directories)
			// - symlinked paths
			// - case normalization on case-insensitive filesystems
			let toplevelReal: string;
			let cwdReal: string;

			try {
				toplevelReal = await Deno.realPath(toplevel);
			} catch {
				// Toplevel doesn't exist or can't be resolved -> not a valid repo root
				return false;
			}

			try {
				cwdReal = await Deno.realPath(this.cwd);
			} catch {
				// Our cwd doesn't exist -> definitely not a repo here
				return false;
			}

			return toplevelReal === cwdReal;
		}).mapError((error) => new AppError(AppErrorCode.GIT_FAILED, `Failed to check if directory is a git repository`, { cause: error }));
	}

	async isDetachedHead(): Promise<Result<boolean, AppError>> {
		// git symbolic-ref --quiet --short HEAD
		// - exit 0 + stdout = branch name -> not detached
		// - exit non-zero -> detached
		return await Result.fromAsyncCatching(async () => {
			// Use async output() to satisfy require-await lint rule
			const proc = await new Deno.Command("git", {
				args: ["symbolic-ref", "--quiet", "--short", "HEAD"],
				cwd: this.cwd,
				stdout: "null",
				stderr: "null",
			}).output();

			// exit 0 -> not detached
			// exit non-zero -> detached
			return !proc.success;
		}).mapError((error) => new AppError(AppErrorCode.GIT_FAILED, `Failed to check detached HEAD state`, { cause: error }));
	}

	async isHeadBehindBranch(branch: string): Promise<Result<boolean, AppError>> {
		return await Result.fromAsyncCatching(async () => {
			// Compare against local branch and origin/<branch> — heal is safe if HEAD
			// is contained in either ref's history.
			const candidates: string[] = [];
			if (await this.refExists(`refs/heads/${branch}`)) {
				candidates.push(branch);
			}
			if (await this.refExists(`refs/remotes/origin/${branch}`)) {
				candidates.push(`origin/${branch}`);
			}

			for (const target of candidates) {
				// exit 0 -> HEAD is ancestor of (or equal to) target
				// exit 1 -> not an ancestor (diverged)
				// other   -> genuine failure
				const proc = await new Deno.Command("git", {
					args: ["merge-base", "--is-ancestor", "HEAD", target],
					cwd: this.cwd,
					stdout: "null",
					stderr: "null",
				}).output();

				if (proc.success) {
					return true;
				}
				if (proc.code !== 1) {
					throw new Error(`Git command failed with exit code ${proc.code}: git merge-base --is-ancestor HEAD ${target}`);
				}
			}

			return false;
		}).mapError((error) => new AppError(AppErrorCode.GIT_FAILED, `Failed to check HEAD ancestry against branch ${branch}`, { cause: error }));
	}

	private async refExists(ref: string): Promise<boolean> {
		const proc = await new Deno.Command("git", {
			args: ["rev-parse", "--verify", "--quiet", ref],
			cwd: this.cwd,
			stdout: "null",
			stderr: "null",
		}).output();
		return proc.success;
	}

	async getHeadSha(): Promise<Result<string, AppError>> {
		return await Result.fromAsyncCatching(async () => {
			const result = await this.runCommand(["rev-parse", "HEAD"]);
			if (!result.ok) {
				throw result.error;
			}
			return new TextDecoder().decode(result.value.stdout).trim().toLowerCase();
		}).mapError((error) => new AppError(AppErrorCode.GIT_FAILED, `Failed to get HEAD SHA`, { cause: error }));
	}

	async submoduleInit(path: string): Promise<Result<void, AppError>> {
		await this.mutex.acquire();
		const result = await this.runCommandWithErrorContext(
			["submodule", "update", "--init", path],
			`Failed to initialize submodule at ${path}`,
		);
		this.mutex.release();
		return result;
	}

	async isWorkingDirectoryClean(): Promise<Result<boolean, AppError>> {
		return await Result.fromAsyncCatching(async () => {
			const result = await this.runCommand(["status", "--porcelain"]);
			if (!result.ok) {
				throw result.error;
			}
			const output = new TextDecoder().decode(result.value.stdout).trim();
			return output.length === 0;
		}).mapError(
			(error) => new AppError(AppErrorCode.GIT_FAILED, `Failed to check git status`, { cause: error }),
		);
	}

	async getPorcelainStatus(): Promise<Result<{ modified: number; untracked: number }, AppError>> {
		return await Result.fromAsyncCatching(async () => {
			const result = await this.runCommand(["status", "--porcelain"]);
			if (!result.ok) {
				throw result.error;
			}
			const output = new TextDecoder().decode(result.value.stdout).trim();
			const lines = output.split("\n").filter((line) => line.length > 0);

			let modified = 0;
			let untracked = 0;

			for (const line of lines) {
				const status = line.substring(0, 2);
				if (status === "??") {
					untracked++;
				} else if (status.includes("M") || status.includes("D") || status.includes("A")) {
					modified++;
				}
			}

			return { modified, untracked };
		}).mapError(
			(error) => new AppError(AppErrorCode.GIT_FAILED, `Failed to get file status`, { cause: error }),
		);
	}

	// Stash operations
	async stash(message?: string): Promise<Result<void, AppError>> {
		const args = ["stash", "push"];
		if (message) {
			args.push("-m", message);
		}
		return await this.runCommandWithErrorContext(
			args,
			"Failed to stash changes",
		);
	}

	async stashPop(): Promise<Result<void, AppError>> {
		return await this.runCommandWithErrorContext(
			["stash", "pop"],
			"Failed to pop stash",
		);
	}

	// Private utility methods
	private async runCommand(
		args: string[],
	): Promise<Result<Deno.CommandOutput, AppError>> {
		return await Result.fromAsyncCatching(async () => {
			const output = await new Deno.Command("git", {
				args,
				cwd: this.cwd,
				// TODO: Capture stderr for better error reporting instead of suppressing it
				stderr: "null",
			}).output();
			if (!output.success) {
				throw new Error(`Git command failed with exit code ${output.code}: git ${args.join(" ")}`);
			}
			return output;
		}).mapError((error) => new AppError(AppErrorCode.GIT_FAILED, `Git command failed: git ${args.join(" ")}`, { cause: error }));
	}

	private async runCommandWithErrorContext(
		args: string[],
		context: string,
	): Promise<Result<void, AppError>> {
		const result = await this.runCommand(args);
		if (!result.ok) {
			return Result.error(new AppError(AppErrorCode.GIT_FAILED, context, { cause: result.error }));
		}
		return Result.ok(undefined);
	}
}
