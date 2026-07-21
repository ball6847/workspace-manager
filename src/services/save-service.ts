import { Result } from "typescript-result";
import type { AppError } from "../libs/app-error.ts";
import { getActiveWorkspaces, workspaceDirectory } from "../domain/workspaces.ts";
import type { ConfigStore } from "../ports/config-store.ts";
import type { FileSystemPort } from "../ports/file-system.ts";
import type { GitPortFactory } from "../ports/git.ts";
import type { Logger } from "../ports/logger.ts";
import type { WorkspaceDiscoveryOptions, WorkspaceDiscoveryPort } from "../ports/workspace-discovery.ts";

export type SaveChange = {
	path: string;
	oldBranch: string;
	newBranch: string;
};

export type SaveReport = {
	workspaceRoot: string;
	configPath: string;
	updatedCount: number;
	errorCount: number;
	changes: SaveChange[];
};

export type SaveServiceDeps = {
	createDiscovery(options: WorkspaceDiscoveryOptions): WorkspaceDiscoveryPort;
	createConfigStore(configPath: string): ConfigStore;
	gitFactory: GitPortFactory;
	fileSystem: FileSystemPort;
	logger: Logger;
};

export type SaveInput = {
	config?: string;
	workspaceRoot?: string;
	debug?: boolean;
};

export class SaveService {
	constructor(private readonly deps: SaveServiceDeps) {}

	async run(input: SaveInput): Promise<Result<SaveReport, AppError>> {
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

		const configStore = this.deps.createConfigStore(configPath);
		const parseResult = await configStore.getConfig();
		if (!parseResult.ok) {
			return Result.error(parseResult.error);
		}
		const config = parseResult.value;

		if (debug) {
			this.deps.logger.info("Scanning active workspaces for current branches", { workspaceRoot, configPath });
		}

		const activeWorkspaces = getActiveWorkspaces(config);
		const report: SaveReport = {
			workspaceRoot,
			configPath,
			updatedCount: 0,
			errorCount: 0,
			changes: [],
		};

		if (activeWorkspaces.length === 0) {
			return Result.ok(report);
		}

		for (const workspace of activeWorkspaces) {
			const workspacePath = workspaceDirectory(workspaceRoot, workspace.path);

			const dirExists = await this.deps.fileSystem.isDir(workspacePath);
			if (!dirExists.ok) {
				this.deps.logger.warn(`Workspace directory not found: ${workspace.path}`);
				report.errorCount++;
				continue;
			}

			const git = this.deps.gitFactory(workspacePath);

			const isRepo = await git.isRepository();
			if (!isRepo.ok || !isRepo.value) {
				this.deps.logger.warn(`Not a git repository: ${workspace.path}`);
				report.errorCount++;
				continue;
			}

			const currentBranch = await git.getCurrentBranch();
			if (!currentBranch.ok) {
				this.deps.logger.error(`Failed to get current branch for ${workspace.path}: ${currentBranch.error.message}`);
				report.errorCount++;
				continue;
			}

			const newBranch = currentBranch.value;

			if (workspace.branch !== newBranch) {
				const oldBranch = workspace.branch;
				if (debug) {
					this.deps.logger.debug(`Updating ${workspace.path}: ${oldBranch} → ${newBranch}`);
				}
				workspace.branch = newBranch;
				report.updatedCount++;
				report.changes.push({ path: workspace.path, oldBranch, newBranch });
			} else {
				if (debug) {
					this.deps.logger.debug(`${workspace.path}: ${workspace.branch} (no change)`);
				}
			}
		}

		if (report.updatedCount > 0) {
			const writeResult = await configStore.writeConfig(config);
			if (!writeResult.ok) {
				return Result.error(writeResult.error);
			}
		}

		return Result.ok(report);
	}
}
