import { Result } from "typescript-result";
import { AppError, AppErrorCode } from "../libs/app-error.ts";
import type { ConfigStore } from "../ports/config-store.ts";
import type { FileSystemPort } from "../ports/file-system.ts";
import type { GitPort } from "../ports/git.ts";
import type { GoAvailabilityPort, GoWorkPort } from "../ports/go-work.ts";
import type { HookContext, HookExecutionResult, HookRunner } from "../ports/hook-runner.ts";
import type { LogFields, Logger } from "../ports/logger.ts";
import type { DiscoveryResult, WorkspaceDiscoveryPort } from "../ports/workspace-discovery.ts";
import type { PostSyncHook, WorkspaceConfig, WorkspaceConfigItem } from "../types/config.ts";

export type FakeGitState = {
	currentBranch?: string;
	isRepo?: boolean;
	isClean?: boolean;
	modifiedFiles?: number;
	untrackedFiles?: number;
	failNext?: string;
};

export class FakeGit implements GitPort {
	calls: { method: string; args: unknown[] }[] = [];

	constructor(private readonly state: FakeGitState = {}) {}

	private record(method: string, args: unknown[]): void {
		this.calls.push({ method, args });
	}

	submoduleAdd(url: string, path: string, branch?: string): Promise<Result<void, AppError>> {
		this.record("submoduleAdd", [url, path, branch]);
		return Promise.resolve(this.nextResult());
	}

	submoduleRemove(path: string): Promise<Result<void, AppError>> {
		this.record("submoduleRemove", [path]);
		return Promise.resolve(this.nextResult());
	}

	checkoutBranch(branch: string): Promise<Result<void, AppError>> {
		this.record("checkoutBranch", [branch]);
		return Promise.resolve(this.nextResult());
	}

	getCurrentBranch(): Promise<Result<string, AppError>> {
		this.record("getCurrentBranch", []);
		if (this.state.failNext === "getCurrentBranch") {
			return Promise.resolve(Result.error(new AppError(AppErrorCode.GIT_FAILED, "fake getCurrentBranch failure")));
		}
		return Promise.resolve(Result.ok(this.state.currentBranch ?? "main"));
	}

	pullOriginBranch(branch: string): Promise<Result<void, AppError>> {
		this.record("pullOriginBranch", [branch]);
		return Promise.resolve(this.nextResult());
	}

	isRepository(): Promise<Result<boolean, AppError>> {
		this.record("isRepository", []);
		return Promise.resolve(Result.ok(this.state.isRepo ?? true));
	}

	isWorkingDirectoryClean(): Promise<Result<boolean, AppError>> {
		this.record("isWorkingDirectoryClean", []);
		return Promise.resolve(Result.ok(this.state.isClean ?? true));
	}

	getPorcelainStatus(): Promise<Result<{ modified: number; untracked: number }, AppError>> {
		this.record("getPorcelainStatus", []);
		return Promise.resolve(Result.ok({ modified: this.state.modifiedFiles ?? 0, untracked: this.state.untrackedFiles ?? 0 }));
	}

	stash(message?: string): Promise<Result<void, AppError>> {
		this.record("stash", [message]);
		return Promise.resolve(this.nextResult());
	}

	stashPop(): Promise<Result<void, AppError>> {
		this.record("stashPop", []);
		return Promise.resolve(this.nextResult());
	}

	fetch(): Promise<Result<void, AppError>> {
		this.record("fetch", []);
		return Promise.resolve(this.nextResult());
	}

	private nextResult(): Result<void, AppError> {
		if (this.state.failNext) {
			const method = this.state.failNext;
			this.state.failNext = undefined;
			return Result.error(new AppError(AppErrorCode.GIT_FAILED, `fake ${method} failure`));
		}
		return Result.ok();
	}
}

export class FakeConfigStore implements ConfigStore {
	configPath: string;
	config: WorkspaceConfig;
	writes: WorkspaceConfig[] = [];
	validated: string[] = [];

	constructor(configPath: string, config: WorkspaceConfig) {
		this.configPath = configPath;
		this.config = config;
	}

	getConfig(): Promise<Result<WorkspaceConfig, AppError>> {
		return Promise.resolve(Result.ok(this.config));
	}

	writeConfig(config: WorkspaceConfig): Promise<Result<void, AppError>> {
		this.writes.push(config);
		this.config = config;
		return Promise.resolve(Result.ok());
	}

	async getWorkspaceConfig(workspaceRoot: string): Promise<Result<WorkspaceConfig, AppError>> {
		const validated = await this.validateWorkspaceDir(workspaceRoot);
		if (!validated.ok) {
			return Result.error(validated.error);
		}
		return this.getConfig();
	}

	validateWorkspaceDir(workspaceRoot: string): Promise<Result<void, AppError>> {
		this.validated.push(workspaceRoot);
		return Promise.resolve(Result.ok());
	}

	getActiveWorkspaces(config: WorkspaceConfig): WorkspaceConfigItem[] {
		return config.workspaces.filter((item) => item.active);
	}

	getInactiveWorkspaces(config: WorkspaceConfig): WorkspaceConfigItem[] {
		return config.workspaces.filter((item) => !item.active);
	}

	enableWorkspace(workspacePath: string, config: WorkspaceConfig): Result<void, AppError> {
		const workspace = config.workspaces.find((item) => item.path === workspacePath);
		if (!workspace) {
			return Result.error(new AppError(AppErrorCode.INTERNAL, `Workspace not found at path: ${workspacePath}`));
		}
		workspace.active = true;
		return Result.ok();
	}
}

export class FakeLogger implements Logger {
	entries: { level: "debug" | "info" | "warn" | "error"; message: string; fields?: LogFields }[] = [];

	debug(message: string, fields?: LogFields): void {
		this.entries.push({ level: "debug", message, fields });
	}

	info(message: string, fields?: LogFields): void {
		this.entries.push({ level: "info", message, fields });
	}

	warn(message: string, fields?: LogFields): void {
		this.entries.push({ level: "warn", message, fields });
	}

	error(message: string, fields?: LogFields): void {
		this.entries.push({ level: "error", message, fields });
	}
}

export class FakeDiscovery implements WorkspaceDiscoveryPort {
	constructor(private readonly result: Result<DiscoveryResult, AppError>) {}

	discover(): Promise<Result<DiscoveryResult, AppError>> {
		return Promise.resolve(this.result);
	}

	configExistsAt(_path: string): Promise<Result<boolean, AppError>> {
		return Promise.resolve(Result.ok(true));
	}

	getConfigFileName(): string {
		return "workspace.yml";
	}
}

export class FakeFileSystem implements FileSystemPort {
	dirs = new Set<string>();

	isDir(path: string): Promise<Result<void, AppError>> {
		if (this.dirs.has(path)) {
			return Promise.resolve(Result.ok());
		}
		return Promise.resolve(Result.error(new AppError(AppErrorCode.PATH_INVALID, `directory does not exist: ${path}`)));
	}

	isDirectoryEmpty(_path: string): Promise<Result<boolean, AppError>> {
		return Promise.resolve(Result.ok(true));
	}
}

export class FakeHookRunner implements HookRunner {
	hooks: Array<{ hook: PostSyncHook; context: HookContext }> = [];

	executeHook(hook: PostSyncHook, context: HookContext): Promise<Result<HookExecutionResult, AppError>> {
		this.hooks.push({ hook, context });
		return Promise.resolve(
			Result.ok({
				success: true,
				exitCode: 0,
				stdout: "",
				stderr: "",
				duration: 0,
			}),
		);
	}

	executeHooks(hooks: PostSyncHook[], context: HookContext): Promise<Result<HookExecutionResult[], AppError>> {
		const results: HookExecutionResult[] = [];
		for (const hook of hooks) {
			this.hooks.push({ hook, context });
			results.push({
				success: true,
				exitCode: 0,
				stdout: "",
				stderr: "",
				duration: 0,
			});
		}
		return Promise.resolve(Result.ok(results));
	}
}

export class FakeGoWork implements GoWorkPort, GoAvailabilityPort {
	calls: { method: string; args: unknown[] }[] = [];
	available = true;
	failNext: string | undefined;

	private record(method: string, args: unknown[]): void {
		this.calls.push({ method, args });
	}

	init(): Promise<Result<void, AppError>> {
		this.record("init", []);
		return Promise.resolve(Result.ok());
	}

	use(paths: string[]): Promise<Result<void, AppError>> {
		this.record("use", [paths]);
		return Promise.resolve(Result.ok());
	}

	remove(paths: string[]): Promise<Result<void, AppError>> {
		this.record("remove", [paths]);
		return Promise.resolve(Result.ok());
	}

	isAvailable(): Promise<Result<boolean, AppError>> {
		this.record("isAvailable", []);
		return Promise.resolve(Result.ok(this.available));
	}
}
