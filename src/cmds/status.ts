import { Table } from "@cliffy/table";
import { blue, gray, green, red, yellow } from "@std/fmt/colors";
import { Result } from "typescript-result";
import type { AppContext } from "../composition.ts";
import { AppError } from "../libs/app-error.ts";
import type { StatusRepository } from "../services/status.ts";

export type StatusCommandOption = {
	config?: string;
	workspaceRoot?: string;
	debug?: boolean;
	concurrency?: number;
	json?: boolean;
	verbose?: boolean;
};

export async function statusCommand(ctx: AppContext, option: StatusCommandOption): Promise<Result<void, AppError>> {
	const result = await ctx.statusService.run({
		config: option.config,
		workspaceRoot: option.workspaceRoot,
		debug: option.debug,
		concurrency: option.concurrency,
		verbose: option.verbose,
	});

	if (!result.ok) {
		return Result.error(result.error);
	}

	const { repositories } = result.value;

	if (option.json) {
		outputJson(repositories);
	} else {
		outputTable(repositories, option.verbose ?? false);
	}

	return Result.ok();
}

function outputJson(repositories: StatusRepository[]) {
	const summary = {
		total: repositories.length,
		clean: repositories.filter((r) => r.exists && r.isClean).length,
		modified: repositories.filter((r) => r.exists && !r.isClean).length,
		missing: repositories.filter((r) => !r.exists).length,
		onWrongBranch: repositories.filter((r) => r.exists && r.currentBranch && r.trackingBranch && r.currentBranch !== r.trackingBranch).length,
		goModules: repositories.filter((r) => r.isGoModule).length,
	};

	const output = {
		summary,
		repositories: repositories.map((repo) => {
			const repoData: Record<string, unknown> = {
				path: repo.path,
				url: repo.url,
				trackingBranch: repo.trackingBranch,
				isGoModule: repo.isGoModule,
				exists: repo.exists,
				currentBranch: repo.currentBranch,
				isClean: repo.isClean,
				onCorrectBranch: repo.exists ? repo.currentBranch === repo.trackingBranch : true,
			};

			if (repo.modifiedFiles !== undefined) {
				repoData.modifiedFiles = repo.modifiedFiles;
			}
			if (repo.untrackedFiles !== undefined) {
				repoData.untrackedFiles = repo.untrackedFiles;
			}
			if (repo.error) {
				repoData.error = repo.error;
			}

			return repoData;
		}),
	};

	console.log(JSON.stringify(output, null, 2));
}

function outputTable(repositories: StatusRepository[], verbose: boolean) {
	if (repositories.length === 0) {
		console.log(yellow("⚠️  No active repositories found"));
		return;
	}

	const clean = repositories.filter((r) => r.exists && r.isClean).length;
	const modified = repositories.filter((r) => r.exists && !r.isClean).length;
	const missing = repositories.filter((r) => !r.exists).length;
	const wrongBranch = repositories.filter((r) => r.exists && r.currentBranch && r.trackingBranch && r.currentBranch !== r.trackingBranch).length;

	console.log("");
	console.log(blue(`📊 Workspace Status - ${repositories.length} active repositories`));
	console.log("");

	const table = new Table()
		.header([
			"Path",
			"Branch",
		])
		.border(false)
		.padding(1);

	for (const repo of repositories) {
		const path = repo.path;

		if (!repo.exists) {
			table.push([
				red(path),
				gray(repo.trackingBranch || "unknown"),
			]);
			continue;
		}

		if (repo.error) {
			table.push([
				yellow(path),
				gray(repo.trackingBranch || "unknown"),
			]);
			continue;
		}

		const currentBranch = repo.currentBranch || "unknown";
		const trackingBranch = repo.trackingBranch || "unknown";

		let branchDisplay: string;
		if (currentBranch === trackingBranch) {
			branchDisplay = green(currentBranch);
		} else {
			branchDisplay = yellow(`${currentBranch} → ${trackingBranch}`);
		}

		if (repo.isClean === false) {
			branchDisplay += " *";
		}

		table.push([
			path,
			branchDisplay,
		]);
	}

	console.log(table.toString());

	console.log("");
	console.log(gray("SUMMARY"));
	const summaryParts = [];
	if (clean > 0) summaryParts.push(green(`✅ ${clean} clean`));
	if (modified > 0) summaryParts.push(yellow(`⚠️  ${modified} modified`));
	if (wrongBranch > 0) summaryParts.push(yellow(`🌿 ${wrongBranch} wrong branch`));
	if (missing > 0) summaryParts.push(red(`❌ ${missing} missing`));

	console.log(summaryParts.join("  "));
	console.log("");

	if (verbose) {
		console.log(blue("🔍 Detailed Information:"));
		console.log("");

		const detailTable = new Table()
			.header([
				"Repository",
				"URL",
				"Details",
			])
			.border(false)
			.padding(1);

		for (const repo of repositories) {
			if (!repo.exists || repo.error) continue;

			const details = [];
			if (repo.modifiedFiles && repo.modifiedFiles > 0) {
				details.push(`${repo.modifiedFiles} modified files`);
			}
			if (repo.untrackedFiles && repo.untrackedFiles > 0) {
				details.push(`${repo.untrackedFiles} untracked files`);
			}
			if (repo.currentBranch !== repo.trackingBranch) {
				details.push(`tracking: ${repo.trackingBranch}`);
			}

			detailTable.push([
				repo.path,
				repo.url,
				details.length > 0 ? details.join(", ") : "No additional details",
			]);
		}

		if (detailTable.length > 0) {
			console.log(detailTable.toString());
			console.log("");
		}
	}
}
