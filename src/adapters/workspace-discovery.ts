import { join, resolve } from "@std/path";
import { Result } from "typescript-result";
import { AppError, AppErrorCode } from "../libs/app-error.ts";
import { isDir } from "./file-system.ts";
import type { DiscoveryResult, WorkspaceDiscoveryOptions, WorkspaceDiscoveryPort } from "../ports/workspace-discovery.ts";

export class WorkspaceDiscovery implements WorkspaceDiscoveryPort {
	private readonly configFile: string;
	private readonly startDir: string;
	private readonly providedConfig: string | undefined;
	private readonly providedWorkspaceRoot: string | undefined;

	private static readonly DEFAULT_CONFIG_FILE = "workspace.yml";
	private static readonly MAX_DEPTH = 50;

	constructor(options: WorkspaceDiscoveryOptions = {}) {
		this.configFile = options.configFile ?? WorkspaceDiscovery.DEFAULT_CONFIG_FILE;
		this.startDir = options.startDir ?? Deno.cwd();
		this.providedConfig = options.config;
		this.providedWorkspaceRoot = options.workspaceRoot;
	}

	/**
	 * Get the configured config file name
	 */
	getConfigFileName(): string {
		return this.configFile;
	}

	/**
	 * Discover workspace config file and workspace root
	 *
	 * Resolution order:
	 * 1. If both config and workspaceRoot provided → use them directly
	 * 2. If only config provided → use it, derive workspaceRoot from its directory
	 * 3. If only workspaceRoot provided → look for config file there
	 * 4. If neither provided → discover workspace.yml in current and parent directories
	 */
	async discover(): Promise<Result<DiscoveryResult, AppError>> {
		// Case 1: Both provided - use directly
		if (this.providedConfig && this.providedWorkspaceRoot) {
			const configPath = resolve(this.providedWorkspaceRoot, this.providedConfig);
			return Result.ok({
				workspaceRoot: this.providedWorkspaceRoot,
				configPath,
			});
		}

		// Case 2: Only config provided - use config, derive workspaceRoot from its directory
		if (this.providedConfig) {
			const configPath = resolve(this.providedConfig);
			const configDir = join(configPath, "..");
			return Result.ok({
				workspaceRoot: configDir,
				configPath,
			});
		}

		// Case 3: Only workspaceRoot provided - look for config file in workspaceRoot
		if (this.providedWorkspaceRoot) {
			const workspaceRoot = resolve(this.providedWorkspaceRoot);
			const configPath = join(workspaceRoot, this.configFile);

			const exists = await isDir(workspaceRoot);
			if (!exists.ok) {
				return Result.error(
					new AppError(AppErrorCode.PATH_INVALID, `Workspace root is not a valid directory: ${workspaceRoot}`, { cause: exists.error }),
				);
			}

			return Result.ok({
				workspaceRoot,
				configPath,
			});
		}

		// Case 4: Neither provided - discover by searching cwd and parents
		return this.searchParentDirs(this.startDir, 0);
	}

	/**
	 * Check if a config file exists at a specific path
	 */
	async configExistsAt(path: string): Promise<Result<boolean, AppError>> {
		const configPath = join(path, this.configFile);

		const stat = await Result.fromAsyncCatching(() => Deno.stat(configPath));

		if (!stat.ok) {
			// File doesn't exist - this is an expected case, return false
			if (stat.error instanceof Deno.errors.NotFound) {
				return Result.ok(false);
			}
			// Real error (permission denied, etc.) - wrap and return
			return Result.error(
				new AppError(AppErrorCode.INTERNAL, "Failed to check if config file exists", { cause: stat.error as Error }),
			);
		}

		return Result.ok(stat.value.isFile);
	}

	/**
	 * Search for config file in parent directories recursively
	 */
	private async searchParentDirs(currentDir: string, depth: number): Promise<Result<DiscoveryResult, AppError>> {
		// Early return if we've exceeded max depth
		if (depth >= WorkspaceDiscovery.MAX_DEPTH) {
			return Result.error(
				new AppError(
					AppErrorCode.CONFIG_NOT_FOUND,
					`Reached maximum search depth (${WorkspaceDiscovery.MAX_DEPTH}) while looking for ${this.configFile}`,
				),
			);
		}

		// Check if start directory is valid
		const startDirValid = await isDir(currentDir);
		if (!startDirValid.ok) {
			return Result.error(
				new AppError(AppErrorCode.PATH_INVALID, `Starting directory is not valid: ${currentDir}`, { cause: startDirValid.error }),
			);
		}

		// Check if config file exists in current directory
		const exists = await this.configExistsAt(currentDir);
		if (!exists.ok) {
			return Result.error(exists.error);
		}

		if (exists.value) {
			return Result.ok({
				workspaceRoot: currentDir,
				configPath: join(currentDir, this.configFile),
			});
		}

		// Get parent directory
		const parentDir = join(currentDir, "..");

		// Check if we've reached the filesystem root
		const parentValid = await isDir(parentDir);
		if (!parentValid.ok) {
			return Result.error(
				new AppError(
					AppErrorCode.CONFIG_NOT_FOUND,
					`Reached filesystem root without finding ${this.configFile}. Searched from: ${this.startDir}`,
				),
			);
		}

		// Early return if parent is the same as current (reached root)
		if (parentDir === currentDir || parentDir === ".") {
			return Result.error(
				new AppError(
					AppErrorCode.CONFIG_NOT_FOUND,
					`Reached filesystem root without finding ${this.configFile}. Searched from: ${this.startDir}`,
				),
			);
		}

		// Recursively search parent directory
		return this.searchParentDirs(parentDir, depth + 1);
	}
}
