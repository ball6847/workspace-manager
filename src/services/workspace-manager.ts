import { GoWork, GoWorkFactory } from "../libs/go.ts";
import { GitManager, GitManagerFactory } from "../libs/git.ts";
import { Result } from "typescript-result";
import { ErrorWithCause } from "../libs/errors.ts";
import * as path from "@std/path";

export class WorkspaceManager {
	private readonly goWorkFactory: GoWorkFactory;
	private readonly gitManagerFactory: GitManagerFactory;
	private readonly workspaceRoot: string;

	constructor(
		workspaceRoot: string,
		goWorkFactory?: GoWorkFactory,
		gitManagerFactory?: GitManagerFactory,
	) {
		this.workspaceRoot = workspaceRoot;
		// Default factory if none provided
		this.goWorkFactory = goWorkFactory ?? {
			create: (path: string) => new GoWork(path),
		};
		this.gitManagerFactory = gitManagerFactory ?? {
			create: (path: string) => new GitManager(path),
		};
	}

	async checkoutWorkspace(url: string, workspacePath: string, branch: string): Promise<Result<void, Error>> {
		const git = this.gitManagerFactory.create(this.workspaceRoot);

		// Add submodule with specified branch
		const addResult = await git.submoduleAdd(url, workspacePath, branch);
		if (!addResult.ok) {
			return Result.error(addResult.error);
		}

		// Check out the submodule to the specified branch
		const fullSubmodulePath = path.join(this.workspaceRoot, workspacePath);
		const submoduleGit = this.gitManagerFactory.create(fullSubmodulePath);
		const checkoutResult = await submoduleGit.checkoutBranch(branch);
		if (!checkoutResult.ok) {
			return Result.error(
				new ErrorWithCause(
					`Failed to checkout submodule at ${workspacePath} to branch ${branch}`,
					checkoutResult.error,
				),
			);
		}

		// Pull the latest changes from the specified branch
		const pullResult = await submoduleGit.pullOriginBranch(branch);
		if (!pullResult.ok) {
			return Result.error(
				new ErrorWithCause(
					`Failed to pull latest changes for submodule at ${workspacePath} from branch ${branch}`,
					pullResult.error,
				),
			);
		}

		return Result.ok();
	}

	async setupGoWorkspace(add: string[], remove: string[]): Promise<Result<void, Error>> {
		const goWork = this.goWorkFactory.create(this.workspaceRoot);

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