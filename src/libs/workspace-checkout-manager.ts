import { GitManager, GitManagerFactory } from "./git.ts";
import { Result } from "typescript-result";
import { ErrorWithCause } from "./errors.ts";
import * as path from "@std/path";

export class WorkspaceCheckoutManager {
	private readonly gitManagerFactory: GitManagerFactory;
	private readonly workspaceRoot: string;

	constructor(
		workspaceRoot: string,
		gitManagerFactory?: GitManagerFactory,
	) {
		this.workspaceRoot = workspaceRoot;
		// Default factory if none provided
		this.gitManagerFactory = gitManagerFactory ?? {
			create: (path: string) => new GitManager(path),
		};
	}

	async checkoutWorkspace(
		url: string,
		workspacePath: string,
		branch: string,
	): Promise<Result<void, Error>> {
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
}
