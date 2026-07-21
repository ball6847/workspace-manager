import { Table } from "@cliffy/table";
import { blue, gray, green, red, yellow } from "@std/fmt/colors";
import * as path from "@std/path";
import { Result } from "typescript-result";
import type { AppContext } from "../composition.ts";
import { AppError } from "../libs/app-error.ts";
import { processConcurrentlyWithResults } from "../libs/concurrent.ts";
import { wrapError } from "../libs/errors.ts";
import type { WorkspaceConfigItem } from "../types/config.ts";

export type StatusCommandOption = {
	/**
	 * Path to workspace config file, default is workspace.yml
	 */
	config?: string;
	/**
	 * Path to workspace root directory, default is current directory
	 */
	workspaceRoot?: string;

	/**
	 * If true, print debug information
	 */
	debug?: boolean;

	/**
	 * Number of concurrent operations, default is 4
	 */
	concurrency?: number;

	/**
	 * Output in JSON format
	 */
	json?: boolean;

	/**
	 * Show verbose git information
	 */
	verbose?: boolean;
};

type RepositoryStatus = {
	path: string;
	url: string;
	trackingBranch: string;
	isGoModule: boolean;
	active: boolean;
	exists: boolean;
	currentBranch?: string;
	isClean?: boolean;
	modifiedFiles?: number;
	untrackedFiles?: number;
	error?: string;
};

/**
 * Show status of active workspace repositories
 *
 * @param ctx Application context with injected ports
 * @param option Command options
 * @returns Result indicating success or failure
 */
export async function statusCommand(ctx: AppContext, option: StatusCommandOption): Promise<Result<void, AppError>> {
	// Discover workspace
	const discovery = ctx.createDiscovery({
		config: option.config,
		workspaceRoot: option.workspaceRoot,
	});

	const discoverResult = await discovery.discover();

	if (!discoverResult.ok) {
		if (!option.json) {
			console.log(red("❌ Failed to discover workspace:"), discoverResult.error.message);
		} else {
			console.log(JSON.stringify({ error: discoverResult.error.message }, null, 2));
		}
		return Result.error(discoverResult.error);
	}

	const { workspaceRoot, configPath } = discoverResult.value;
	const debug = option.debug ?? false;
	const concurrency = option.concurrency ?? 4;
	const json = option.json ?? false;
	const verbose = option.verbose ?? false;

	// Initialize ConfigManager
	const configManager = ctx.createConfigStore(configPath);

	// Parse config file
	const configResult = await configManager.getConfig();
	if (!configResult.ok) {
		if (!json) {
			console.log(red("❌ Failed to parse config file: "), configPath, `(${configResult.error.message})`);
		} else {
			console.log(JSON.stringify({ error: configResult.error.message }, null, 2));
		}
		return Result.error(configResult.error);
	}
	const config = configResult.value;

	// filter active workspaces only
	const activeWorkspaces = config.workspaces.filter((item) => item.active);

	if (activeWorkspaces.length === 0) {
		if (!json) {
			console.log(yellow("⚠️  No active repositories found in workspace configuration"));
		} else {
			console.log(JSON.stringify({ repositories: [], summary: { total: 0 } }, null, 2));
		}
		return Result.ok();
	}

	if (debug) {
		console.log(blue(`🔍 Checking status for ${activeWorkspaces.length} active repositories...`));
	}

	// gather status for all active repositories concurrently
	const statusResults = await processConcurrentlyWithResults(
		activeWorkspaces,
		async (workspace) => await processSingleWorkspace(ctx, workspace, workspaceRoot, verbose),
		concurrency,
	);

	const repositories = statusResults.map((result) => {
		if (!result.ok) {
			// This should theoretically never happen since the processor always returns Result.ok,
			// but we handle it for type safety
			return {
				path: "",
				url: "",
				trackingBranch: "",
				isGoModule: false,
				active: false,
				exists: false,
				error: "Unexpected error occurred",
			};
		}
		return result.value;
	});

	// output results
	if (json) {
		outputJson(repositories);
	} else {
		outputTable(repositories, verbose);
	}

	return Result.ok();
}

async function processSingleWorkspace(
	ctx: AppContext,
	workspace: WorkspaceConfigItem,
	workspaceRoot: string,
	verbose: boolean,
): Promise<Result<RepositoryStatus, AppError>> {
	const workspacePath = path.join(workspaceRoot, workspace.path);
	const git = ctx.gitFactory(workspacePath);
	const status: RepositoryStatus = {
		path: workspace.path,
		url: workspace.url,
		trackingBranch: workspace.branch,
		isGoModule: workspace.isGolang,
		active: workspace.active,
		exists: false,
	};

	// check if directory exists
	const dir = await ctx.fileSystem.isDir(workspacePath);
	if (!dir.ok) {
		status.error = "Directory does not exist";
		return Result.ok(status);
	}

	// check if it's a git repository
	const isRepo = await git.isRepository();
	if (!isRepo.ok) {
		status.error = "Failed to check git repository";
		return Result.ok(status);
	}

	if (!isRepo.value) {
		status.error = "Not a git repository";
		return Result.ok(status);
	}

	status.exists = true;

	// get current branch
	const currentBranch = await git.getCurrentBranch();
	if (!currentBranch.ok) {
		status.error = "Failed to get current branch";
		return Result.ok(status);
	}
	status.currentBranch = currentBranch.value;

	// check if working directory is clean
	const isClean = await git.isWorkingDirectoryClean();
	if (!isClean.ok) {
		status.error = "Failed to check working directory";
		return Result.ok(status);
	}
	status.isClean = isClean.value;

	if (!isClean.value || verbose) {
		// count modified and untracked files
		const fileStatus = await getFileStatus(workspacePath);
		if (fileStatus.ok) {
			status.modifiedFiles = fileStatus.value.modified;
			status.untrackedFiles = fileStatus.value.untracked;
		}
	}

	return Result.ok(status);
}

async function getFileStatus(cwd: string): Promise<Result<{ modified: number; untracked: number }, Error>> {
	return await Result.fromAsyncCatching(async () => {
		const result = await new Deno.Command("git", {
			args: ["status", "--porcelain"],
			cwd,
			stderr: "null",
		}).output();
		const output = new TextDecoder().decode(result.stdout).trim();
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
	}).mapError((error) => wrapError("Failed to get file status", error));
}

function outputJson(repositories: RepositoryStatus[]) {
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

			// Only include file counts if they exist
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

function outputTable(repositories: RepositoryStatus[], verbose: boolean) {
	if (repositories.length === 0) {
		console.log(yellow("⚠️  No active repositories found"));
		return;
	}

	// calculate summary
	const clean = repositories.filter((r) => r.exists && r.isClean).length;
	const modified = repositories.filter((r) => r.exists && !r.isClean).length;
	const missing = repositories.filter((r) => !r.exists).length;
	const wrongBranch = repositories.filter((r) => r.exists && r.currentBranch && r.trackingBranch && r.currentBranch !== r.trackingBranch).length;

	console.log("");
	console.log(blue(`📊 Workspace Status - ${repositories.length} active repositories`));
	console.log("");

	// Create main status table
	const table = new Table()
		.header([
			"Path",
			"Branch",
		])
		.border(false)
		.padding(1);

	// Add rows for each repository
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

		// Add dirty indicator if repository has uncommitted changes
		if (repo.isClean === false) {
			branchDisplay += " *";
		}

		table.push([
			path,
			branchDisplay,
		]);
	}

	console.log(table.toString());

	// Show summary
	console.log("");
	console.log(gray("SUMMARY"));
	const summaryParts = [];
	if (clean > 0) summaryParts.push(green(`✅ ${clean} clean`));
	if (modified > 0) summaryParts.push(yellow(`⚠️  ${modified} modified`));
	if (wrongBranch > 0) summaryParts.push(yellow(`🌿 ${wrongBranch} wrong branch`));
	if (missing > 0) summaryParts.push(red(`❌ ${missing} missing`));

	console.log(summaryParts.join("  "));
	console.log("");

	// Show verbose details if requested
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
