import { Result } from "typescript-result";
import type { AppError } from "../libs/app-error.ts";
import { processConcurrentlyWithResults } from "../libs/concurrent.ts";
import { getActiveWorkspaces, workspaceDirectory } from "../domain/workspaces.ts";
import type { ConfigStore } from "../ports/config-store.ts";
import type { FileSystemPort } from "../ports/file-system.ts";
import type { GitPortFactory } from "../ports/git.ts";
import type { WorkspaceDiscoveryOptions, WorkspaceDiscoveryPort } from "../ports/workspace-discovery.ts";
import type { WorkspaceConfigItem } from "../types/config.ts";
import { blue } from "@std/fmt/colors";

export type StatusRepository = {
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

export type StatusReport = {
	workspaceRoot: string;
	configPath: string;
	repositories: StatusRepository[];
};

export type StatusServiceDeps = {
	createDiscovery(options: WorkspaceDiscoveryOptions): WorkspaceDiscoveryPort;
	createConfigStore(configPath: string): ConfigStore;
	gitFactory: GitPortFactory;
	fileSystem: FileSystemPort;
};

export type StatusInput = {
	config?: string;
	workspaceRoot?: string;
	debug?: boolean;
	concurrency?: number;
	verbose?: boolean;
};

export class StatusService {
	constructor(private readonly deps: StatusServiceDeps) {}

	async run(input: StatusInput): Promise<Result<StatusReport, AppError>> {
		const discovery = this.deps.createDiscovery({
			config: input.config,
			workspaceRoot: input.workspaceRoot,
		});

		const discoverResult = await discovery.discover();
		if (!discoverResult.ok) {
			return Result.error(discoverResult.error);
		}

		const { workspaceRoot, configPath } = discoverResult.value;
		const debug = input.debug ?? false;
		const concurrency = input.concurrency ?? 4;
		const verbose = input.verbose ?? false;

		const configStore = this.deps.createConfigStore(configPath);
		const configResult = await configStore.getConfig();
		if (!configResult.ok) {
			return Result.error(configResult.error);
		}
		const config = configResult.value;

		const activeWorkspaces = getActiveWorkspaces(config);

		if (debug) {
			console.log(blue(`Checking status for ${activeWorkspaces.length} active repositories`));
		}

		if (activeWorkspaces.length === 0) {
			return Result.ok({ workspaceRoot, configPath, repositories: [] });
		}

		const statusResults = await processConcurrentlyWithResults(
			activeWorkspaces,
			async (workspace) => await this.processSingleWorkspace(workspace, workspaceRoot, verbose),
			concurrency,
		);

		const repositories = statusResults.map((result) => {
			if (!result.ok) {
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

		return Result.ok({ workspaceRoot, configPath, repositories });
	}

	private async processSingleWorkspace(
		workspace: WorkspaceConfigItem,
		workspaceRoot: string,
		verbose: boolean,
	): Promise<Result<StatusRepository, AppError>> {
		const workspacePath = workspaceDirectory(workspaceRoot, workspace.path);
		const git = this.deps.gitFactory(workspacePath);
		const status: StatusRepository = {
			path: workspace.path,
			url: workspace.url,
			trackingBranch: workspace.branch,
			isGoModule: workspace.isGolang,
			active: workspace.active,
			exists: false,
		};

		const dir = await this.deps.fileSystem.isDir(workspacePath);
		if (!dir.ok) {
			status.error = "Directory does not exist";
			return Result.ok(status);
		}

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

		const currentBranch = await git.getCurrentBranch();
		if (!currentBranch.ok) {
			status.error = "Failed to get current branch";
			return Result.ok(status);
		}
		status.currentBranch = currentBranch.value;

		const isClean = await git.isWorkingDirectoryClean();
		if (!isClean.ok) {
			status.error = "Failed to check working directory";
			return Result.ok(status);
		}
		status.isClean = isClean.value;

		if (!isClean.value || verbose) {
			const fileStatus = await git.getPorcelainStatus();
			if (fileStatus.ok) {
				status.modifiedFiles = fileStatus.value.modified;
				status.untrackedFiles = fileStatus.value.untracked;
			}
		}

		return Result.ok(status);
	}
}
