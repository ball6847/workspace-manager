import type { Result } from "typescript-result";
import type { AppError } from "../libs/app-error.ts";

export type SyncBranchResult = { updated: boolean };

export type BranchState = {
	detached: boolean;
	branch: string | null; // null when detached
};

export type GitPort = {
	submoduleAdd(url: string, path: string, branch?: string): Promise<Result<void, AppError>>;
	submoduleRemove(path: string): Promise<Result<void, AppError>>;
	/**
	 * Initialize a submodule at the given path.
	 * Must be called from the workspace root (superproject).
	 * Runs `git submodule update --init <path>`.
	 */
	submoduleInit(path: string): Promise<Result<void, AppError>>;
	/**
	 * Initialize/clone multiple submodules in one batched, parallel command.
	 * Must be called from the workspace root (superproject).
	 * Runs `git submodule update --init --jobs=<jobs> -- <paths...>`.
	 * Only works for submodules registered in .gitmodules; a non-zero exit
	 * indicates one or more paths failed (partial success is possible) —
	 * callers must re-verify each path individually.
	 */
	submoduleInitMany(paths: string[], jobs: number): Promise<Result<void, AppError>>;
	checkoutBranch(branch: string): Promise<Result<void, AppError>>;
	getCurrentBranch(): Promise<Result<string, AppError>>;
	/**
	 * Returns true if HEAD is in detached state.
	 * Uses `git symbolic-ref --quiet --short HEAD`: exit 0 -> not detached, exit non-zero -> detached.
	 * @deprecated Prefer {@link getBranchState} when both detached state and branch name are needed.
	 */
	isDetachedHead(): Promise<Result<boolean, AppError>>;
	/**
	 * Returns detached state and branch name from a single git invocation.
	 * Performs exactly one `git symbolic-ref --short HEAD`:
	 * - exit 0 -> { detached: false, branch: <stdout trimmed> }
	 * - exit non-zero -> { detached: true, branch: null }
	 */
	getBranchState(): Promise<Result<BranchState, AppError>>;
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
	 * Fetches `origin/<branch>`, compares HEAD to `origin/<branch>`, and fast-forwards
	 * the local branch only when HEAD is behind. Never creates merge commits.
	 * Returns `{ updated: true }` when HEAD moved, `{ updated: false }` when already
	 * up-to-date.
	 */
	syncBranch(branch: string): Promise<Result<SyncBranchResult, AppError>>;
	/**
	 * Returns true if and only if cwd is the **root** of a git work tree.
	 * This means `git rev-parse --show-toplevel` succeeds and resolves to `cwd`
	 * (compared via realpath on both sides).
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
