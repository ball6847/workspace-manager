import { parse, stringify } from "@std/yaml";
import { Result } from "typescript-result";
import { AppError, AppErrorCode } from "../libs/app-error.ts";
import { wrapErrorResult } from "../libs/errors.ts";
import { parseWorkspaceConfig } from "../domain/config-schema.ts";
import type { ConfigStore } from "../ports/config-store.ts";
import type { WorkspaceConfig, WorkspaceConfigItem } from "../types/config.ts";

export class ConfigManager implements ConfigStore {
	private _cachedConfig: WorkspaceConfig | null = null;
	private _configFileMtime: number | null = null;

	constructor(private readonly configFile: string) {}

	/**
	 * Get the config file path
	 */
	get configPath(): string {
		return this.configFile;
	}

	/**
	 * Get workspace config with caching
	 */
	async getConfig(): Promise<Result<WorkspaceConfig, AppError>> {
		// Check if file mtime changed (invalidate cache if needed)
		const statResult = await Result.fromAsyncCatching(() => Deno.stat(this.configFile));
		if (!statResult.ok) {
			const code = statResult.error instanceof Deno.errors.NotFound ? AppErrorCode.CONFIG_NOT_FOUND : AppErrorCode.INTERNAL;
			return wrapErrorResult<WorkspaceConfig>(`Unable to stat config file`, statResult.error, code);
		}

		const currentMtime = statResult.value.mtime?.getTime() ?? null;

		// Return cached config if valid
		if (this._cachedConfig !== null && this._configFileMtime !== null && currentMtime === this._configFileMtime) {
			return Result.ok(this._cachedConfig);
		}

		// Parse and cache result if not cached or cache is invalid
		const parseResult = await this._parseConfig();
		if (!parseResult.ok) {
			return Result.error(parseResult.error);
		}

		// Update cache
		this._cachedConfig = parseResult.value;
		this._configFileMtime = currentMtime;

		return Result.ok(this._cachedConfig);
	}

	/**
	 * Parse workspace config file (private)
	 */
	private async _parseConfig(): Promise<Result<WorkspaceConfig, AppError>> {
		const readResult = await Result.fromAsyncCatching(async () => {
			const contents = await Deno.readTextFile(this.configFile);
			return parse(contents);
		});

		if (!readResult.ok) {
			return wrapErrorResult<WorkspaceConfig>(`Unable to read or parse config file`, readResult.error as Error, AppErrorCode.CONFIG_INVALID);
		}

		return parseWorkspaceConfig(readResult.value);
	}

	/**
	 * Write workspace config to file
	 */
	async writeConfig(config: WorkspaceConfig): Promise<Result<void, AppError>> {
		const result = await Result.fromAsyncCatching(async () => {
			const yamlContent = stringify(config);
			await Deno.writeTextFile(this.configFile, yamlContent);
		});

		if (!result.ok) {
			return wrapErrorResult(`Unable to write config file`, result.error as Error, AppErrorCode.CONFIG_WRITE_FAILED);
		}

		// Clear cache and update mtime after successful write
		this._cachedConfig = null;
		const statResult = await Result.fromAsyncCatching(() => Deno.stat(this.configFile));
		if (statResult.ok) {
			this._configFileMtime = statResult.value.mtime?.getTime() ?? null;
		}

		return Result.ok();
	}

	async validateWorkspaceDir(workspaceRoot: string): Promise<Result<void, AppError>> {
		const stat = await Result.fromAsyncCatching(() => Deno.stat(workspaceRoot));
		if (!stat.ok) {
			return wrapErrorResult(`Workspace directory is not a directory`, stat.error);
		}
		if (!stat.value.isDirectory) {
			return Result.error(new AppError(AppErrorCode.PATH_INVALID, `Workspace directory is not a directory`));
		}
		return Result.ok();
	}

	getActiveWorkspaces(config: WorkspaceConfig): WorkspaceConfigItem[] {
		return config.workspaces.filter((item) => item.active);
	}

	getInactiveWorkspaces(config: WorkspaceConfig): WorkspaceConfigItem[] {
		return config.workspaces.filter((item) => !item.active);
	}

	async getWorkspaceConfig(workspaceRoot: string): Promise<Result<WorkspaceConfig, AppError>> {
		const validated = await this.validateWorkspaceDir(workspaceRoot);
		if (!validated.ok) {
			return Result.error(validated.error);
		}

		const parseResult = await this.getConfig();
		if (!parseResult.ok) {
			return Result.error(parseResult.error);
		}

		return parseResult;
	}

	enableWorkspace(workspacePath: string, config: WorkspaceConfig): Result<void, AppError> {
		// Find workspace by path
		const workspace = config.workspaces.find((item) => item.path === workspacePath);

		// Early return if workspace not found
		if (!workspace) {
			return Result.error(new AppError(AppErrorCode.CONFIG_INVALID, `Workspace not found at path: ${workspacePath}`));
		}

		// Early return if already active
		if (workspace.active) {
			return Result.ok();
		}

		// Enable the workspace
		workspace.active = true;

		return Result.ok();
	}
}
