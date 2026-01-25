import * as path from "@std/path";
import { Result } from "typescript-result";
import { wrapErrorResult } from "../libs/errors.ts";
import { GitManagerFactory } from "../libs/git.ts";
import { GoWork, GoWorkFactory } from "../libs/go.ts";

export class WorkspaceManager {
	constructor(
		private readonly _workspaceRoot: string,
		private readonly _goWorkFactory: GoWorkFactory,
		private readonly _gitManagerFactory: GitManagerFactory,
	) {}

	async checkoutWorkspace(url: string, workspacePath: string, branch: string): Promise<Result<void, Error>> {
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
			return wrapErrorResult(`Failed to checkout submodule at ${workspacePath} to branch ${branch}`, checkoutResult.error);
		}

		// Pull the latest changes from the specified branch
		const pullResult = await submoduleGit.pullOriginBranch(branch);
		if (!pullResult.ok) {
			return wrapErrorResult(`Failed to pull latest changes for submodule at ${workspacePath} from branch ${branch}`, pullResult.error);
		}

		return Result.ok();
	}

	async setupGoWorkspace(add: string[], remove: string[]): Promise<Result<void, Error>> {
		const goWork = this._goWorkFactory(this._workspaceRoot);

		// Check if Go is available
		const goAvailable = await GoWork.isAvailable();
		if (!goAvailable) {
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
}
