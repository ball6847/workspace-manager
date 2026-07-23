import type { Result } from "typescript-result";
import type { AppError } from "../libs/app-error.ts";

export type WorkspaceDiscoveryOptions = {
	/** Config file path (if provided, discovery is skipped) */
	config?: string;
	/** Workspace root directory (if provided, discovery may be skipped) */
	workspaceRoot?: string;
	/** Config file name for discovery (default: workspace.yml) */
	configFile?: string;
	/** Starting directory for discovery (defaults to current working directory) */
	startDir?: string;
};

export type DiscoveryResult = {
	/** The directory containing the workspace config file (workspace root) */
	workspaceRoot: string;
	/** Full path to the discovered config file */
	configPath: string;
};

export type WorkspaceDiscoveryPort = {
	discover(): Promise<Result<DiscoveryResult, AppError>>;
	configExistsAt(path: string): Promise<Result<boolean, AppError>>;
	getConfigFileName(): string;
};
