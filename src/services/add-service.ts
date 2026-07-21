import { Result } from "typescript-result";
import { AppError } from "../libs/app-error.ts";
import { extractRepoName } from "../domain/workspaces.ts";
import type { ConfigStore } from "../ports/config-store.ts";
import type { Logger } from "../ports/logger.ts";
import type { WorkspaceDiscoveryOptions, WorkspaceDiscoveryPort } from "../ports/workspace-discovery.ts";
import type { WorkspaceConfigItem } from "../types/config.ts";

export type AddServiceDeps = {
	createDiscovery(options: WorkspaceDiscoveryOptions): WorkspaceDiscoveryPort;
	createConfigStore(configPath: string): ConfigStore;
	logger?: Logger;
};

export type AddInput = {
	config?: string;
	workspaceRoot?: string;
	debug?: boolean;
	repo: string;
	path?: string;
	branch?: string;
	isGolang?: boolean;
};

export type AddResult = {
	added: boolean;
	workspacePath: string;
	alreadyExisted: boolean;
	workspaceRoot: string;
	configPath: string;
};

export class AddService {
	constructor(private readonly deps: AddServiceDeps) {}

	async add(input: AddInput): Promise<Result<AddResult, AppError>> {
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

		const workspacePath = input.path ?? extractRepoName(input.repo);
		const branch = input.branch ?? "main";
		const isGolang = input.isGolang ?? false;

		if (debug) {
			this.deps.logger?.info(`Adding workspace: ${workspacePath} from ${input.repo}`, { workspaceRoot, configPath });
		}

		const existingWorkspace = config.workspaces.find((w) => w.path === workspacePath || w.url === input.repo);
		if (existingWorkspace) {
			this.deps.logger?.warn(`Workspace already exists: ${existingWorkspace.path} (${existingWorkspace.url})`);
			return Result.ok({
				added: false,
				workspacePath,
				alreadyExisted: true,
				workspaceRoot,
				configPath,
			});
		}

		const newWorkspace: WorkspaceConfigItem = {
			url: input.repo,
			path: workspacePath,
			branch,
			isGolang,
			active: true,
		};

		config.workspaces.push(newWorkspace);

		const writeResult = await configStore.writeConfig(config);
		if (!writeResult.ok) {
			return Result.error(writeResult.error);
		}

		this.deps.logger?.info(`Successfully added workspace: ${workspacePath}`);
		return Result.ok({
			added: true,
			workspacePath,
			alreadyExisted: false,
			workspaceRoot,
			configPath,
		});
	}
}
