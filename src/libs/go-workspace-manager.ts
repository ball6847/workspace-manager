import { GoAvailabilityChecker, GoWork, GoWorkFactory } from "./go.ts";
import { Result } from "typescript-result";

export class GoWorkspaceManager {
	private readonly goWorkFactory: GoWorkFactory;
	private readonly availabilityChecker: GoAvailabilityChecker;
	private readonly workspaceRoot: string;

	constructor(
		workspaceRoot: string,
		goWorkFactory?: GoWorkFactory,
		availabilityChecker?: GoAvailabilityChecker,
	) {
		this.workspaceRoot = workspaceRoot;
		// Default factory if none provided
		this.goWorkFactory = goWorkFactory ?? {
			create: (path: string) => new GoWork(path),
		};
		this.availabilityChecker = availabilityChecker ?? {
			check: () => GoWork.isAvailable(),
		};
	}

	async setupWorkspace(add: string[], remove: string[]): Promise<Result<void, Error>> {
		const goWork = this.goWorkFactory.create(this.workspaceRoot);

		// Check if Go is available
		const goAvailable = await this.availabilityChecker.check();
		if (!goAvailable.ok) {
			return Result.error(new Error("Failed to check Go availability"));
		}

		// Go is not available
		if (!goAvailable.value) {
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
