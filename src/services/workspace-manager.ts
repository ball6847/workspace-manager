import * as path from "@std/path";
import { Result } from "typescript-result";
import { AppError, AppErrorCode } from "../libs/app-error.ts";
import { wrapErrorResult } from "../libs/errors.ts";
import type { GitPortFactory } from "../ports/git.ts";
import type { GoWorkPortFactory } from "../ports/go-work.ts";

export class WorkspaceManager {
	constructor(
		private readonly _workspaceRoot: string,
		private readonly _goWorkFactory: GoWorkPortFactory,
		private readonly _gitManagerFactory: GitPortFactory,
	) {}

	async checkoutWorkspace(url: string, workspacePath: string, branch: string): Promise<Result<void, AppError>> {
		const git = this._gitManagerFactory(this._workspaceRoot);

		// Add submodule with specified branch
		const addResult = await git.submoduleAdd(url, workspacePath, branch);
		if (!addResult.ok) {
			return Result.error(addResult.error);
		}

		// Check out the submodule to the specified branch
		const fullSubmodulePath = path.join(this._workspaceRoot, workspacePath);
		const submoduleGit = this._gitManagerFactory(fullSubmodulePath);
		const checkoutResult = await submoduleGit.checkoutBranch(branch);
		if (!checkoutResult.ok) {
			return wrapErrorResult(`Failed to checkout submodule at ${workspacePath} to branch ${branch}`, checkoutResult.error, AppErrorCode.CHECKOUT_FAILED);
		}

		// Pull the latest changes from the specified branch
		const pullResult = await submoduleGit.pullOriginBranch(branch);
		if (!pullResult.ok) {
			return wrapErrorResult(`Failed to pull latest changes for submodule at ${workspacePath} from branch ${branch}`, pullResult.error, AppErrorCode.CHECKOUT_FAILED);
		}

		return Result.ok();
	}

	async setupGoWorkspace(add: string[], remove: string[]): Promise<Result<void, AppError>> {
		const goWork = this._goWorkFactory(this._workspaceRoot);

		// Check if Go is available
		const goAvailable = await goWork.isAvailable();
		if (!goAvailable.ok) {
			return Result.error(goAvailable.error);
		}
		if (!goAvailable.value) {
			return Result.error(new AppError(AppErrorCode.GO_UNAVAILABLE, "Go is not available."));
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
}
