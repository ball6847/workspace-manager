import type { Result } from "typescript-result";
import type { AppError } from "../libs/app-error.ts";
import type { WorkspaceConfig, WorkspaceConfigItem } from "../types/config.ts";

export type ConfigStore = {
	readonly configPath: string;
	getConfig(): Promise<Result<WorkspaceConfig, AppError>>;
	writeConfig(config: WorkspaceConfig): Promise<Result<void, AppError>>;
	getWorkspaceConfig(workspaceRoot: string): Promise<Result<WorkspaceConfig, AppError>>;
	validateWorkspaceDir(workspaceRoot: string): Promise<Result<void, AppError>>;
	getActiveWorkspaces(config: WorkspaceConfig): WorkspaceConfigItem[];
	getInactiveWorkspaces(config: WorkspaceConfig): WorkspaceConfigItem[];
	enableWorkspace(workspacePath: string, config: WorkspaceConfig): Result<void, AppError>;
};
