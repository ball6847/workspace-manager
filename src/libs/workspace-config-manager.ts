import { parseConfigFile, type WorkspaceConfig, type WorkspaceConfigItem, writeConfigFile } from "./config.ts";
import { isDir } from "./file.ts";
import { Result } from "typescript-result";
import { ErrorWithCause } from "./errors.ts";

export class WorkspaceConfigManager {
	constructor(private readonly configFile: string) {}

	async parseConfig(): Promise<Result<WorkspaceConfig, Error>> {
		return await parseConfigFile(this.configFile);
	}

	async writeConfig(config: WorkspaceConfig): Promise<Result<void, Error>> {
		return await writeConfigFile(config, this.configFile);
	}

	async validateWorkspaceDir(workspaceRoot: string): Promise<Result<void, Error>> {
		const stat = await Result.fromAsyncCatching(() => Deno.stat(workspaceRoot));
		if (!stat.ok) {
			return Result.error(new ErrorWithCause(`Workspace directory is not a directory`, stat.error));
		}
		if (!stat.value.isDirectory) {
			return Result.error(new Error(`Workspace directory is not a directory`));
		}
		return Result.ok();
	}

	getActiveWorkspaces(config: WorkspaceConfig): WorkspaceConfigItem[] {
		return config.workspaces.filter((item) => item.active);
	}

	getInactiveWorkspaces(config: WorkspaceConfig): WorkspaceConfigItem[] {
		return config.workspaces.filter((item) => !item.active);
	}

	async getWorkspaceConfig(workspaceRoot: string): Promise<Result<WorkspaceConfig, Error>> {
		const validated = await this.validateWorkspaceDir(workspaceRoot);
		if (!validated.ok) {
			return Result.error(validated.error);
		}

		const parseConfig = await this.parseConfig();
		if (!parseConfig.ok) {
			return Result.error(parseConfig.error);
		}

		return parseConfig;
	}
}
