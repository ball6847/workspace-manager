import { Result } from "typescript-result";
import { AppError, AppErrorCode } from "../libs/app-error.ts";
import { workspaceDirectory } from "../domain/workspaces.ts";
import type { ConfigStore } from "../ports/config-store.ts";
import type { FileSystemPort } from "../ports/file-system.ts";
import type { GitPortFactory } from "../ports/git.ts";
import type { GoWorkPortFactory } from "../ports/go-work.ts";
import type { HookContext, HookExecutionResult, HookRunner } from "../ports/hook-runner.ts";
import type { Logger } from "../ports/logger.ts";
import type { WorkspaceDiscoveryOptions, WorkspaceDiscoveryPort } from "../ports/workspace-discovery.ts";
import type { WorkspaceConfig } from "../types/config.ts";
import { WorkspaceManager } from "./workspace-manager.ts";

export type OpenWorkspaceInfo = {
	path: string;
	url: string;
	branch: string;
	isActive: boolean;
	isGolang: boolean;
	directory: string;
	exists: boolean;
	displayName: string;
};

export type OpenListReport = {
	workspaceRoot: string;
	configPath: string;
	editor: string | null;
	workspaces: OpenWorkspaceInfo[];
};

export type OpenPrepareReport = {
	workspaceRoot: string;
	configPath: string;
	directory: string;
	path: string;
	newlyEnabled: boolean;
	globalHookResults: HookExecutionResult[];
	workspaceHookResults: HookExecutionResult[];
};

export type OpenServiceDeps = {
	createDiscovery(options: WorkspaceDiscoveryOptions): WorkspaceDiscoveryPort;
	createConfigStore(configPath: string): ConfigStore;
	gitFactory: GitPortFactory;
	goWorkFactory: GoWorkPortFactory;
	fileSystem: FileSystemPort;
	createHookRunner(debug?: boolean): HookRunner;
	logger: Logger;
};

export type OpenListInput = {
	config?: string;
	workspaceRoot?: string;
	debug?: boolean;
	editor?: string;
};

export type OpenPrepareInput = {
	config?: string;
	workspaceRoot?: string;
	debug?: boolean;
	path: string;
	enableIfDisabled: boolean;
	editor?: string;
};

export class OpenService {
	constructor(private readonly deps: OpenServiceDeps) {}

	async listWorkspaces(input: OpenListInput): Promise<Result<OpenListReport, AppError>> {
		const { workspaceRoot, configPath, config } = await this.loadConfig(input);
		if (!workspaceRoot) {
			return Result.error(config as AppError);
		}

		const workspaces: OpenWorkspaceInfo[] = [];

		for (const workspace of config.workspaces) {
			const workspaceDir = workspaceDirectory(workspaceRoot, workspace.path);
			const exists = await this.deps.fileSystem.isDir(workspaceDir);

			const statusParts: string[] = [];
			if (!workspace.active) {
				statusParts.push("disabled");
			}
			if (!exists.ok) {
				statusParts.push("not found");
			}

			const status = statusParts.length > 0 ? ` (${statusParts.join(", ")})` : "";

			workspaces.push({
				path: workspace.path,
				url: workspace.url,
				branch: workspace.branch,
				isActive: workspace.active,
				isGolang: workspace.isGolang,
				directory: workspaceDir,
				exists: exists.ok,
				displayName: `${workspace.active ? "◉" : "○"} ${workspace.path} (${workspace.branch})${status}`,
			});
		}

		const editor = this.resolveEditor(config, input.editor);

		return Result.ok({ workspaceRoot, configPath, editor, workspaces });
	}

	async prepareWorkspace(input: OpenPrepareInput): Promise<Result<OpenPrepareReport, AppError>> {
		const loaded = await this.loadConfig(input);
		if (!loaded.workspaceRoot) {
			return Result.error(loaded.config as AppError);
		}

		const { workspaceRoot, configPath, config } = loaded;
		const debug = input.debug ?? false;

		const workspace = config.workspaces.find((w) => w.path === input.path);
		if (!workspace) {
			return Result.error(new AppError(AppErrorCode.INTERNAL, `Workspace not found: ${input.path}`));
		}

		const workspaceManager = new WorkspaceManager(workspaceRoot, this.deps.goWorkFactory, this.deps.gitFactory);
		const hookExecutor = this.deps.createHookRunner(debug);
		const hookContext: HookContext = { root: workspaceRoot, path: workspace.path };
		const report: OpenPrepareReport = {
			workspaceRoot,
			configPath,
			directory: workspaceDirectory(workspaceRoot, workspace.path),
			path: workspace.path,
			newlyEnabled: false,
			globalHookResults: [],
			workspaceHookResults: [],
		};

		if (!workspace.active) {
			if (!input.enableIfDisabled) {
				return Result.error(new AppError(AppErrorCode.CANCELLED, `Workspace ${workspace.path} is disabled`));
			}

			workspace.active = true;

			const configStore = this.deps.createConfigStore(configPath);
			const writeResult = await configStore.writeConfig(config);
			if (!writeResult.ok) {
				return Result.error(writeResult.error);
			}

			report.newlyEnabled = true;

			const checkoutResult = await workspaceManager.checkoutWorkspace(workspace.url, workspace.path, workspace.branch);
			if (!checkoutResult.ok) {
				return Result.error(checkoutResult.error);
			}

			if (config.hooks?.postSyncHooks?.length) {
				const globalHooksResult = await hookExecutor.executeHooks(config.hooks.postSyncHooks, hookContext);
				if (!globalHooksResult.ok) {
					return Result.error(globalHooksResult.error);
				}
				report.globalHookResults = globalHooksResult.value;
			}

			if (workspace.postSyncHooks?.length) {
				const workspaceHooksResult = await hookExecutor.executeHooks(workspace.postSyncHooks, hookContext);
				if (!workspaceHooksResult.ok) {
					return Result.error(workspaceHooksResult.error);
				}
				report.workspaceHookResults = workspaceHooksResult.value;
			}
		}

		return Result.ok(report);
	}

	private resolveEditor(config: WorkspaceConfig, cliEditor?: string): string | null {
		if (cliEditor && cliEditor.trim().length > 0) {
			return cliEditor;
		}
		if (config.editor && config.editor.trim().length > 0) {
			return config.editor;
		}
		const envEditor = Deno.env.get("EDITOR");
		if (envEditor && envEditor.trim().length > 0) {
			return envEditor;
		}
		const visualEditor = Deno.env.get("VISUAL");
		if (visualEditor && visualEditor.trim().length > 0) {
			return visualEditor;
		}
		return null;
	}

	private async loadConfig(
		input: { config?: string; workspaceRoot?: string },
	): Promise<{ workspaceRoot: string; configPath: string; config: WorkspaceConfig } | { workspaceRoot: null; configPath: string; config: AppError }> {
		const discovery = this.deps.createDiscovery({
			config: input.config,
			workspaceRoot: input.workspaceRoot,
		});

		const discoverResult = await discovery.discover();
		if (!discoverResult.ok) {
			return { workspaceRoot: null, configPath: "", config: discoverResult.error };
		}

		const { workspaceRoot, configPath } = discoverResult.value;
		const configStore = this.deps.createConfigStore(configPath);
		const configResult = await configStore.getWorkspaceConfig(workspaceRoot);
		if (!configResult.ok) {
			return { workspaceRoot: null, configPath, config: configResult.error };
		}

		return { workspaceRoot, configPath, config: configResult.value };
	}
}
