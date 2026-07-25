import type { Result } from "typescript-result";
import type { AppError } from "../libs/app-error.ts";

export type GitPort = {
	submoduleAdd(url: string, path: string, branch?: string): Promise<Result<void, AppError>>;
	submoduleRemove(path: string): Promise<Result<void, AppError>>;
	/**
	 * Initialize a submodule at the given path.
	 * Must be called from the workspace root (superproject).
	 * Runs `git submodule update --init <path>`.
	 */
	submoduleInit(path: string): Promise<Result<void, AppError>>;
	checkoutBranch(branch: string): Promise<Result<void, AppError>>;
	getCurrentBranch(): Promise<Result<string, AppError>>;
	/**
	 * Returns true if HEAD is in detached state.
	 * Uses `git symbolic-ref --quiet --short HEAD`: exit 0 -> not detached, exit non-zero -> detached.
	 */
	isDetachedHead(): Promise<Result<boolean, AppError>>;
	/**
	 * Returns true if HEAD is contained in the given branch's history — i.e. HEAD is
	 * an ancestor of (or equal to) the branch tip — so re-attaching a detached HEAD
	 * via checkout + pull abandons no commits.
	 * Compares against the local branch and `origin/<branch>` (whichever refs exist).
	 * Returns false when HEAD has commits not on the branch, or no such ref exists.
	 */
	isHeadBehindBranch(branch: string): Promise<Result<boolean, AppError>>;
	/**
	 * Returns the full lowercase SHA of HEAD.
	 */
	getHeadSha(): Promise<Result<string, AppError>>;
	pullOriginBranch(branch: string): Promise<Result<void, AppError>>;
	/**
	 * Returns true if and only if cwd is the **root** of a git work tree.
	 * This means:
	 * - `git rev-parse --git-dir` succeeds (basic repo check), AND
	 * - `git rev-parse --show-toplevel` resolves to `cwd`
	 *
	 * This prevents false positives for uninitialized submodule directories
	 * inside a superproject (git would otherwise walk up to parent repo).
	 */
	isRepository(): Promise<Result<boolean, AppError>>;
	isWorkingDirectoryClean(): Promise<Result<boolean, AppError>>;
	getPorcelainStatus(): Promise<Result<{ modified: number; untracked: number }, AppError>>;
	stash(message?: string): Promise<Result<void, AppError>>;
	stashPop(): Promise<Result<void, AppError>>;
	fetch(): Promise<Result<void, AppError>>;
};

export type GitPortFactory = (cwd: string) => GitPort;
