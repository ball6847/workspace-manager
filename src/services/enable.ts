import { Result } from "typescript-result";
import type { AppError } from "../libs/app-error.ts";
import type { ConfigStore } from "../ports/config-store.ts";
import type { WorkspaceDiscoveryOptions, WorkspaceDiscoveryPort } from "../ports/workspace-discovery.ts";
import { blue } from "@std/fmt/colors";

export type EnableServiceDeps = {
	createDiscovery(options: WorkspaceDiscoveryOptions): WorkspaceDiscoveryPort;
	createConfigStore(configPath: string): ConfigStore;
};

export type EnableInput = {
	config?: string;
	workspaceRoot?: string;
	debug?: boolean;
	paths: string[];
};

export type EnableReport = {
	workspaceRoot: string;
	configPath: string;
	changed: boolean;
	enabledPaths: string[];
	disabledPaths: string[];
};

export class EnableService {
	constructor(private readonly deps: EnableServiceDeps) {}

	async enablePaths(input: EnableInput): Promise<Result<EnableReport, AppError>> {
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

		if (config.workspaces.length === 0) {
			return Result.ok({
				workspaceRoot,
				configPath,
				changed: false,
				enabledPaths: [],
				disabledPaths: [],
			});
		}

		if (debug) {
			console.log(blue(`Updating active states for ${config.workspaces.length} workspaces`));
		}

		const enabledPaths: string[] = [];
		const disabledPaths: string[] = [];
		let changed = false;

		for (const workspace of config.workspaces) {
			const wasActive = workspace.active;
			workspace.active = input.paths.includes(workspace.path);
			if (wasActive !== workspace.active) {
				changed = true;
				if (workspace.active) {
					enabledPaths.push(workspace.path);
				} else {
					disabledPaths.push(workspace.path);
				}
			}
		}

		if (!changed) {
			return Result.ok({
				workspaceRoot,
				configPath,
				changed: false,
				enabledPaths: [],
				disabledPaths: [],
			});
		}

		const writeResult = await configStore.writeConfig(config);
		if (!writeResult.ok) {
			return Result.error(writeResult.error);
		}

		return Result.ok({
			workspaceRoot,
			configPath,
			changed: true,
			enabledPaths,
			disabledPaths,
		});
	}
}
